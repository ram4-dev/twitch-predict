import {Check,Clock3,Radio,RotateCcw,X} from 'lucide-react';
import {LiquidMetalSurface} from './materials.js';
import type {AppMarket} from '../mobile-app-data.js';

export function StreamerMarketState({market,selected}:{market:AppMarket;selected?:string}){
 const open=market.phase==='open',resolved=market.phase==='resolved',voided=market.phase==='void',external=market.source!=='plot';
 const choice=resolved?market.outcomes.find(outcome=>outcome.id===market.winnerId):!open&&!voided&&!external?market.outcomes.find(outcome=>outcome.id===selected):undefined;
 const losers=resolved&&choice?market.outcomes.filter(outcome=>outcome.id!==choice.id):[];
 const state=voided?'void':resolved?'resolved':open?'open':external?'waiting':choice?'selected':'locked';
 const title=voided?'Mercado anulado':resolved?(choice?`Ganó ${choice.title}`:'Resultado no disponible'):open?'Apuestas abiertas':external?'Esperando resultado':choice?.title??'Elegí al ganador';
 const caption=voided?'Sin ganador. Sin comisión.':resolved?'Resultado confirmado.':external?'Twitch confirmará el resultado.':open?'Cerrá las apuestas cuando termine la ronda.':choice?'Pendiente de confirmar.':'Seleccioná una de las opciones de abajo.';
 const Icon=voided?RotateCcw:resolved||choice?Check:open?Radio:Clock3;
 return <section className="manager-market-state liquid-metal-frame" data-tone={open||resolved||choice?'positive':'neutral'} data-state={state} role="status" aria-label="Estado del mercado">
  <LiquidMetalSurface active={false} tone={open||resolved||choice?'positive':'neutral'}/>
  <p className="manager-state-label"><Icon size={16} aria-hidden="true"/>{resolved?'Resultado del mercado':voided?'Predicción anulada':choice?'Ganador seleccionado':'Estado del mercado'}</p>
  <strong className="manager-state-title">{title}</strong>
  {losers.length>0&&<p className="manager-state-loser"><X size={16} aria-hidden="true"/>Perdió {losers.map(outcome=>outcome.title).join(', ')}</p>}
  <p className="manager-state-caption">{caption}</p>
 </section>;
}
