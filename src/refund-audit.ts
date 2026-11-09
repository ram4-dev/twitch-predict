import {createHash} from 'node:crypto';
import type {Points} from './points.js';

/** Read-only audit of historical cancellations settled before automatic refunds existed.
 * Never writes: the report is the reviewable input for any later supervised repair.
 * Eligibility is restricted to refundable positions: cancellation/void refunds and the
 * legacy "payout=stake awaiting manual claim" shape. Ordinary winners/losers of resolved
 * markets are never debts. Refund credits are reconciled per account+market and consumed
 * so the same credit cannot pay two positions; ambiguous snapshots land in conflicts. */
export type RefundAuditRow={
  betId:string;accountId:string;accountName:string;marketKey:string;marketTitle:string;
  marketPhase:string;amount:number;pending:number;claimed:boolean;creditMethod?:string;creditedAt?:string;
};
export type RefundAuditReport={pending:RefundAuditRow[];conflicts:RefundAuditRow[];totalPending:number;generatedAt:string};

type SnapshotBet={id:string;accountId:string;marketKey:string;amount:number;payout:number;claimed:boolean;creditedAt?:string;creditMethod?:string};
type SnapshotMarket={key:string;phase:string;prediction:{title:string}};
type SnapshotLedger={accountId:string;kind:string;delta:number;marketKey?:string};

/** A market is refundable when it ended in the refunded terminal phase. */
const isRefundableMarket=(market:SnapshotMarket|undefined)=>!!market&&market.phase==='void';

/** A position carries a refund debt only when it was never credited or the legacy shape
 * left it payable by refund (payout=stake, unclaimed, no credit method). */
const hasRefundDebt=(bet:SnapshotBet)=>!bet.claimed&&bet.creditMethod===undefined
  ||(bet.creditMethod===undefined&&!bet.claimed&&bet.payout===bet.amount);

/** Reads the persisted Points snapshot without mutating it. */
export function auditHistoricalRefunds(points:Points):RefundAuditReport {
  let parsed:unknown;
  try{parsed=JSON.parse(points.exportStateJson());}catch(e){throw new Error(`No se pudo leer la instantánea para la auditoría: ${(e as Error).message}`,{cause:e});}
  const snapshot=parsed as {
    bets:SnapshotBet[];markets:Record<string,SnapshotMarket>;ledger:SnapshotLedger[];accounts:Record<string,{name:string}>;
  };
  // Aggregate refund credits per account+market; each credit is consumed once.
  const refundCredits=new Map<string,number>();
  for(const entry of snapshot.ledger){
    if(entry.kind!=='refund'||!entry.marketKey||entry.delta<=0)continue;
    const key=`${entry.accountId}:${entry.marketKey}`;
    refundCredits.set(key,(refundCredits.get(key)??0)+entry.delta);
  }
  const pending:RefundAuditRow[]=[],conflicts:RefundAuditRow[]=[];
  for(const bet of snapshot.bets){
    const market=snapshot.markets[bet.marketKey];
    if(!isRefundableMarket(market))continue; // Ordinary resolved markets are not refund debts.
    const accountName=snapshot.accounts[bet.accountId]?.name??bet.accountId;
    const row:RefundAuditRow={betId:bet.id,accountId:bet.accountId,accountName,marketKey:bet.marketKey,
      marketTitle:market.prediction.title,marketPhase:market.phase,amount:bet.amount,
      pending:0,claimed:bet.claimed,creditMethod:bet.creditMethod,creditedAt:bet.creditedAt};
    // Already credited through claim/distribution/refund: no debt, never re-paid. A position
    // marked refunded but missing its ledger entry is contradictory evidence, not a debt.
    if(bet.claimed&&bet.creditMethod){
      const key=`${bet.accountId}:${bet.marketKey}`;
      if(bet.creditMethod==='refund'&&(refundCredits.get(key)??0)<bet.amount)conflicts.push({...row,pending:0});
      continue;
    }
    if(!hasRefundDebt(bet))continue;
    // Reconcile against the account+market refund pool, consuming credits without reuse.
    const poolKey=`${bet.accountId}:${bet.marketKey}`;
    const available=refundCredits.get(poolKey)??0;
    if(available>=bet.amount){
      refundCredits.set(poolKey,available-bet.amount); // Credit consumed by this position.
      continue;
    }
    if(available>0){
      // Partial credit: ambiguous snapshot, separated for human review instead of a guess.
      refundCredits.set(poolKey,0);
      conflicts.push({...row,pending:bet.amount-available});
      continue;
    }
    pending.push({...row,pending:bet.amount});
  }
  // Leftover credit with no matching uncredited position is contradictory evidence.
  for(const [poolKey,leftover] of refundCredits){
    if(leftover<=0)continue;
    const [accountId,marketKey]=poolKey.split(':');
    const market=snapshot.markets[marketKey];
    if(!market)continue;
    const bet=snapshot.bets.find(b=>b.accountId===accountId&&b.marketKey===marketKey&&!b.claimed);
    conflicts.push({betId:bet?.id??`unknown:${accountId}`,accountId,accountName:snapshot.accounts[accountId]?.name??accountId,
      marketKey,marketTitle:market.prediction.title,marketPhase:market.phase,amount:0,pending:0,
      claimed:bet?.claimed??false,creditMethod:bet?.creditMethod,creditedAt:bet?.creditedAt});
  }
  return {pending,conflicts,totalPending:pending.reduce((n,r)=>n+r.pending,0),generatedAt:new Date().toISOString()};
}

/** Stable operation id for a supervised repair run; the same snapshot always hashes to the same id. */
export function repairOperationId(report:RefundAuditReport):string {
  return `refund-repair-${createHash('sha256').update(JSON.stringify(report.pending.map(r=>[r.betId,r.pending]))).digest('hex').slice(0,16)}`;
}
