import {type ReactNode} from 'react';
import {Check,RotateCcw,ShieldCheck,Trophy,X,Minus} from 'lucide-react';
import {CountingAmount} from './counting-amount.js';
type Props={titleLink?:ReactNode;hideEmptyPersonal?:boolean;resultContent?:ReactNode;showOutcomeSummary?:boolean;title:string;channel:string;outcomes:{id:string;title:string}[];winnerId?:string;canceled:boolean;reason?:string;stake?:number;payout?:number;accountKnown?:boolean;unavailableMessage?:string;spectatorMessage?:string;hit?:boolean;material?:'solid'|'glass'|'liquid'|'count';english?:boolean;children?:ReactNode};
export function Resolution({title,titleLink,channel,outcomes,winnerId,canceled,reason,stake=0,payout=0,accountKnown=true,unavailableMessage,spectatorMessage,hit=false,material='count',english=false,showOutcomeSummary=false,resultContent,hideEmptyPersonal=false,children}:Props){
 const played=accountKnown&&stake>0,net=payout-stake,locale=english?'en-US':'es-AR';
 const fmt=(n:number)=>new Intl.NumberFormat(locale).format(n);
 const pts=(n:number)=>`${fmt(n)} pts`;
 const state=!accountKnown?'unknown':!played?'spectator':canceled?'void':hit?'won':'lost';
 const showPersonal=!hideEmptyPersonal||played;
 const winner=outcomes.find(o=>o.id===winnerId);
 const Icon=canceled?RotateCcw:hit?Trophy:played?X:Minus;
 const label=material==='count'&&played?(canceled?(english?'Stake refunded':'Apuesta reembolsada'):net>0?(english?'Net gain':'Ganancia neta'):net<0?(english?'Net loss':'Pérdida neta'):(english?'No net gain or loss':'Sin ganancia ni pérdida')):!accountKnown?(unavailableMessage??(english?'Connect your account to see your result':'Conectá tu cuenta para ver tu resultado')):!played?(english?'You did not take part':'No participaste'):canceled?(english?'Stake refunded':'Apuesta reembolsada'):hit?(english?'You called it':'Acertaste'):(english?'Not this time':'Esta vez no acertaste');
 const signedNet=`${net>0?'+':net<0?'−':''}${fmt(Math.abs(net))}`;
 return <article className={`plot-resolution ${material}${titleLink?' resolution-clickable':''}`} data-state={state} aria-label={english?`Resolution ${material==='count'?'Count':material==='liquid'?'Liquid glass':material==='glass'?'Glass':'Solid'}`:`Resolución ${material==='count'?'Conteo':material==='liquid'?'Liquid glass':material==='glass'?'Glass':'Sólido'}`}>
  <div className="resolution-content"><div className="resolution-meta"><span>@{channel}</span><span><ShieldCheck size={13}/>{canceled?(english?'Voided':'Anulada'):(english?'Resolved':'Resuelta')}</span></div>
   <h3>{titleLink??title}</h3>
   {resultContent??(material==='count'?<p className="resolution-result">{canceled?(english?'Round voided':'Ronda anulada'):winner?<>{showOutcomeSummary?(english?'Won':'Ganó'):(english?'Result:':'Resultado:')} <strong>{winner.title}</strong>{showOutcomeSummary&&outcomes.some(o=>o.id!==winnerId)&&<> · {english?'Lost':'Perdió'} {outcomes.filter(o=>o.id!==winnerId).map(o=>o.title).join(', ')}</>}</>:(english?'Result confirmed':'Resultado confirmado')}</p>:<div className="resolution-outcomes" aria-label={english?'Prediction result':'Resultado de la predicción'}>{outcomes.map(o=><div className={`resolution-outcome ${canceled?'neutral':o.id===winnerId?'winner':'loser'}`} key={o.id}><span>{canceled?<Minus size={16}/>:o.id===winnerId?<Check size={16}/>:<X size={16}/>}<strong>{o.title}</strong></span><span>{canceled?(english?'No result':'Sin resultado'):o.id===winnerId?(english?'Won':'Ganó'):(english?'Lost':'Perdió')}</span></div>)}</div>)}
   {reason&&<p className="resolution-reason">{reason}</p>}
   {showPersonal&&<section className={`resolution-personal ${played&&!canceled?(net>0?'positive':net<0?'negative':'neutral'):'neutral'}`} aria-label={english?'Your result':'Tu resultado'}><div className="resolution-label">{material!=='count'&&<Icon size={18}/>}<span>{label}</span></div>
    {played?<><p className="resolution-net" style={{'--figure-length':fmt(Math.abs(net)).length+1} as React.CSSProperties} aria-label={`${signedNet} pts`}><span className="resolution-net-value">{material==='count'?<CountingAmount value={net} locale={locale}/>:<>{signedNet}</>}</span>{' '}<span className="resolution-net-unit">pts</span></p>{material!=='count'&&<p className="resolution-caption">{net>0?(english?'Net gain':'Ganancia neta'):net<0?(english?'Net loss':'Pérdida neta'):(english?'No net gain or loss':'Sin ganancia ni pérdida')}</p>}</>:<p className="resolution-caption">{accountKnown?(spectatorMessage??(english?'Your balance did not change.':'No se modificó tu saldo.')):unavailableMessage?(english?'Check the final payout in your wallet.':'Consultá el pago final en tu wallet.'):(english?'The prediction result is already confirmed.':'El resultado de la predicción ya está confirmado.')}</p>}
   </section>}
   {played&&<dl className="resolution-receipt"><div><dt>{english?'Your stake':'Tu apuesta'}</dt><dd>{pts(stake)}</dd></div><div><dt>{canceled?(english?'Total refund':'Reembolso total'):(english?'Total payout':'Cobro total')}</dt><dd>{pts(payout)}</dd></div></dl>}
   {children}
  </div>
 </article>;
}
