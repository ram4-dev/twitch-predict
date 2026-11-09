import {BettingModeLabel,type BettingMode} from './components/betting-mode.js';
import {UserMarketCard,BetSheet,type Selection} from './components/user-market-card.js';
import {MarketDetail} from './market-detail.js';
import {createPointsClient} from './points-ui.js';
import type {AppMarket,AppAccount} from './mobile-app-data.js';
import {useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Download,Link2,MonitorSmartphone,ExternalLink,Share2} from 'lucide-react';
import {channelFromPath,StreamerIdentity,QrBlock,SearchLink,StreamerMarket,StreamerStates,useMarketStream,restoreWallet,WalletButton,connectWallet,drawQr,walletError,phantomBrowseUrl,readIntention,type StreamerChannel} from './streamer-page.js';
import {type ByteConfig,type DisplayByteMarket} from '../byte-model.js';
import type {TwitchPreview} from '../twitch-preview.js';
import {TwitchMarketPreview} from './byte-market.js';
import {reconcileBytePredictions} from '../popup-cache.js';
import {Scene} from './scene.js';
import {PlotMascot,PlotBrandLink} from './components/plot.js';
import {Button} from './components/button.js';
import {enhanceGlowStage} from '@/components/ui/spotlight-card';

type LoadState={loading:boolean;error:string;markets:DisplayByteMarket[];previews:TwitchPreview[];points:AppMarket[];mode?:BettingMode};

/** Anonymous channel snapshot; existence and availability come from the served markets, not guesses. */
export function useChannelData(login:string|undefined){
  const [state,setState]=useState<LoadState>({loading:!!login,error:'',markets:[],previews:[],points:[]});
  const reload=useRef(async()=>{
    if(!login)return;
    try{
      const statusResponse=await fetch('/api/byte/status');
      if(!statusResponse.ok)throw new Error('No pudimos consultar el estado del canal.');
      const status=await statusResponse.json();
      if(status.configured){
        const response=await fetch('/api/byte/markets');
        if(!response.ok)throw new Error('No pudimos cargar las predicciones del canal.');
        const data=await response.json();
        const reconciled=reconcileBytePredictions(data.markets??[],(data.predictions??[]) as TwitchPreview[],login);
        const pointsResponse=await fetch('/api/markets');
        if(!pointsResponse.ok)throw new Error('No pudimos cargar las predicciones de Plot.');
        const native=(await pointsResponse.json() as AppMarket[]).filter(m=>m.source==='plot'&&m.prediction.channel.toLowerCase()===login);
        setState({loading:false,error:'',markets:reconciled.markets,previews:reconciled.predictions,points:native,mode:native.length&&!reconciled.markets.length&&!reconciled.predictions.length?'points':'byte'});
        return;
      }
      const response=await fetch('/api/markets');
      if(!response.ok)throw new Error('No pudimos cargar las predicciones del canal.');
      const data=await response.json() as AppMarket[];
      const points=data.filter(m=>m.prediction.channel.toLowerCase()===login);
      setState({loading:false,error:'',markets:[],previews:[],points,mode:'points'});
    }catch(e){setState({loading:false,error:(e as Error).message,markets:[],previews:[],points:[]});}
  });
  useMarketStream(()=>void reload.current());
  useEffect(()=>{void reload.current();},[login]);
  return {state,refresh:()=>reload.current()};
}

/** /join/twitch/:login — phone goes straight to the channel; desktop gets the QR handoff. */
export function isHandheld():boolean{
  if(new URLSearchParams(location.search).has('desktop'))return false;
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
}

export function JoinPage({channel}:{channel:StreamerChannel}){
  const target=`/s/${channel.platform}/${channel.login}`;
  const [continuing,setContinuing]=useState(false);
  useEffect(()=>{
    if(!isHandheld())return;
    // Replace, not assign: the QR/button handoff must not trap the Back button in a /join loop.
    location.replace(target);
  },[target]);
  return <main className="streamer-page join-page">
    <Scene compact/>
    <StreamerIdentity login={channel.login}/>
    <p className="join-copy">Las predicciones de @{channel.login}, en tu celular.</p>
    <p className="join-sub">Escaneá el QR para participar mientras seguís mirando el stream.</p>
    <QrBlock value={`${location.origin}${target}`} label={`QR para abrir las predicciones de @${channel.login}`}/>
    <Button className="join-continue" onClick={()=>{setContinuing(true);location.assign(target);}}><MonitorSmartphone size={16}/>Continuar en este dispositivo</Button>
    {continuing&&<p role="status">Abriendo…</p>}
    <a className="streamer-direct-link" href={target}>Continuar directo a las predicciones</a>
    <SearchLink/>
  </main>;
}

/** /overlay/twitch/:login — OBS browser source: QR plus a one-line call to participate. */
export function OverlayPage({channel}:{channel:StreamerChannel}){
  const target=`/s/${channel.platform}/${channel.login}`;
  return <main className="streamer-page overlay-page">
    <div className="overlay-card">
      <StreamerIdentity login={channel.login} platform={channel.platform}/>
      <QrBlock value={`${location.origin}${target}`} size={220} label={`Participá en las predicciones de @${channel.login}`}/>
      <p className="overlay-call">Escaneá el QR y participá en el pozo de las predicciones.</p>
    </div>
  </main>;
}

/** /s/twitch/:login — the public channel page. */
export function ChannelPage({channel}:{channel:StreamerChannel}){
  const {state,refresh}=useChannelData(channel.login);
  const mode=state.mode;
  const [wallet,setWallet]=useState(''),[config,setConfig]=useState<ByteConfig>(),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{void restoreWallet().then(setWallet);},[]);
  useEffect(()=>{void fetch('/api/byte/config').then(r=>r.json()).then(setConfig).catch(()=>{});},[]);
  const connect=async()=>{
    setBusy(true);setError('');
    try{setWallet(await connectWallet());}
    catch(e){setError(walletError(e));}
    finally{setBusy(false);}
  };
  // Opening Phantom's in-app browser carries the channel and bet intention as public
  // parameters; no tokens ride the link, and the user re-confirms before signing.
  const openPhantom=()=>{
    const intention=new URLSearchParams(readIntention());
    const params=intention.toString();
    try{location.assign(phantomBrowseUrl(`${location.pathname}${params?`?${params}`:''}`));}
    catch(e){setError((e as Error).message);}
  };
  const share=`/join/${channel.platform}/${channel.login}`;
  const copy=async(value:string,label:string)=>{
    try{await navigator.clipboard.writeText(value);setError('');}
    catch{setError(`No pudimos copiar ${label}.`);}
  };
  const downloadQr=async()=>{
    const canvas=document.createElement('canvas');
    await drawQr(canvas,`${location.origin}/s/${channel.platform}/${channel.login}`);
    const link=document.createElement('a');link.download=`plot-qr-${channel.login}.png`;link.href=canvas.toDataURL('image/png');link.click();
  };
  const visible=state.markets.filter(m=>m.status==='open');
  const closed=state.markets.filter(m=>m.status!=='open');
  return <main className="streamer-page" ref={node=>{if(node)enhanceGlowStage(node);}}>
    <header className="streamer-head"><PlotBrandLink logoClassName="streamer-brand"/><WalletButton wallet={wallet} busy={busy} onConnect={()=>void connect()} onOpenPhantom={openPhantom}/></header>
    <div className="byte-connection"><BettingModeLabel mode={mode}/>{mode==='byte'&&state.points.length>0&&<> · <BettingModeLabel mode="points"/></>}</div>
    <StreamerIdentity login={channel.login}/>
    <div className="streamer-tools">
      <Button variant="ghost" onClick={()=>void copy(`${location.origin}${share}`,'el enlace del canal')}><Share2 size={15}/>Compartir canal</Button>
      <Button variant="ghost" onClick={downloadQr}><Download size={15}/>Descargar QR</Button>
      <Button variant="ghost" onClick={()=>void copy(`${location.origin}/overlay/${channel.platform}/${channel.login}`,'la URL de OBS')}><Link2 size={15}/>Copiar URL para OBS</Button>
      <a href={`/app?channel=${encodeURIComponent(channel.login)}`}><ExternalLink size={15}/>Mis apuestas</a>
    </div>
    {error&&<p role="alert">{error}</p>}
    <StreamerStates login={channel.login} loading={state.loading} loadError={state.error} markets={state.markets} previews={state.previews} hasPoints={state.points.length>0}>
      <PublicPoints markets={state.points} onDone={refresh} wallet={wallet}/>
      {visible.map(m=><StreamerMarket key={m.id} market={m} config={config} wallet={wallet} disabled={busy} intention={readIntention()} onDone={refresh}/>)}
      {state.previews.map(item=><div className="market-card byte-market" key={`preview:${item.prediction.channel}:${item.prediction.id}`}><TwitchMarketPreview item={item}/></div>)}
      {closed.length>0&&<section><h2 className="byte-subheading">Predicciones cerradas</h2>{closed.map(m=><StreamerMarket key={m.id} market={m} config={config} wallet={wallet} disabled onDone={refresh}/>)}</section>}
    </StreamerStates>
    <SearchLink/>
  </main>;
}

const pointsClient=createPointsClient('',{get:async()=>localStorage.getItem('pointsToken'),set:async token=>localStorage.setItem('pointsToken',token)});
function PublicPoints({markets,onDone,wallet}:{markets:AppMarket[];onDone:()=>Promise<void>;wallet:string}){
  const [selection,setSelection]=useState<Selection>(),[account,setAccount]=useState<AppAccount>(),[detail,setDetail]=useState('');
  useEffect(()=>{void pointsClient.me().then(setAccount).catch(()=>setAccount(undefined));},[wallet]);
  const market=markets.find(m=>m.key===detail);
  const bet=async(m:AppMarket,outcome:string,amount:number,id:string)=>{
    await pointsClient.bet({key:m.key,outcomeId:outcome,amount,requestId:id});
    setAccount(await pointsClient.me());await onDone();
  };
  return <div className="phone-app public-points theme-ember">
    {market?<MarketDetail market={market} layout="hybrid" account={account} onBack={()=>setDetail('')} onChoose={outcome=>setSelection({market,outcome})}/>:<div className="phone-feed">{markets.map(m=><UserMarketCard key={m.key} market={m} theme="ember" chosenOutcome={selection?.market.key===m.key?selection.outcome:account?.bets.filter(b=>b.marketKey===m.key).at(-1)?.outcomeId} onDetail={()=>setDetail(m.key)} onChoose={setSelection}/>)}</div>}
    {selection&&<BetSheet selection={selection} account={account} demo={false} theme="ember" onClose={()=>setSelection(undefined)} onBet={bet}/>}
  </div>;
}

const entry=channelFromPath(location.pathname);
createRoot(document.getElementById('streamer-root')!).render(
  entry?.view==='join'?<JoinPage channel={entry}/>:
  entry?.view==='overlay'?<OverlayPage channel={entry}/>:
  entry?<ChannelPage channel={entry}/>:
  <main className="streamer-page"><PlotMascot mood="doubt"/><h1>Página no encontrada</h1><p>Revisá el enlace del canal.</p><a href="/">Ir al inicio</a></main>
);
