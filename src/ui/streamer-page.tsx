export {phantomBrowseUrl} from './lib/phantom-browser.js';
import {twitchChannel} from '../mobile-model.js';
import {publicChannelPath} from '../public-paths.js';
import {useEffect,useRef,useState} from 'react';
import QRCode from 'qrcode';
import {Loader2,Wallet} from 'lucide-react';
import {Button} from './components/button.js';
import {PlotMascot,Notice} from './components/plot.js';
import {GlowCard} from '@/components/ui/spotlight-card';
import {type ByteConfig,type DisplayByteMarket} from '../byte-model.js';
import type {TwitchPreview} from '../twitch-preview.js';
import {ByteBetting,type ByteSelection} from './byte-market.js';
import {phantom,sendBet,receipts} from '../byte-wallet.js';

const short=(address:string)=>`${address.slice(0,5)}…${address.slice(-5)}`;

async function request<T>(path:string,body?:unknown):Promise<T>{
  const token=localStorage.getItem('pointsToken');
  const response=await fetch(`/api${path}`,{method:body===undefined?'GET':'POST',headers:{...(token?{authorization:`Bearer ${token}`}:{'accept':'application/json'}),...(body===undefined?{}:{'content-type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error??'No se pudo completar la operación');
  return data;
}

export function walletError(e:unknown){const error=e as Error&{code?:number;status?:number};return error.code===4001?'Cancelaste la operación en Phantom. Podés volver a intentar.':error.message;}

/** Parses /s/:platform/:login, /join/:platform/:login or /overlay/:platform/:login. */
export type StreamerChannel={view:'s'|'join'|'overlay';platform:'twitch';login:string;path:string};
export function channelFromPath(pathname:string):StreamerChannel|undefined{
  const match=/^\/(s|join|overlay)\/([a-z0-9_]{1,40})\/([a-z0-9_]{1,40})\/?$/i.exec(pathname);
  if(!match)return undefined;
  const channel=publicChannelPath(match[2],match[3]);
  return channel&&{view:match[1] as StreamerChannel['view'],...channel};
}

/** Normalizes viewer search input through the shared Twitch parser; empty when invalid. */
export function streamerChannel(input:string):string{
  try{return twitchChannel(input);}catch{return '';}
}

export async function drawQr(canvas:HTMLCanvasElement,value:string){
  await QRCode.toCanvas(canvas,value,{errorCorrectionLevel:'M',margin:2,width:512,color:{dark:'#080808',light:'#ffffff'}});
}

/** Live market updates via SSE; mirrors the dashboard refresh cadence without manual reloads. */
export function useMarketStream(reload:()=>void){
  useEffect(()=>{
    let ready=false,lastRefresh=0,pending:ReturnType<typeof setTimeout>|undefined;
    const bounce=()=>{if(pending)clearTimeout(pending);pending=setTimeout(()=>{lastRefresh=Date.now();reload();},250);};
    const stream=new EventSource('/api/live/markets');
    stream.addEventListener('ready',()=>{ready=true;lastRefresh=Date.now();reload();});
    stream.addEventListener('markets',()=>{if(ready)bounce();});
    stream.onerror=()=>{ready=false;};
    const timer=setInterval(()=>{if(!ready||Date.now()-lastRefresh>=30000){lastRefresh=Date.now();reload();}},6000);
    const visible=()=>{if(!document.hidden){lastRefresh=Date.now();reload();}};
    document.addEventListener('visibilitychange',visible);
    return()=>{stream.close();clearInterval(timer);if(pending)clearTimeout(pending);document.removeEventListener('visibilitychange',visible);};
  },[]);
}

function Avatar({login}:{login:string}){
  return <span className="streamer-avatar" aria-hidden="true">{login.slice(0,1).toUpperCase()}</span>;
}

export function StreamerIdentity({login,platform='twitch'}:{login:string;platform?:string}){
  return <div className="streamer-identity"><Avatar login={login}/><div><h1>@{login}</h1><p className="streamer-platform">{platform==='twitch'?'Twitch':platform} · predicciones en plot</p></div></div>;
}

export function SearchLink(){
  return <a className="streamer-search-link" href="/#streamer-search">Buscar otro streamer</a>;
}

export function QrBlock({value,size=180,label}:{value:string;size?:number;label:string}){
  const canvas=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{if(canvas.current)void drawQr(canvas.current,value).catch(()=>{});},[value]);
  return <figure className="streamer-qr" style={{width:size+24}}><canvas ref={canvas} width={512} height={512} style={{width:size,height:size}} aria-label={label} role="img"/>{label&&<figcaption>{label}</figcaption>}</figure>;
}

/** Bets on the public channel page: connect when the viewer wants to stake, keep their selection. */
export function StreamerMarket({market:m,config,wallet,disabled,onDone,intention}:{market:DisplayByteMarket;config?:ByteConfig;wallet:string;disabled:boolean;onDone:()=>Promise<void>;intention?:{market?:string;option?:string;amount?:string}}){
  const restored=intention?.market===m.id?intention:undefined;
  const initial=restored?{
    amount:/^\d+(\.\d{1,9})?$/.test(restored.amount??'')?restored.amount!:'0.01',
    option:Number.isInteger(Number(restored.option))&&Number(restored.option)>=0&&Number(restored.option)<m.options.length?Number(restored.option):0,
  }:undefined;
  const [selection,setSelection]=useState<ByteSelection>(initial??{amount:'0.01',option:0}),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[failed,setFailed]=useState(false);
  const bet=async(next:ByteSelection)=>{
    setSelection(next);
    if(!wallet){setMessage('Conectá tu wallet para apostar.');return;}
    if(busy||!config)return;setBusy(true);setFailed(false);
    try{
      const receipt=await sendBet(m,next.option,next.amount,wallet,config,setMessage);
      setMessage(receipt.status==='confirmed'?'':receipt.status==='pending'?'Confirmación pendiente. Revisá la firma en Mis apuestas antes de enviar otra.':receipt.status==='expired'?'La transacción expiró sin confirmación.':'La transacción falló en cadena.');
      setFailed(receipt.status==='failed');
    }catch(e){setMessage(walletError(e));setFailed(true);}finally{setBusy(false);await onDone();}
  };
  return <GlowCard className="market-card byte-market" data-market-id={m.id}>
    <div className="market-heading"><span>@{m.notes?.channel} · Twitch</span><span>Cierre: {new Date(m.closeMs).toLocaleString('es-AR')}</span></div>
    {!['resolved','invalid'].includes(m.status)&&<h3>{m.title}</h3>}
    <ByteBetting market={m} config={config} wallet={wallet} receipts={receipts()} resolution minimal initial={selection} disabled={disabled||busy} onBet={next=>void bet(next)}/>
    {message&&<Notice tone={failed?'error':'info'}>{message}</Notice>}
  </GlowCard>;
}

/** Page shell with the states the viewer can hit while the channel data loads. */
export function StreamerStates({login,loading,loadError,markets,previews,hasPoints=false,children}:{login:string;loading:boolean;loadError:string;markets:DisplayByteMarket[];previews:TwitchPreview[];hasPoints?:boolean;children?:React.ReactNode}){
  if(loading)return <div className="streamer-status" role="status"><Loader2 size={18} className="animate-spin"/> Consultando las predicciones de @{login}…</div>;
  if(loadError)return <div className="streamer-status" role="alert"><p>No pudimos consultar las predicciones de @{login}.</p><p>{loadError}</p></div>;
  const open=markets.filter(m=>m.status==='open'),closed=markets.filter(m=>m.status!=='open');
  if(!hasPoints&&!open.length&&!previews.length&&!closed.length)return <div className="streamer-status streamer-empty"><PlotMascot mood="doubt"/><p>@{login} todavía no tiene predicciones abiertas. Cuando abra una, aparecerá acá.</p><SearchLink/></div>;
  return <>{children}</>;
}

/** Minimal connect flow for the public page: Phantom sign-in without extension pairing. */
export async function connectWallet():Promise<string>{
  const provider=phantom() as ReturnType<typeof phantom>&{isPhantom?:boolean;signMessage?:(message:Uint8Array,display:string)=>Promise<{signature:Uint8Array;publicKey?:{toString():string}}>};
  if(!provider?.isPhantom||!provider.signMessage)throw new Error('No detectamos una wallet en este navegador. Tocá "Abrir en Phantom" para continuar en su navegador integrado.');
  const result=await provider.connect(),address=result.publicKey.toString();
  const challenge=await request<{challengeId:string;message:string}>('/auth/challenge',{address});
  const proof=await provider.signMessage(new TextEncoder().encode(challenge.message),'utf8');
  if(proof.publicKey&&proof.publicKey.toString()!==address)throw new Error('La wallet cambió durante la firma. Volvé a conectar.');
  const login=await request<{token:string}>('/auth/verify',{challengeId:challenge.challengeId,signature:btoa(String.fromCharCode(...proof.signature))});
  localStorage.setItem('pointsToken',login.token);
  return address;
}

/**
 * Mobile wallet transport: Phantom's documented `browse` universal link opens the
 * same channel page inside Phantom's in-app browser, where the injected provider
 * exists. Intention (channel/market/option/amount) travels in public query
 * parameters only — never tokens — because the regular browser and the in-app
 * browser do not share localStorage or session.
 * https://docs.phantom.com/phantom-deeplinks/other-methods/browse
 */


/** Reads the preserved bet intention from public query parameters; internal paths only. */
export function readIntention():{market?:string;option?:string;amount?:string}{
  const query=new URLSearchParams(location.search);
  const value=(key:string)=>{const raw=query.get(key);return raw&&/^[A-Za-z0-9_.:-]{1,64}$/.test(raw)?raw:undefined;};
  return {market:value('market'),option:value('option'),amount:value('amount')};
}

export async function restoreWallet():Promise<string>{
  if(!localStorage.getItem('pointsToken'))return '';
  try{
    const session=await request<{wallet:string|null}>('/points/me');
    return session.wallet??'';
  }catch(e){
    if((e as Error&{status?:number}).status===401)localStorage.removeItem('pointsToken');
    return '';
  }
}

export function WalletButton({wallet,busy,onConnect,onOpenPhantom}:{wallet:string;busy:boolean;onConnect:()=>void;onOpenPhantom?:()=>void}){
  const provider=phantom();
  if(wallet)return <span className="streamer-wallet" title={wallet}><Wallet size={15}/>{short(wallet)}</span>;
  if(provider?.isPhantom)return <Button variant="outline" disabled={busy} onClick={onConnect}><Wallet size={15}/>Conectar wallet</Button>;
  return <Button variant="outline" disabled={busy} onClick={onOpenPhantom??(()=>location.assign('https://phantom.com/download'))}><Wallet size={15}/>Abrir en Phantom</Button>;
}
