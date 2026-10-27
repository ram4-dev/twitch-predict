import type {DisplayByteMarket} from './byte-model.js';
import type {BetReceipt} from './byte-bet-core.js';

// This is the principal of locally recorded confirmed bets, never an estimated
// winning payout or a wallet-balance delta. Byte must confirm chain settlement.
export function confirmedRefund(market:DisplayByteMarket,wallet:string|undefined,receipts:BetReceipt[]){
 if(!Number.isSafeInteger(market.total)||market.total<0)return;
 if(!wallet||market.currency!=='sol'||market.status!=='invalid'||!market.chain.settled)return;
 const signatures=new Map<string,BetReceipt>();let total=0n;
 for(const r of receipts){
  if(r.wallet!==wallet||r.marketId!==market.id||r.status!=='confirmed')continue;
  if(!r.signature||!/^\d+$/.test(r.amount)||!Number.isInteger(r.option)||!market.options[r.option])return;
  const old=signatures.get(r.signature);if(old){if(old.amount!==r.amount||old.option!==r.option)return;continue;}
  const amount=BigInt(r.amount);if(amount<=0n)return;total+=amount;signatures.set(r.signature,r);
 }
 if(!signatures.size||total>BigInt(Number.MAX_SAFE_INTEGER)||total>BigInt(market.total))return;
 const precision=total.toString().padStart(10,'0').slice(-9).replace(/0+$/,'').length;
 return {lamports:Number(total),count:signatures.size,precision};
}
