import {useState,type ReactNode} from 'react';
import {ArrowUpRight,Check,RotateCcw,ShieldCheck,Trophy,X,Minus} from 'lucide-react';
import {CountingAmount} from './counting-amount.js';
type Props={title:string;channel:string;outcomes:{id:string;title:string}[];winnerId?:string;canceled:boolean;stake?:number;payout?:number;accountKnown?:boolean;unavailableMessage?:string;hit?:boolean;material?:'solid'|'glass'|'liquid'|'count';children?:ReactNode};
const pts=(n:number)=>`${new Intl.NumberFormat('es-AR').format(n)} pts`;
export function Resolution({title,channel,outcomes,winnerId,canceled,stake=0,payout=0,accountKnown=true,unavailableMessage,hit=false,material='count',children}:Props){
 const [expanded,setExpanded]=useState(false);
 const played=accountKnown&&stake>0,net=payout-stake;
 const state=!accountKnown?'unknown':!played?'spectator':canceled?'void':hit?'won':'lost';
 const winner=outcomes.find(o=>o.id===winnerId);
 const Icon=canceled?RotateCcw:hit?Trophy:played?X:Minus;
 const label=material==='count'&&played?(canceled?'Apuesta reembolsada':net>0?'Ganancia neta':net<0?'Pérdida neta':'Sin ganancia ni pérdida'):!accountKnown?(unavailableMessage??'Conectá tu cuenta para ver tu resultado'):!played?'No participaste':canceled?'Apuesta reembolsada':hit?'Acertaste':'Esta vez no acertaste';
 return <article className={`plot-resolution ${material}`} data-state={state} aria-label={`Resolución ${material==='count'?'Conteo':material==='liquid'?'Liquid glass':material==='glass'?'Glass':'Sólido'}`}>
  <div className="resolution-content"><div className="resolution-meta"><span>@{channel}</span><span><ShieldCheck size={13}/>{canceled?'Anulada':'Resuelta'}</span></div>
   <h3>{title}</h3>
   {material==='count'?<p className="resolution-result">{canceled?'Ronda anulada':winner?<>Resultado: <strong>{winner.title}</strong></>:'Resultado confirmado'}</p>:<div className="resolution-outcomes" aria-label="Resultado de la predicción">{outcomes.map(o=><div className={`resolution-outcome ${canceled?'neutral':o.id===winnerId?'winner':'loser'}`} key={o.id}><span>{canceled?<Minus size={16}/>:o.id===winnerId?<Check size={16}/>:<X size={16}/>}<strong>{o.title}</strong></span><span>{canceled?'Sin resultado':o.id===winnerId?'Ganó':'Perdió'}</span></div>)}</div>}
   <section className={`resolution-personal ${played&&!canceled?(net>0?'positive':net<0?'negative':'neutral'):'neutral'}`} aria-label="Tu resultado"><div className="resolution-label">{material!=='count'&&<Icon size={18}/>}<span>{label}</span></div>
    {played?<><p className="resolution-net" style={{'--figure-length':new Intl.NumberFormat('es-AR').format(Math.abs(net)).length+1} as React.CSSProperties} aria-label={`${net>0?'+':net<0?'−':''}${new Intl.NumberFormat('es-AR').format(Math.abs(net))} pts`}><span className="resolution-net-value">{material==='count'?<CountingAmount value={net}/>:<>{net>0?'+':net<0?'−':''}{new Intl.NumberFormat('es-AR').format(Math.abs(net))}</>}</span>{' '}<span className="resolution-net-unit">pts</span></p>{material!=='count'&&<p className="resolution-caption">{net>0?'Ganancia neta':net<0?'Pérdida neta':'Sin ganancia ni pérdida'}</p>}</>:<p className="resolution-caption">{accountKnown?'No se modificó tu saldo.':unavailableMessage?'Consultá el pago final en tu wallet.':'El resultado de la predicción ya está confirmado.'}</p>}
   </section>
   {played&&<dl className="resolution-receipt"><div><dt>Tu apuesta</dt><dd>{pts(stake)}</dd></div><div><dt>{canceled?'Reembolso total':'Cobro total'}</dt><dd>{pts(payout)}</dd></div></dl>}
   {children}
   <button type="button" className="resolution-detail-toggle" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?'Ocultar detalle':'Ver detalle'}<ArrowUpRight size={15}/></button>
   {expanded&&<div className="resolution-detail">{played?`${pts(payout)} de ${canceled?'reembolso':'cobro'} − ${pts(stake)} de apuesta = ${net>0?'+':net<0?'−':''}${pts(Math.abs(net))} netos. ${canceled?'Recuperás el total apostado.':payout>0?'El cobro incluye los puntos recuperados de tu apuesta.':'Tu opción no ganó. No hay puntos para cobrar.'}`:accountKnown?'No tenías una apuesta en esta predicción.':(unavailableMessage??'Conectá tu cuenta para consultar tus apuestas y cobros.')}{!canceled&&winner&&` ${material==='count'?'Resultado:':'Ganó'} ${winner.title}.`}</div>}
  </div>
 </article>;
}
