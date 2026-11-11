import {LiquidMetalSurface} from './materials.js';
import {CountingAmount} from './counting-amount.js';
import {number} from '../points-ui.js';

/** Amounts come from the server settlement preview, including actual refunds. */
export function SettlementAmounts({streamer,winners,refunded=false}:{streamer:number;winners:number;refunded?:boolean}){
 return <dl className="manager-settlement-amounts">
  {([['streamer','Para el streamer',streamer],['winners',refunded?'Reembolso a usuarios':'Para ganadores',winners]] as const).map(([key,label,amount])=><div key={key} className="liquid-metal-frame" data-tone={key==='winners'&&!refunded?'positive':'neutral'} data-settlement-share={key}>
   <LiquidMetalSurface active={false} tone={key==='winners'&&!refunded?'positive':'neutral'}/>
   <dt>{label}</dt><dd aria-label={`${number(amount)} pts`}><strong><CountingAmount value={amount} signed={false}/></strong><span aria-hidden="true">pts</span></dd>
  </div>)}
 </dl>;
}
