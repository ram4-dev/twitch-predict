import {Check,Clock3,Radio} from 'lucide-react';
import type {AppMarket} from '../mobile-app-data.js';

export function StreamerMarketState({market,selected}:{market:AppMarket;selected?:string}){
 const open=market.phase==='open',external=market.source!=='plot';
 const choice=!open&&!external?market.outcomes.find(outcome=>outcome.id===selected):undefined;
 const state=open?'open':external?'waiting':choice?'selected':'locked';
 const title=open?'Apuestas abiertas':external?'Esperando resultado':choice?.title??'Elegí al ganador';
 const caption=external?'Twitch confirmará el resultado.':open?'Cerrá las apuestas cuando termine la ronda.':choice?'Pendiente de confirmar.':'Seleccioná una de las opciones de abajo.';
 const Icon=open?Radio:choice?Check:Clock3;
 return <section className="manager-market-state" data-state={state} role="status" aria-label="Estado del mercado">
  <p className="manager-state-label"><Icon size={16} aria-hidden="true"/>{choice?'Ganador seleccionado':'Estado del mercado'}</p>
  <strong className="manager-state-title">{title}</strong>
  <p className="manager-state-caption">{caption}</p>
 </section>;
}
