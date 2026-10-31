import {useEffect,useState} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {ArrowUpRight,Check} from 'lucide-react';
import {confirmedRefund} from '../byte-refund.js';
import type {BetReceipt} from '../byte-bet-core.js';
import {SolRefund} from './components/sol-refund.js';
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
export function ByteBetting({market:m,config,disabled=false,initial,onBet,onEdit,extension=false,resolution=false,minimal=false,wallet,receipts=[]}:{market:DisplayByteMarket;config?:ByteConfig;disabled?:boolean;initial?:ByteSelection;onBet:(selection:ByteSelection)=>void;onEdit?:()=>void;extension?:boolean;resolution?:boolean;minimal?:boolean;wallet?:string;receipts?:BetReceipt[]}){
 const [amount,setAmount]=useState(initial?.amount??'0.01'),[selected,setSelected]=useState(initial?.option),[error,setError]=useState(''),[now,setNow]=useState(Date.now());
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
 const locale=extension?'en-US':'es-AR';
 const unit=m.currency==='sol'?'SOL':extension?'BYTE units':'unidades BYTE';
 const units=(value:number|string)=>m.currency==='sol'?new Intl.NumberFormat(locale,{maximumFractionDigits:9}).format(Number(value)/1e9):new Intl.NumberFormat(locale).format(Number(value));
 const open=m.status==='open'&&m.bettable&&now<m.closeMs;
 const change=(value:string)=>{setAmount(value);setError('');onEdit?.();};
 const choose=(option:number)=>{try{const value=solToLamports(amount);if(config&&(value>BigInt(config.sol.maxBet)||BigInt(m.total)+value>BigInt(config.sol.maxPool)))throw new Error(extension?'The stake is over the market limits.':'La apuesta supera los límites del mercado.');setError('');setSelected(option);onBet({option,amount});}catch(e){const message=(e as Error).message;setError(extension?({'Ingresá SOL con hasta 9 decimales.':'Enter SOL with up to 9 decimal places.','La apuesta mínima es 0,0001 SOL.':'The minimum stake is 0.0001 SOL.'} as Record<string,string>)[message]??message:message);}};
 // Byte refunds an empty winning pool even when Twitch has a valid winner.
 // Preserve that sporting result without presenting the refund as a win/payout.
 const sourceWinner=m.status==='invalid'&&m.invalidReason==='nobody bet on the outcome'&&m.notes?.twitch?.status==='RESOLVED'?m.notes.resolution?.winner:null;
 const refundedWinner=sourceWinner!=null&&!!m.options[sourceWinner]&&m.pools[sourceWinner]===0?sourceWinner:null;
 const refund=confirmedRefund(m,wallet,receipts);
 if(refund)return <section className="points-market byte-betting"><div className="topline">{extension?'Round':'Ronda'} {new Date(m.openMs).toLocaleString(locale)}</div><SolRefund english={extension} title={m.title} channel={m.notes?.channel??'partner'} refund={refund} winner={refundedWinner!==null?m.options[refundedWinner]:undefined}>
  <Notice tone="success">{extension?'Refund completed on-chain.':'Reembolso completado en cadena.'}</Notice><a className="resolution-chain-link" href={`https://explorer.solana.com/address/${m.chain.market}?cluster=devnet`} target="_blank" rel="noopener noreferrer">{extension?'View market on Solana devnet':'Ver mercado en Solana devnet'} <ArrowUpRight size={14}/></a>
 </SolRefund></section>;
 if((extension&&m.status!=='open')||(resolution&&['resolved','invalid'].includes(m.status)))return <section className="points-market byte-betting"><div className="topline">{extension?'Round':'Ronda'} {new Date(m.openMs).toLocaleString(locale)}</div><Resolution english={extension} title={m.title} channel={m.notes?.channel??'partner'} outcomes={m.options.map((title,i)=>({id:String(i),title}))} winnerId={m.winner!==null?String(m.winner):refundedWinner!==null?String(refundedWinner):undefined} canceled={m.status==='invalid'&&refundedWinner===null} accountKnown={false} unavailableMessage={extension?'Your payout amount is not available.':'El importe de tu cobro no está disponible.'}>
  {refundedWinner!==null&&<Notice>{extension?`Result confirmed on Twitch. SOL market voided: nobody staked the winning option. ${m.chain.settled?'Refunds completed on-chain.':'Refunds are still pending from Byte.'}`:`Resultado confirmado en Twitch. Mercado SOL anulado: no hubo apuestas a la opción ganadora. ${m.chain.settled?'Reembolsos completados en cadena.':'Reembolsos pendientes de Byte.'}`}</Notice>}
  <Notice tone={m.chain.settled?'success':'info'}>{m.chain.settled?(extension?'Payouts or refunds completed on-chain.':'Pagos o reembolsos completados en cadena.'):(extension?'Result recorded. Waiting for byte to finish payouts.':'Resultado registrado. Esperando que byte complete los pagos.')}</Notice>
  <a className="resolution-chain-link" href={`https://explorer.solana.com/address/${m.chain.market}?cluster=devnet`} target="_blank" rel="noopener noreferrer">{extension?'View market on Solana devnet':'Ver mercado en Solana devnet'} <ArrowUpRight size={14}/></a>
 </Resolution></section>;
 return <section className="points-market byte-betting">
  <div className="points-market-head"><span className={`points-status ${open?'live':''}`}><span className="status-mark"/>{m.status==='invalid'?(extension?'Voided':'Anulado'):m.status==='resolved'?(extension?'Result confirmed':'Resultado confirmado'):open?(extension?'Staking open':'Apuestas abiertas'):(extension?'Waiting for the result':'Esperando resultado')}</span><Badge variant="secondary">{m.currency==='sol'?'SOL devnet':'BYTE devnet'}</Badge></div>
  <div className="pool-summary"><div className="points-pool"><span>{extension?'Community pool':'Pozo de la comunidad'}</span><strong>{units(m.total)} <small>{unit}</small></strong></div><div className="pool-people"><span>{m.bettors} {m.bettors===1?(extension?'participant':'participante'):(extension?'participants':'participantes')}</span></div></div>
  <div className="pool-split" role="img" aria-label={extension?`Pool split: ${m.options.map((o,i)=>`${o} ${units(m.pools[i])} ${unit}`).join(', ')}`:`Distribución del pozo: ${m.options.map((o,i)=>`${o} ${units(m.pools[i])} ${unit}`).join(', ')}`}>{m.options.map((o,i)=><span key={i} className={i%2===0?'share-primary':'share-secondary'} title={o} style={{width:`${m.total?m.pools[i]/m.total*100:0}%`}}/>)}</div>
  {open&&m.currency==='sol'&&<div className="stake-row"><label className="points-stake"><span>{extension?'Your stake':'Tu apuesta'}</span><span className="stake-input"><Input aria-label={extension?'Amount in SOL devnet':'Importe en SOL devnet'} inputMode="decimal" value={amount} disabled={disabled} onChange={e=>change(e.target.value)}/><span>SOL</span></span></label><div className="points-quick">{['0.01','0.05','0.1'].map(v=><Button key={v} variant="ghost" size="sm" disabled={disabled} aria-pressed={amount===v} onClick={()=>change(v)}>{v}</Button>)}</div></div>}
  <div className="points-options">{m.options.map((label,i)=><div className={`points-option ${i%2===0?'side-first':'side-second'}`} key={i} data-selected={selected===i}><div className="option-heading"><strong>{label}</strong><span>{m.total?`${new Intl.NumberFormat(locale,{maximumFractionDigits:1}).format(m.pools[i]/m.total*100)}%`:'—'}</span></div><p>{units(m.pools[i])} {unit} {extension?'in the pool':'en el pozo'}</p>{m.winner===i&&<span className="points-winner"><Check size={15}/>{extension?'Winning result':'Resultado ganador'}</span>}{open&&m.currency==='sol'&&<Button className="points-bet" tone={i%2===0?'positive':'negative'} aria-pressed={selected===i} disabled={disabled||!config?.enabled} onClick={()=>choose(i)}>{extension?`Stake on ${label}`:`Apostar a ${label}`}<ArrowUpRight size={15}/></Button>}</div>)}</div>
  {open&&!extension&&!minimal&&<p className="points-rule">Confirmás con tu wallet en Solana devnet. Porcentaje del pozo, no probabilidad.</p>}
  {error&&<Notice tone="error">{error}</Notice>}
  {m.currency!=='sol'&&<Notice>{extension?'This market uses BYTE. Stakes in this app are available on SOL devnet.':'Este mercado usa BYTE. Las apuestas de esta aplicación están disponibles en SOL devnet.'}</Notice>}
  {m.status!=='open'&&<Notice tone={m.chain.settled?'success':'info'}>{m.chain.settled?(extension?'Payouts or refunds completed on-chain.':'Pagos o reembolsos completados en cadena.'):(extension?'Result recorded. Waiting for byte to finish payouts.':'Resultado registrado. Esperando que byte complete los pagos.')}</Notice>}
 </section>;
}
const roots=new Map<string,{node:HTMLElement;root:Root;generation:number}>();let generation=0;
export function disposeByteViews(){const current=++generation;queueMicrotask(()=>{for(const [key,v]of roots)if(v.generation<current){v.root.unmount();roots.delete(key);}});}
type ExtensionOperation={marketId:string;status:string;error?:string;receipt?:{signature:string}};
function ExtensionMarket({market,config,operation,wallet,receipts}:{market:DisplayByteMarket;config?:ByteConfig;operation?:ExtensionOperation;wallet?:string;receipts?:BetReceipt[]}){
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
 return <>{market.status==='open'&&<><div className="topline"><span>@{market.notes?.channel??'partner'} · Round {new Date(market.openMs).toLocaleString('en-US')}</span><span>Closes: {new Date(market.closeMs).toLocaleString('en-US')}</span></div><h1>{market.title}</h1></>}<ByteBetting market={market} config={config} wallet={wallet} receipts={receipts} extension disabled={opening||active} onBet={selection=>void open(selection)}/>{error&&<Notice tone="error">{error}</Notice>}{operation?.marketId===market.id&&(operation.status!=='confirmed'||!!operation.error)&&<Notice tone={operation.error?'error':'info'}>{operation.error??({signing:'Confirm in Phantom…',pending:'Transaction sent. Waiting for confirmation…',confirmed:'Stake confirmed on Solana.',failed:'The transaction failed.',expired:'The transaction expired.',cancelled:'Signature canceled.'}[operation.status]??operation.status)}{operation.receipt&&<a href={`https://explorer.solana.com/tx/${operation.receipt.signature}?cluster=devnet`} target="_blank" rel="noopener noreferrer"> View transaction</a>}</Notice>}</>;
}
export function byteMarketView(market:DisplayByteMarket,config:ByteConfig|undefined,operation?:ExtensionOperation,wallet?:string,receipts:BetReceipt[]=[]){
 let view=roots.get(market.id);if(!view){const node=document.createElement('article');node.className='prediction';node.dataset.marketId=market.id;view={node,root:createRoot(node),generation};roots.set(market.id,view);enableSpotlight(node);}view.generation=generation;view.node.dataset.predictionId=market.notes?.twitch?.predictionId??'';
 flushSync(()=>view.root.render(<ExtensionMarket market={market} config={config} operation={operation} wallet={wallet} receipts={receipts}/>));return view.node;
}

// Twitch data stays separate from real markets and never enters the wallet flow.
export function TwitchMarketPreview({item,extension=false}:{item:TwitchPreview;extension?:boolean}){
 const p=item.prediction,[now,setNow]=useState(Date.now()),Heading=extension?'h1':'h3';
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
 const closed=p.status!=='ACTIVE'||!!p.lockedAt||now>=closesAt(p),remaining=Math.max(0,Math.ceil((closesAt(p)-now)/1000));
 const hasPoints=p.outcomes.every(o=>o.totalPoints!=null),total=p.outcomes.reduce((sum,o)=>sum+(o.totalPoints??0),0),locale=extension?'en-US':'es-AR',number=(n:number)=>new Intl.NumberFormat(locale).format(n);
 const winner=p.outcomes.find(o=>o.id===p.winningOutcomeId);
 if(p.status==='CANCELED'||(p.status==='RESOLVED'&&winner))return <section className="points-market byte-betting byte-preview" aria-label={extension?'Twitch result with no Solana market':'Resultado de Twitch sin mercado en Solana'}>
  <div className="topline">{extension?'Round':'Ronda'} {new Date(p.createdAt).toLocaleString(locale)}</div>
  <Resolution english={extension} title={p.title} channel={p.channel} outcomes={p.outcomes} winnerId={winner?.id} canceled={p.status==='CANCELED'}>
   <Notice>{p.status==='CANCELED'?(extension?'Twitch canceled this round.':'Twitch canceló esta ronda.'):(extension?'Result confirmed on Twitch.':'Resultado confirmado en Twitch.')} {extension?'This round had no SOL market or stakes.':'Esta ronda no tuvo mercado ni apuestas en SOL.'}</Notice>
  </Resolution>
 </section>;
 return <section className="points-market byte-betting byte-preview" aria-label={extension?'Twitch prediction with no Solana market':'Predicción de Twitch sin mercado en Solana'}>
  <div className="topline market-heading"><span>@{p.channel} · Twitch</span><span>{closed?(extension?'Prediction closed':'Predicción cerrada'):`${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`}</span></div>
  <Heading className="market-question">{p.title}</Heading>
  <div className="points-market-head"><span className="points-status"><span className="status-mark"/>{closed?(extension?'Waiting for the Twitch result':'Esperando resultado de Twitch'):(extension?'Waiting for the market':'Esperando mercado')}</span><Badge variant="secondary">{extension?'Preview · Twitch':'Vista previa · Twitch'}</Badge></div>
  <div className="pool-summary"><div className="points-pool"><span>{extension?'Channel points on Twitch':'Puntos del canal en Twitch'}</span><strong>{hasPoints?number(total):'—'} <small>{extension?'points':'puntos'}</small></strong></div></div>
  <div className="pool-split" role="img" aria-label={extension?'Twitch points split':'Distribución de puntos de Twitch'}>{p.outcomes.map((o,i)=><span key={o.id} className={i%2===0?'share-primary':'share-secondary'} style={{width:`${hasPoints&&total?(o.totalPoints??0)/total*100:0}%`}}/>)}</div>
  <div className="points-options">{p.outcomes.map((o,i)=><div key={o.id} className={`points-option ${i%2===0?'side-first':'side-second'}`}><div className="option-heading"><strong>{o.title}</strong><span>{hasPoints&&total?`${Math.round((o.totalPoints??0)/total*100)}%`:'—'}</span></div><p>{o.totalPoints==null?(extension?'Points unavailable':'Puntos no disponibles'):extension?`${number(o.totalPoints)} Twitch points`:`${number(o.totalPoints)} puntos de Twitch`}</p>{p.winningOutcomeId===o.id&&<span className="points-winner"><Check size={15}/>{extension?'Winning result':'Resultado ganador'}</span>}<Button className="points-bet" tone={i%2===0?'positive':'negative'} disabled>{extension?`Stake on ${o.title}`:`Apostar a ${o.title}`}<ArrowUpRight size={15}/></Button></div>)}</div>
  <Notice>{closed?(extension?'Staking is closed. Waiting for Twitch to confirm the result; this round had no Solana market.':'Apuestas cerradas. Esperando que Twitch confirme el resultado; esta ronda no tuvo mercado en Solana.'):(extension?'Byte hit its limit. The prediction stays visible and market creation retries automatically. SOL stakes open once the Solana market exists.':'Byte alcanzó su límite. Mostramos la predicción y reintentamos crear el mercado automáticamente. Las apuestas en SOL estarán disponibles cuando exista el mercado en Solana.')}</Notice>
 </section>;
}
export function twitchPreviewView(item:TwitchPreview){
 const key=`twitch:${item.prediction.channel}:${item.prediction.id}`;let view=roots.get(key);
 if(!view){const node=document.createElement('article');node.className='prediction';node.dataset.predictionId=item.prediction.id;view={node,root:createRoot(node),generation};roots.set(key,view);enableSpotlight(node);}view.generation=generation;
 flushSync(()=>view.root.render(<TwitchMarketPreview item={item} extension/>));return view.node;
}
