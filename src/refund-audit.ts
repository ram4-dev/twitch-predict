import {createHash} from 'node:crypto';
import type {Points} from './points.js';

/** Read-only audit of historical cancellations settled before automatic refunds existed.
 * Never writes: the report is the reviewable input for any later supervised repair. */
export type RefundAuditRow={
  betId:string;accountId:string;accountName:string;marketKey:string;marketTitle:string;
  marketPhase:string;amount:number;pending:number;claimed:boolean;creditMethod?:string;creditedAt?:string;
};
export type RefundAuditReport={pending:RefundAuditRow[];conflicts:RefundAuditRow[];totalPending:number;generatedAt:string};

type SnapshotBet={id:string;accountId:string;marketKey:string;amount:number;payout:number;claimed:boolean;creditedAt?:string;creditMethod?:string};
type SnapshotMarket={key:string;phase:string;prediction:{title:string}};
type SnapshotLedger={accountId:string;kind:string;delta:number;marketKey?:string};

/** Reads the persisted Points snapshot without mutating it. */
export function auditHistoricalRefunds(points:Points):RefundAuditReport {
  let parsed:unknown;
  try{parsed=JSON.parse(points.exportStateJson());}catch(e){throw new Error(`No se pudo leer la instantánea para la auditoría: ${(e as Error).message}`);}
  const snapshot=parsed as {
    bets:SnapshotBet[];markets:Record<string,SnapshotMarket>;ledger:SnapshotLedger[];accounts:Record<string,{name:string}>;
  };
  const refundByBet=new Map<string,number>();
  for(const entry of snapshot.ledger){
    if(entry.kind!=='refund'||!entry.marketKey)continue;
    const key=`${entry.accountId}:${entry.marketKey}:${entry.delta}`;
    refundByBet.set(key,(refundByBet.get(key)??0)+entry.delta);
  }
  const pending:RefundAuditRow[]=[],conflicts:RefundAuditRow[]=[];
  for(const bet of snapshot.bets){
    const market=snapshot.markets[bet.marketKey];
    if(!market||!['resolved','void'].includes(market.phase))continue;
    const accountName=snapshot.accounts[bet.accountId]?.name??bet.accountId;
    const row:RefundAuditRow={betId:bet.id,accountId:bet.accountId,accountName,marketKey:bet.marketKey,
      marketTitle:market.prediction.title,marketPhase:market.phase,amount:bet.amount,
      pending:0,claimed:bet.claimed,creditMethod:bet.creditMethod,creditedAt:bet.creditedAt};
    const refunds=refundByBet.get(`${bet.accountId}:${bet.marketKey}:${bet.amount}`)??0;
    const stillOwed=Math.max(0,bet.amount-refunds);
    if(stillOwed>0){
      if(bet.claimed&&bet.creditMethod==='refund'&&bet.creditedAt)conflicts.push({...row,pending:stillOwed});
      else pending.push({...row,pending:stillOwed});
    }
  }
  return {pending,conflicts,totalPending:pending.reduce((n,r)=>n+r.pending,0),generatedAt:new Date().toISOString()};
}

/** Stable operation id for a supervised repair run; the same snapshot always hashes to the same id. */
export function repairOperationId(report:RefundAuditReport):string {
  return `refund-repair-${createHash('sha256').update(JSON.stringify(report.pending.map(r=>[r.betId,r.pending]))).digest('hex').slice(0,16)}`;
}
