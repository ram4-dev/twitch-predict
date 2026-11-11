import {LiquidMetalSurface} from './materials.js';
import {number} from '../points-ui.js';

/** Amounts come from the server settlement preview, including actual refunds. */
export function SettlementAmounts({streamer,winners,refunded=false}:{streamer:number;winners:number;refunded?:boolean}){
 return <dl className="manager-settlement-amounts">
  {([['streamer','Para el streamer',streamer],['winners',refunded?'Reembolso a usuarios':'Para ganadores',winners]] as const).map(([key,label,amount])=><div key={key} className="liquid-metal-frame" data-tone={key==='winners'&&!refunded?'positive':'neutral'} data-settlement-share={key}>
   <LiquidMetalSurface active={false} tone={key==='winners'&&!refunded?'positive':'neutral'}/>
   <dt>{label}</dt><dd><strong>{number(amount)}</strong><span>pts</span></dd>
  </div>)}
 </dl>;
}
