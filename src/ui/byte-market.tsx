import {useEffect,useState} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {ArrowUpRight,Check} from 'lucide-react';
import {Resolution} from './components/resolution.js';
import {Button} from './components/button.js';
import {Input} from './components/input.js';
import {Badge} from './components/badge.js';
import {Notice} from './components/plot.js';
import {enableSpotlight} from './components/materials.js';
import {closesAt} from '../prediction.js';
import type {TwitchPreview} from '../twitch-preview.js';
import {solToLamports,type ByteConfig,type DisplayByteMarket} from '../byte-model.js';
export const sol=(amount:number|string)=>new Intl.NumberFormat('es-AR',{maximumFractionDigits:9}).format(Number(amount)/1e9);
export type ByteSelection={amount:string;option:number};
export function ByteBetting({market:m,config,disabled=false,initial,onBet,onEdit,extension=false,resolution=false,minimal=false}:{market:DisplayByteMarket;config?:ByteConfig;disabled?:boolean;initial?:ByteSelection;onBet:(selection:ByteSelection)=>void;onEdit?:()=>void;extension?:boolean;resolution?:boolean;minimal?:boolean}){
 const [amount,setAmount]=useState(initial?.amount??'0.01'),[selected,setSelected]=useState(initial?.option),[error,setError]=useState(''),[now,setNow]=useState(Date.now());
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
 const unit=m.currency==='sol'?'SOL':'unidades BYTE';
 const units=(value:number|string)=>m.currency==='sol'?sol(value):new Intl.NumberFormat('es-AR').format(Number(value));
 const open=m.status==='open'&&m.bettable&&now<m.closeMs;
 const change=(value:string)=>{setAmount(value);setError('');onEdit?.();};
 const choose=(option:number)=>{try{const value=solToLamports(amount);if(config&&(value>BigInt(config.sol.maxBet)||BigInt(m.total)+value>BigInt(config.sol.maxPool)))throw new Error('La apuesta supera los límites del mercado.');setError('');setSelected(option);onBet({option,amount});}catch(e){setError((e as Error).message);}};
 if((extension&&m.status!=='open')||(resolution&&['resolved','invalid'].includes(m.status)))return <section className="points-market byte-betting"><Resolution title={m.title} channel={m.notes?.channel??'partner'} outcomes={m.options.map((title,i)=>({id:String(i),title}))} winnerId={m.winner===null?undefined:String(m.winner)} canceled={m.status==='invalid'} accountKnown={false} unavailableMessage="El importe de tu cobro no está disponible.">
  <Notice tone={m.chain.settled?'success':'info'}>{m.chain.settled?'Pagos o reembolsos completados en cadena.':'Resultado registrado. Esperando que byte complete los pagos.'}</Notice>
  <a className="resolution-chain-link" href={`https://explorer.solana.com/address/${m.chain.market}?cluster=devnet`} target="_blank" rel="noopener noreferrer">Ver mercado en Solana devnet <ArrowUpRight size={14}/></a>
 </Resolution></section>;
 return <section className="points-market byte-betting">
  <div className="points-market-head"><span className={`points-status ${open?'live':''}`}><span className="status-mark"/>{m.status==='invalid'?'Anulado':m.status==='resolved'?'Resultado confirmado':open?'Apuestas abiertas':'Esperando resultado'}</span><Badge variant="secondary">{m.currency==='sol'?'SOL devnet':'BYTE devnet'}</Badge></div>
  <div className="pool-summary"><div className="points-pool"><span>Pozo de la comunidad</span><strong>{units(m.total)} <small>{unit}</small></strong></div><div className="pool-people"><span>{m.bettors} {m.bettors===1?'participante':'participantes'}</span></div></div>
  <div className="pool-split" role="img" aria-label={`Distribución del pozo: ${m.options.map((o,i)=>`${o} ${units(m.pools[i])} ${unit}`).join(', ')}`}>{m.options.map((o,i)=><span key={i} className={i%2===0?'share-primary':'share-secondary'} title={o} style={{width:`${m.total?m.pools[i]/m.total*100:0}%`}}/>)}</div>
  {open&&m.currency==='sol'&&<div className="stake-row"><label className="points-stake"><span>Tu apuesta</span><span className="stake-input"><Input aria-label="Importe en SOL devnet" inputMode="decimal" value={amount} disabled={disabled} onChange={e=>change(e.target.value)}/><span>SOL</span></span></label><div className="points-quick">{['0.01','0.05','0.1'].map(v=><Button key={v} variant="ghost" size="sm" disabled={disabled} aria-pressed={amount===v} onClick={()=>change(v)}>{v}</Button>)}</div></div>}
  <div className="points-options">{m.options.map((label,i)=><div className={`points-option ${i%2===0?'side-first':'side-second'}`} key={i} data-selected={selected===i}><div className="option-heading"><strong>{label}</strong><span>{m.total?`${new Intl.NumberFormat('es-AR',{maximumFractionDigits:1}).format(m.pools[i]/m.total*100)}%`:'—'}</span></div><p>{units(m.pools[i])} {unit} en el pozo</p>{m.winner===i&&<span className="points-winner"><Check size={15}/>Resultado ganador</span>}{open&&m.currency==='sol'&&<Button className="points-bet" tone={i%2===0?'positive':'negative'} aria-pressed={selected===i} disabled={disabled||!config?.enabled} onClick={()=>choose(i)}>Apostar a {label}<ArrowUpRight size={15}/></Button>}</div>)}</div>
  {open&&!extension&&!minimal&&<p className="points-rule">Confirmás con tu wallet en Solana devnet. Porcentaje del pozo, no probabilidad.</p>}
  {error&&<Notice tone="error">{error}</Notice>}
  {m.currency!=='sol'&&<Notice>Este mercado usa BYTE. Las apuestas de esta aplicación están disponibles en SOL devnet.</Notice>}
  {m.status!=='open'&&<Notice tone={m.chain.settled?'success':'info'}>{m.chain.settled?'Pagos o reembolsos completados en cadena.':'Resultado registrado. Esperando que byte complete los pagos.'}</Notice>}
 </section>;
}
const roots=new Map<string,{node:HTMLElement;root:Root;generation:number}>();let generation=0;
export function disposeByteViews(){const current=++generation;queueMicrotask(()=>{for(const [key,v]of roots)if(v.generation<current){v.root.unmount();roots.delete(key);}});}
type ExtensionOperation={marketId:string;status:string;error?:string;receipt?:{signature:string}};
function ExtensionMarket({market,config,operation}:{market:DisplayByteMarket;config?:ByteConfig;operation?:ExtensionOperation}){
 const [error,setError]=useState(''),[opening,setOpening]=useState(false);
 const open=async(selection:ByteSelection)=>{
  if(opening)return;setOpening(true);setError('');
  try{
   const runtime=(globalThis as unknown as {chrome:{runtime:{sendMessage(message:unknown):Promise<{error?:string}>}}}).chrome.runtime;
   const result=await runtime.sendMessage({type:'BYTE_BET',marketId:market.id,...selection});
   if(result?.error)throw new Error(result.error);
  }catch(e){setError((e as Error).message);}finally{setOpening(false);}
 };
 const active=operation?.marketId===market.id&&!['confirmed','failed','expired','cancelled'].includes(operation.status);
 return <>{market.status==='open'&&<><div className="topline"><span>@{market.notes?.channel??'partner'} · Ronda {new Date(market.openMs).toLocaleString('es-AR')}</span><span>Cierre: {new Date(market.closeMs).toLocaleString('es-AR')}</span></div><h1>{market.title}</h1></>}<ByteBetting market={market} config={config} extension disabled={opening||active} onBet={selection=>void open(selection)}/>{error&&<Notice tone="error">{error}</Notice>}{operation?.marketId===market.id&&(operation.status!=='confirmed'||!!operation.error)&&<Notice tone={operation.error?'error':'info'}>{operation.error??({signing:'Confirmá en Phantom…',pending:'Transacción enviada. Esperando confirmación…',confirmed:'Apuesta confirmada en Solana.',failed:'La transacción falló.',expired:'La transacción expiró.',cancelled:'Firma cancelada.'}[operation.status]??operation.status)}{operation.receipt&&<a href={`https://explorer.solana.com/tx/${operation.receipt.signature}?cluster=devnet`} target="_blank" rel="noopener noreferrer"> Ver transacción</a>}</Notice>}</>;
}
export function byteMarketView(market:DisplayByteMarket,config:ByteConfig|undefined,operation?:ExtensionOperation){
 let view=roots.get(market.id);if(!view){const node=document.createElement('article');node.className='prediction';node.dataset.marketId=market.id;view={node,root:createRoot(node),generation};roots.set(market.id,view);enableSpotlight(node);}view.generation=generation;view.node.dataset.predictionId=market.notes?.twitch?.predictionId??'';
 flushSync(()=>view.root.render(<ExtensionMarket market={market} config={config} operation={operation}/>));return view.node;
}

// Twitch data stays separate from real markets and never enters the wallet flow.
export function TwitchMarketPreview({item,extension=false}:{item:TwitchPreview;extension?:boolean}){
 const p=item.prediction,[now,setNow]=useState(Date.now()),Heading=extension?'h1':'h3';
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
 const closed=p.status!=='ACTIVE'||!!p.lockedAt||now>=closesAt(p),remaining=Math.max(0,Math.ceil((closesAt(p)-now)/1000));
 const hasPoints=p.outcomes.every(o=>o.totalPoints!=null),total=p.outcomes.reduce((sum,o)=>sum+(o.totalPoints??0),0),number=(n:number)=>new Intl.NumberFormat('es-AR').format(n);
 return <section className="points-market byte-betting byte-preview" aria-label="Predicción de Twitch sin mercado en Solana">
  <div className="topline market-heading"><span>@{p.channel} · Twitch</span><span>{closed?'Predicción cerrada':`${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`}</span></div>
  <Heading className="market-question">{p.title}</Heading>
  <div className="points-market-head"><span className="points-status"><span className="status-mark"/>{p.status==='RESOLVED'?'Resultado de Twitch':p.status==='CANCELED'?'Cancelada en Twitch':closed?'Cerrada en Twitch':'Esperando mercado'}</span><Badge variant="secondary">Vista previa · Twitch</Badge></div>
  <div className="pool-summary"><div className="points-pool"><span>Puntos del canal en Twitch</span><strong>{hasPoints?number(total):'—'} <small>puntos</small></strong></div></div>
  <div className="pool-split" role="img" aria-label="Distribución de puntos de Twitch">{p.outcomes.map((o,i)=><span key={o.id} className={i%2===0?'share-primary':'share-secondary'} style={{width:`${hasPoints&&total?(o.totalPoints??0)/total*100:0}%`}}/>)}</div>
  <div className="points-options">{p.outcomes.map((o,i)=><div key={o.id} className={`points-option ${i%2===0?'side-first':'side-second'}`}><div className="option-heading"><strong>{o.title}</strong><span>{hasPoints&&total?`${Math.round((o.totalPoints??0)/total*100)}%`:'—'}</span></div><p>{o.totalPoints==null?'Puntos no disponibles':`${number(o.totalPoints)} puntos de Twitch`}</p>{p.winningOutcomeId===o.id&&<span className="points-winner"><Check size={15}/>Resultado ganador</span>}<Button className="points-bet" tone={i%2===0?'positive':'negative'} disabled>Apostar a {o.title}<ArrowUpRight size={15}/></Button></div>)}</div>
  <Notice>{closed?'Esta predicción ya cerró en Twitch.':'Byte alcanzó su límite. Mostramos la predicción y reintentamos crear el mercado automáticamente.'} Las apuestas en SOL estarán disponibles cuando exista el mercado en Solana.</Notice>
 </section>;
}
export function twitchPreviewView(item:TwitchPreview){
 const key=`twitch:${item.prediction.channel}:${item.prediction.id}`;let view=roots.get(key);
 if(!view){const node=document.createElement('article');node.className='prediction';node.dataset.predictionId=item.prediction.id;view={node,root:createRoot(node),generation};roots.set(key,view);enableSpotlight(node);}view.generation=generation;
 flushSync(()=>view.root.render(<TwitchMarketPreview item={item} extension/>));return view.node;
}
