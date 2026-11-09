import {createHash} from 'node:crypto';
import type {Points} from './points.js';

/** Read-only audit of pre-automatic-refund cancellations; never writes. Only refundable
 * positions count (void/cancelled, or legacy payout=stake unclaimed); ordinary resolved
 * winners/losers are never debts. Refund credits reconcile per account+market in a nested
 * map (market keys contain ':'), consumed exactly once — including claimed/refund positions;
 * shortfalls, leftovers and ambiguous flags land in conflicts. */
export type RefundAuditRow={
  betId:string;accountId:string;accountName:string;marketKey:string;marketTitle:string;
  marketPhase:string;amount:number;pending:number;claimed:boolean;creditMethod?:string;creditedAt?:string;
};
export type RefundAuditReport={pending:RefundAuditRow[];conflicts:RefundAuditRow[];totalPending:number;generatedAt:string};

type SnapshotBet={id:string;accountId:string;marketKey:string;amount:number;payout:number;claimed:boolean;creditedAt?:string;creditMethod?:string};
type SnapshotMarket={key:string;phase:string;prediction:{title:string}};
type SnapshotLedger={accountId:string;kind:string;delta:number;marketKey?:string};

const isRefundableMarket=(market:SnapshotMarket|undefined)=>!!market&&market.phase==='void';

const poolOf=(pools:Map<string,Map<string,number>>,accountId:string,marketKey:string):number =>
  pools.get(accountId)?.get(marketKey)??0;
const consume=(pools:Map<string,Map<string,number>>,accountId:string,marketKey:string,amount:number)=>{
  const account=pools.get(accountId);if(!account)return;
  const remaining=(account.get(marketKey)??0)-amount;
  if(remaining>0)account.set(marketKey,remaining);else account.delete(marketKey);
};

/** Reads the persisted Points snapshot without mutating it. */
export function auditHistoricalRefunds(points:Points):RefundAuditReport {
  let parsed:unknown;
  try{parsed=JSON.parse(points.exportStateJson());}catch(e){throw new Error(`No se pudo leer la instantánea para la auditoría: ${(e as Error).message}`,{cause:e});}
  const snapshot=parsed as {
    bets:SnapshotBet[];markets:Record<string,SnapshotMarket>;ledger:SnapshotLedger[];accounts:Record<string,{name:string}>;
  };
  // Aggregate refund credits per account+market.
  const pools=new Map<string,Map<string,number>>();
  for(const entry of snapshot.ledger){
    if(entry.kind!=='refund'||!entry.marketKey||entry.delta<=0)continue;
    const account=pools.get(entry.accountId)??new Map<string,number>();
    account.set(entry.marketKey,(account.get(entry.marketKey)??0)+entry.delta);
    pools.set(entry.accountId,account);
  }
  const originalPools=new Map([...pools].map(([id,markets])=>[id,new Map(markets)]));
  const pending:RefundAuditRow[]=[],conflicts:RefundAuditRow[]=[];
  const shortfallReported=new Set<string>();
  const rowOf=(bet:SnapshotBet):RefundAuditRow=>({betId:bet.id,accountId:bet.accountId,
    accountName:snapshot.accounts[bet.accountId]?.name??bet.accountId,marketKey:bet.marketKey,
    marketTitle:snapshot.markets[bet.marketKey]?.prediction.title??'',marketPhase:snapshot.markets[bet.marketKey]?.phase??'',
    amount:bet.amount,pending:0,claimed:bet.claimed,creditMethod:bet.creditMethod,creditedAt:bet.creditedAt});
  for(const bet of snapshot.bets){
    const market=snapshot.markets[bet.marketKey];
    if(!isRefundableMarket(market))continue; // Ordinary resolved markets are not refund debts.
    const row=rowOf(bet);
    // Claim/distribution history prevents any debt even with inconsistent flags (ambiguity → conflict).
    if(bet.claimed&&(bet.creditMethod==='claim'||bet.creditMethod==='distribution')){
      if(poolOf(pools,bet.accountId,bet.marketKey)>0)conflicts.push({...row,pending:0}); // payment AND refund credit: contradictory.
      continue;
    }
    // Marked refunded: consumes its pool share once even with inconsistent claimed; a pool
    // shortfall is a hidden under-refund reported once per account+market, never per position.
    if(bet.creditMethod==='refund'){
      const pool=poolOf(pools,bet.accountId,bet.marketKey);
      if(pool>=bet.amount)consume(pools,bet.accountId,bet.marketKey,bet.amount);
      else if(!shortfallReported.has(`${bet.accountId}\u0000${bet.marketKey}`)){
        consume(pools,bet.accountId,bet.marketKey,pool);
          shortfallReported.add(`${bet.accountId}\u0000${bet.marketKey}`);
          const totalBetted=snapshot.bets.filter(b2=>b2.accountId===bet.accountId&&b2.marketKey===bet.marketKey&&b2.creditMethod==='refund').reduce((n,b2)=>n+b2.amount,0);
          conflicts.push({...row,pending:Math.max(0,totalBetted-poolOf(originalPools,bet.accountId,bet.marketKey))});
      }
      continue;
    }
    // Unclaimed without credit method: refundable legacy shape (payout=stake) or unknown flags.
    if(!bet.claimed&&bet.creditMethod===undefined){
      const pool=poolOf(pools,bet.accountId,bet.marketKey);
      if(pool>=bet.amount){consume(pools,bet.accountId,bet.marketKey,bet.amount);continue;}
      if(pool>0){consume(pools,bet.accountId,bet.marketKey,pool);conflicts.push({...row,pending:bet.amount-pool});continue;}
      pending.push({...row,pending:bet.amount});
      continue;
    }
    // claimed without a method, or any other inconsistent combination: ambiguous evidence.
    conflicts.push({...row,pending:0});
  }
  // Leftover credit with no matching position is contradictory evidence; nested keys keep market keys intact.
  for(const [accountId,markets] of pools)for(const [marketKey,leftover] of markets){
    if(leftover<=0)continue;
    const bet=snapshot.bets.find(b2=>b2.accountId===accountId&&b2.marketKey===marketKey);
    conflicts.push({betId:bet?.id??`unknown:${accountId}`,accountId,accountName:snapshot.accounts[accountId]?.name??accountId,
      marketKey,marketTitle:snapshot.markets[marketKey]?.prediction.title??'',marketPhase:snapshot.markets[marketKey]?.phase??'',
      amount:0,pending:0,claimed:bet?.claimed??false,creditMethod:bet?.creditMethod,creditedAt:bet?.creditedAt});
  }
  return {pending,conflicts,totalPending:pending.reduce((n,r)=>n+r.pending,0),generatedAt:new Date().toISOString()};
}

/** Stable operation id for a supervised repair run; the same snapshot always hashes to the same id. */
export function repairOperationId(report:RefundAuditReport):string {
  return `refund-repair-${createHash('sha256').update(JSON.stringify(report.pending.map(r=>[r.betId,r.pending]))).digest('hex').slice(0,16)}`;
}
