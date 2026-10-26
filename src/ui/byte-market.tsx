import {useEffect,useState} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {ArrowUpRight,Check} from 'lucide-react';
import {Button} from './components/button.js';
import {Input} from './components/input.js';
import {Badge} from './components/badge.js';
import {Notice} from './components/plot.js';
import {enableSpotlight} from './components/materials.js';
import {solToLamports,type ByteConfig,type DisplayByteMarket} from '../byte-model.js';
export const sol=(amount:number|string)=>new Intl.NumberFormat('es-AR',{maximumFractionDigits:9}).format(Number(amount)/1e9);
export type ByteSelection={amount:string;option:number};
export function ByteBetting({market:m,config,disabled=false,initial,onBet,onEdit,extension=false}:{market:DisplayByteMarket;config?:ByteConfig;disabled?:boolean;initial?:ByteSelection;onBet:(selection:ByteSelection)=>void;onEdit?:()=>void;extension?:boolean}){
 const [amount,setAmount]=useState(initial?.amount??'0.01'),[selected,setSelected]=useState(initial?.option),[error,setError]=useState(''),[now,setNow]=useState(Date.now());
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
 const unit=m.currency==='sol'?'SOL':'unidades BYTE';
 const units=(value:number|string)=>m.currency==='sol'?sol(value):new Intl.NumberFormat('es-AR').format(Number(value));
 const open=m.status==='open'&&m.bettable&&now<m.closeMs;
 const change=(value:string)=>{setAmount(value);setError('');onEdit?.();};
 const choose=(option:number)=>{try{const value=solToLamports(amount);if(config&&(value>BigInt(config.sol.maxBet)||BigInt(m.total)+value>BigInt(config.sol.maxPool)))throw new Error('La apuesta supera los límites del mercado.');setError('');setSelected(option);onBet({option,amount});}catch(e){setError((e as Error).message);}};
 return <section className="points-market byte-betting">
  <div className="points-market-head"><span className={`points-status ${open?'live':''}`}><span className="status-mark"/>{m.status==='invalid'?'Anulado':m.status==='resolved'?'Resultado confirmado':open?'Apuestas abiertas':'Esperando resultado'}</span><Badge variant="secondary">{m.currency==='sol'?'SOL devnet':'BYTE devnet'}</Badge></div>
  <div className="pool-summary"><div className="points-pool"><span>Pozo de la comunidad</span><strong>{units(m.total)} <small>{unit}</small></strong></div><div className="pool-people"><span>{m.bettors} {m.bettors===1?'participante':'participantes'}</span></div></div>
  <div className="pool-split" role="img" aria-label={`Distribución del pozo: ${m.options.map((o,i)=>`${o} ${units(m.pools[i])} ${unit}`).join(', ')}`}>{m.options.map((o,i)=><span key={i} className={i%2===0?'share-primary':'share-secondary'} title={o} style={{width:`${m.total?m.pools[i]/m.total*100:0}%`}}/>)}</div>
  {open&&m.currency==='sol'&&<div className="stake-row"><label className="points-stake"><span>Tu apuesta</span><span className="stake-input"><Input aria-label="Importe en SOL devnet" inputMode="decimal" value={amount} disabled={disabled} onChange={e=>change(e.target.value)}/><span>SOL</span></span></label><div className="points-quick">{['0.01','0.05','0.1'].map(v=><Button key={v} variant="ghost" size="sm" disabled={disabled} aria-pressed={amount===v} onClick={()=>change(v)}>{v}</Button>)}</div></div>}
  <div className="points-options">{m.options.map((label,i)=><div className={`points-option ${i%2===0?'side-first':'side-second'}`} key={i} data-selected={selected===i}><div className="option-heading"><strong>{label}</strong><span>{m.total?`${new Intl.NumberFormat('es-AR',{maximumFractionDigits:1}).format(m.pools[i]/m.total*100)}%`:'—'}</span></div><p>{units(m.pools[i])} {unit} en el pozo</p>{m.winner===i&&<span className="points-winner"><Check size={15}/>Resultado ganador</span>}{open&&m.currency==='sol'&&<Button className="points-bet" tone={i%2===0?'positive':'negative'} aria-pressed={selected===i} disabled={disabled||!config?.enabled} onClick={()=>choose(i)}>Apostar a {label}<ArrowUpRight size={15}/></Button>}</div>)}</div>
  {open&&<p className="points-rule">{extension?'Continuás en el panel para confirmar con Phantom.':'Confirmás con tu wallet en Solana devnet.'} Porcentaje del pozo, no probabilidad.</p>}
  {error&&<Notice tone="error">{error}</Notice>}
  {m.currency!=='sol'&&<Notice>Este mercado usa BYTE. Las apuestas de esta aplicación están disponibles en SOL devnet.</Notice>}
  {m.status!=='open'&&<Notice tone={m.chain.settled?'success':'info'}>{m.chain.settled?'Pagos o reembolsos completados en cadena.':'Resultado registrado. Esperando que byte complete los pagos.'}</Notice>}
 </section>;
}
const roots=new Map<string,{node:HTMLElement;root:Root;generation:number}>();let generation=0;
export function disposeByteViews(){const current=++generation;queueMicrotask(()=>{for(const [key,v]of roots)if(v.generation<current){v.root.unmount();roots.delete(key);}});}
export function byteMarketView(market:DisplayByteMarket,config:ByteConfig|undefined,base:string){
 let view=roots.get(market.id);if(!view){const node=document.createElement('article');node.className='prediction';node.dataset.marketId=market.id;view={node,root:createRoot(node),generation};roots.set(market.id,view);enableSpotlight(node);}view.generation=generation;
 const open=(selection:ByteSelection)=>{const url=new URL('/byte',base);url.search=new URLSearchParams({market:market.id,channel:market.notes?.channel??'',option:String(selection.option),amount:selection.amount}).toString();window.open(url.href,'_blank','noopener');};
 flushSync(()=>view.root.render(<><div className="topline"><span>@{market.notes?.channel??'partner'}</span><span>{new Date(market.closeMs).toLocaleString('es-AR')}</span></div><h1>{market.title}</h1><ByteBetting market={market} config={config} extension onBet={open}/></>));return view.node;
}
