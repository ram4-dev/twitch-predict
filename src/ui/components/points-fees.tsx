import {pointFees,type PointFees} from '../../point-fees.js';

/** Shared, persisted settlement amounts; open markets display the current pool estimate. */
export function PointsFees({pool,fees,canceled=false,historical=false,english=false}:{pool:number;fees?:PointFees;canceled?:boolean;historical?:boolean;english?:boolean}){
 const amount=(n:number)=>`${new Intl.NumberFormat(english?'en-US':'es-AR').format(n)} pts`;
 if(canceled)return <p className="points-fee-note">{english?'Full stake refund. No commission.':'Reembolso del total apostado. Sin comisión.'}</p>;
 if(historical&&!fees)return <p className="points-fee-note">{english?'Settled before commissions applied.':'Liquidado antes de aplicar comisiones.'}</p>;
 const values=fees??pointFees(pool);
 return <section className="points-fees" aria-label={english?'Pool distribution':'Reparto del pozo'}>
  <dl>
   <div><dt>{english?'Total pool':'Pozo total'}</dt><dd>{amount(values.pool)}</dd></div>
   <div><dt>Streamer · 2%</dt><dd>{amount(values.streamer)}</dd></div>
   <div><dt>Plot · 2%</dt><dd>{amount(values.platform)}</dd></div>
   <div><dt>{english?'For winners':'Para ganadores'}</dt><dd>{amount(values.winners)}</dd></div>
  </dl>
  <p>{english?'Each commission rounds down to whole points. Winners split the remainder in proportion to their stakes.':'Cada comisión se redondea hacia abajo a puntos enteros. Los ganadores se reparten el resto según lo apostado.'}</p>
 </section>;
}
