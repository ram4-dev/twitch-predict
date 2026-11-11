import type {ReactNode} from 'react';
import {ArrowLeft,ArrowUpRight,Check} from 'lucide-react';
import {OutcomeFrame} from './vendor/corsair/outcome-frame.js';
import {Button} from './components/button.js';
import {number} from './points-ui.js';
import type {AppMarket,AppAccount} from './mobile-app-data.js';

export const detailLayouts=[
 {id:'direct',name:'La jugada',description:'Elegir primero. Dos lados grandes, distribución y tu posición.'},
 {id:'pool',name:'El pozo',description:'Comparar primero. Puntos y apuestas de cada lado, con el total al frente.'},
 {id:'context',name:'El contexto',description:'Entender primero. Fuente, tiempos y estado antes de elegir.'},
] as const;
export type DetailLayout=typeof detailLayouts[number]['id']|'hybrid';
export const isDetailLayout=(value:string|null):value is DetailLayout=>value==='hybrid'||detailLayouts.some(layout=>layout.id===value);
const date=(value:string|undefined)=>{const parsed=value?new Date(value):undefined;return parsed&&!Number.isNaN(parsed.getTime())?new Intl.DateTimeFormat('es-AR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(parsed):'Sin datos';};
export function MarketDetail({market,layout,account,receipt,onBack,onChoose}:{market:AppMarket;layout:DetailLayout;account?:AppAccount;receipt?:ReactNode;onBack:()=>void;onChoose:(outcome:string)=>void}){
 const total=market.outcomes.reduce((sum,outcome)=>sum+outcome.points,0);
 const share=(points:number)=>new Intl.NumberFormat('es-AR',{maximumFractionDigits:1}).format(total?points/total*100:0);
 const bets=account?.bets.filter(bet=>bet.marketKey===market.key)??[];
 const ended=market.phase==='resolved'||market.phase==='void';
 const status=market.phase==='resolved'?'Resuelta':market.phase==='void'?'Cancelada':market.canBet?'Abierta':'Cerrada';
 const close=new Date(new Date(market.prediction.createdAt).getTime()+market.prediction.predictionWindowSeconds*1000);
 const split=<div className="phone-pool-split detail-split" role="img" aria-label={total?`Distribución de puntos: ${market.outcomes.map(outcome=>`${outcome.title} ${share(outcome.points)}%`).join(', ')}`:'Sin apuestas'} data-empty={!total?'true':undefined}>{market.outcomes.map((outcome,index)=><span key={outcome.id} className={`phone-pool-share ${index===0?'phone-pool-first':'phone-pool-second'}`} style={{width:`${total?outcome.points/total*100:0}%`}}/>)}</div>;
 const duel=<div className="detail-duel">{market.outcomes.map((outcome,index)=><OutcomeFrame key={outcome.id} data-side={index===0?'first':'second'} data-chosen={bets.some(b=>b.outcomeId===outcome.id)?'true':undefined}><span>{outcome.title}</span><strong>{share(outcome.points)}<small>%</small></strong><span>{number(outcome.points)} pts</span>{bets.some(b=>b.outcomeId===outcome.id)&&<small className="detail-chosen"><Check size={13}/>Tu elección</small>}</OutcomeFrame>)}</div>;
 const result=ended&&<div className="detail-result" role="status">{market.winnerId?<><strong>Ganó {market.outcomes.find(o=>o.id===market.winnerId)?.title}</strong><span>Perdió {market.outcomes.filter(o=>o.id!==market.winnerId).map(o=>o.title).join(', ')}</span></>:<strong>{market.phase==='void'?'Cancelada · Reembolso':'Resultado no disponible'}</strong>}{market.phase==='void'&&market.reason&&<p>{market.reason}</p>}</div>;
 const context=<dl className="detail-timeline"><div><dt>Fuente</dt><dd>{market.demo?'Mercado de ejemplo':'Predicción de Twitch'}</dd></div><div><dt>Abrió</dt><dd>{date(market.prediction.createdAt)}</dd></div><div><dt>Cierre previsto de apuestas</dt><dd>{Number.isNaN(close.getTime())?'Sin datos':date(close.toISOString())}</dd></div><div><dt>Última verificación</dt><dd>{date(market.sourceCheckedAt)}</dd></div>{market.settlement&&<div><dt>Resolución</dt><dd>{date(market.settlement.at)}</dd></div>}{market.reason&&<div><dt>Motivo</dt><dd>{market.reason}</dd></div>}</dl>;
 return <section className={`market-detail detail-${layout}`} aria-label="Detalle del mercado" data-layout={layout}>
  <div className="detail-back-row"><button className="detail-back" onClick={onBack}><ArrowLeft size={18}/>Volver</button><span className="phone-status">{status}</span></div>
  <div className="detail-scroll" tabIndex={0} aria-label="Información del mercado">
   <header className="detail-heading"><span className="phone-channel">@{market.prediction.channel}</span><h2>{market.prediction.title}</h2></header>
   {result}
   {layout==='direct'&&<>{duel}{split}<p className="detail-summary">{number(total)} pts en juego <span>· {number(market.participants)} personas</span></p></>}
   {(layout==='pool'||layout==='hybrid')&&<>{layout==='hybrid'?<div className="detail-pool-overview"><div className="detail-pool-total"><span>Pozo total</span><strong>{number(total)} <small>pts</small></strong><span>{number(market.totalBets)} apuestas</span></div><div className="detail-people"><span>Personas</span><strong>{number(market.participants)}</strong></div></div>:<div className="detail-pool-total"><span>Pozo total</span><strong>{number(total)} <small>pts</small></strong><span>{number(market.participants)} personas · {number(market.totalBets)} apuestas</span></div>}{layout==='hybrid'?<>{duel}{split}</>:<>{split}<div className="detail-pool-rows">{market.outcomes.map((outcome,index)=><div key={outcome.id} className="detail-pool-row" data-side={index===0?'first':'second'}><div><strong>{outcome.title}</strong><span>{number(outcome.bets)} apuestas</span></div><div><strong>{number(outcome.points)} pts</strong><span>{share(outcome.points)}% del pozo</span></div></div>)}</div></>}<p className="detail-note">Los porcentajes muestran puntos apostados, no probabilidades.</p></>}
   {layout==='context'&&<><div className="detail-source"><span>{market.demo?'Datos de ejemplo':'Fuente del mercado'}</span>{market.demo?<strong>@{market.prediction.channel}</strong>:<a href={`https://www.twitch.tv/${encodeURIComponent(market.prediction.channel)}`} target="_blank" rel="noreferrer">Ver a @{market.prediction.channel}<ArrowUpRight size={16}/></a>}</div>{context}<p className="detail-note">El cierre de apuestas no es la hora del resultado.</p>{split}<div className="detail-inline-outcomes">{market.outcomes.map((outcome,index)=><span key={outcome.id} data-side={index===0?'first':'second'}>{outcome.title} <strong>{share(outcome.points)}%</strong></span>)}</div></>}
   {bets.length?<div className="detail-own"><h3>Tu jugada</h3>{receipt}</div>:<p className="detail-no-position">Todavía no apostaste en este mercado.</p>}
   {layout!=='context'&&<details className="detail-more"><summary>Fuente y tiempos</summary>{context}</details>}
  </div>
  {!ended&&<div className="detail-actions" aria-label="Elegir resultado">{market.outcomes.map((outcome,index)=><Button key={outcome.id} tone={index===0?'positive':'negative'} disabled={!market.canBet} aria-label={`Apostar a ${outcome.title}`} onClick={()=>onChoose(outcome.id)}><span>{outcome.title}</span><ArrowUpRight size={16}/></Button>)}{!market.canBet&&<small>Las apuestas están cerradas.</small>}</div>}
 </section>;
}
