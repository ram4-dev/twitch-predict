import {PointsResolution} from './points-resolution.js';
import {hasPointsIdentity} from '../points-identity.js';
import {PointsFees} from './components/points-fees.js';
import {PointsSignIn} from './components/points-sign-in.js';
import {PreviewHeader} from './components/preview-header.js';
import {PlotLogo} from './components/plot.js';
import {UserMarketCard,BetSheet,type Selection} from './components/user-market-card.js';
import {useCallback,useEffect,useId,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Search,X,Check,ArrowUpRight,UserRound,Layers3,Plus,Loader2} from 'lucide-react';
import {TwitchIcon,GoogleIcon,PhantomIcon} from './brand-icons.js';
import {AnimatedBackdrop,backdropOptions,isBackdrop,type Backdrop} from './vendor/backgrounds/animated-backdrop.js';
import {MarketDetail,detailLayouts,isDetailLayout,type DetailLayout} from './market-detail.js';
import {Button} from './components/button.js';
import {LiquidGlass} from './vendor/opaline/liquid-glass.js';
import {PhoneGlass as Glass} from './components/phone-glass.js';
import {useActiveIndicator} from './vendor/opaline/use-active-indicator.js';
import {createPointsClient,number} from './points-ui.js';
import {enhancePointerGlow} from '@/components/ui/spotlight-card';
import {appThemes,applyDemoBet,demoSnapshot,isAppTheme,type AppMarket,type AppSnapshot,type AppTheme} from './mobile-app-data.js';
import {StreamerManager} from './streamer-manager.js';

type SearchResult={login:string;displayName:string;live:boolean};

const client=createPointsClient('',{get:async()=>localStorage.getItem('pointsToken'),set:async value=>localStorage.setItem('pointsToken',value),clear:async()=>localStorage.removeItem('pointsToken')});
const normalize=(value:string)=>value.trim().replace(/^@/,'').toLowerCase();


function useSnapshot(demo:boolean){
 const [snapshot,setSnapshot]=useState<AppSnapshot>(()=>demo?demoSnapshot():{markets:[],followed:[]});
 const [loading,setLoading]=useState(!demo),[error,setError]=useState('');const busy=useRef(false),queued=useRef(false),mounted=useRef(true);
 const refresh:()=>Promise<void>=useCallback(async()=>{
  if(demo)return;if(busy.current){queued.current=true;return;}busy.current=true;
  try{const [markets,channels,account]=await Promise.all([client.request<AppMarket[]>('/api/markets'),client.request<{channels:string[]}>('/api/channels'),client.me().catch(()=>undefined)]);if(mounted.current){setSnapshot(hasPointsIdentity(account)?{markets,account,followed:channels.channels}:{markets:[],followed:[]});setError('');}}
  catch(e){if(mounted.current)setError(e instanceof Error?e.message:'No pudimos actualizar.');}
  finally{busy.current=false;if(mounted.current){setLoading(false);if(queued.current){queued.current=false;void refresh();}}}
 },[demo]);
 useEffect(()=>{mounted.current=true;void refresh();if(demo)return;const timer=setInterval(()=>void refresh(),10000);return()=>{mounted.current=false;clearInterval(timer);};},[demo,refresh]);
 return {snapshot,setSnapshot,loading,error,refresh};
}
function StreamerSearch({snapshot,demo,query,setQuery,selected,setSelected,onFollow}:{snapshot:AppSnapshot;demo:boolean;query:string;setQuery:(value:string)=>void;selected:string;setSelected:(value:string)=>void;onFollow:(channel:string)=>Promise<void>}){
 const [open,setOpen]=useState(false),[remote,setRemote]=useState<SearchResult[]>([]),[cursor,setCursor]=useState(-1),[searching,setSearching]=useState(false),[error,setError]=useState(''),[following,setFollowing]=useState('');
 const input=useRef<HTMLInputElement>(null),root=useRef<HTMLDivElement>(null);const id=useId();const q=normalize(query);
 const local=useMemo(()=>[...new Set([...snapshot.followed,...snapshot.markets.map(m=>m.prediction.channel)])].filter(name=>name.includes(q)).map(login=>({login,displayName:login,live:snapshot.markets.some(m=>m.prediction.channel===login&&m.phase==='open')})),[snapshot.followed,snapshot.markets,q]);
 const results=[...new Map([...local,...remote].map(result=>[result.login,result])).values()].slice(0,6);
 useEffect(()=>{
  setRemote([]);setError('');setCursor(-1);
  if(demo||q.length<2||selected||!open){setSearching(false);return;}
  const abort=new AbortController();setSearching(true);
  const timer=setTimeout(async()=>{try{const response=await fetch(`/api/twitch/search?q=${encodeURIComponent(q)}`,{signal:abort.signal});const data=await response.json();if(!response.ok)throw new Error(data.error||'Twitch no respondió.');if(!abort.signal.aborted)setRemote(data.channels);}catch(e){if(!abort.signal.aborted)setError(e instanceof Error?e.message:'Twitch no respondió.');}finally{if(!abort.signal.aborted)setSearching(false);}},250);
  return()=>{clearTimeout(timer);abort.abort();};
 },[q,demo,selected,open]);
 useEffect(()=>{const close=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close);},[]);
 const choose=(login:string)=>{setSelected(login);setQuery(`@${login}`);setOpen(false);setCursor(-1);input.current?.focus();};
 const show=open&&q.length>0&&!selected;
 return <div ref={root} className="phone-search-wrap"><Glass className="phone-search"><Search size={18} aria-hidden="true"/><input ref={input} role="combobox" aria-label="Buscar streamer" aria-expanded={show} aria-controls={`${id}-list`} aria-autocomplete="list" aria-activedescendant={show&&cursor>=0?`${id}-${cursor}`:undefined} autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="Buscar streamer" value={query} onFocus={()=>setOpen(true)} onChange={e=>{setQuery(e.target.value);setSelected('');setOpen(true);}} onKeyDown={e=>{if(e.key==='Escape'){setOpen(false);return;}if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setOpen(true);setCursor(value=>results.length?(value+(e.key==='ArrowDown'?1:-1)+results.length)%results.length:-1);}if(e.key==='Enter'&&show&&results.length){e.preventDefault();choose(results[Math.max(cursor,0)].login);}}}/>{query&&<button type="button" className="phone-icon-button" aria-label="Limpiar búsqueda" onClick={()=>{setQuery('');setSelected('');setOpen(false);input.current?.focus();}}><X size={17}/></button>}</Glass>
 {show&&<div className="phone-search-results"><div role="listbox" id={`${id}-list`} aria-label="Streamers">{results.map((result,index)=><div className="phone-search-row" key={result.login}><button role="option" id={`${id}-${index}`} aria-selected={cursor===index} onClick={()=>choose(result.login)}><span className="streamer-avatar">{result.displayName.slice(0,1).toUpperCase()}</span><span><strong>{result.displayName}</strong><small>@{result.login}</small></span>{snapshot.followed.includes(result.login)&&<Check size={14} aria-label="Siguiendo"/>}</button>{!snapshot.followed.includes(result.login)&&<button className="phone-follow" aria-label={`Seguir a ${result.login}`} disabled={!!following} onClick={async()=>{setFollowing(result.login);try{await onFollow(result.login);choose(result.login);}catch(e){setError(e instanceof Error?e.message:'No pudimos seguirlo.');}finally{setFollowing('');}}}>{following===result.login?<Loader2 size={16} className="phone-spin"/>:<Plus size={18}/>}</button>}</div>)}</div>{searching&&<p role="status">Buscando…</p>}{error&&<p role="status">{error}</p>}{!searching&&!error&&!results.length&&<p role="status">Sin resultados</p>}</div>}
 </div>;
}
// Sliding selection adapted from Opaline Glass Tab Bar on 21st.dev; see vendor/opaline/LICENSE.
function FeedTabs({tab,selected,count,onChange}:{tab:'active'|'own';selected:string;count:number;onChange:(tab:'active'|'own')=>void}){
 const ref=useRef<HTMLDivElement>(null),indicator=useActiveIndicator(ref);
 return <div ref={ref} className="phone-feed-tabs" role="group" aria-label="Ver apuestas">
  {indicator&&<span className="phone-feed-indicator" aria-hidden="true" style={{left:indicator.left,width:indicator.width}}/>}
  <button type="button" data-state={tab==='active'?'active':undefined} aria-pressed={tab==='active'} onClick={()=>onChange('active')}>{selected?`@${selected}`:'Activas'}<span>{count}</span></button>
  <button type="button" data-state={tab==='own'?'active':undefined} aria-pressed={tab==='own'} onClick={()=>onChange('own')}>Mis jugadas</button>
 </div>;
}

function Profile({snapshot,demo,onRefresh}:{snapshot:AppSnapshot;demo:boolean;onRefresh:()=>Promise<void>|void}){
 const account=snapshot.account;const paid=account?.bets.filter(b=>b.claimed).reduce((sum,bet)=>sum+bet.payout,0)??0;
 // Provider-aware: Google renders disabled without server configuration instead of a broken button.
 const [googleConfigured,setGoogleConfigured]=useState<boolean|null>(null);
 // Disconnecting Twitch is a server operation: it unlinks the identity and drops streamer ownership.
 const [disconnecting,setDisconnecting]=useState(false);const [disconnectError,setDisconnectError]=useState('');
 const disconnectTwitch=async()=>{
  setDisconnecting(true);setDisconnectError('');
  try{
   const r=await fetch('/api/twitch/disconnect',{method:'POST',headers:{'content-type':'application/json',Authorization:`Bearer ${localStorage.getItem('pointsToken')??''}`}});
   const data=await r.json().catch(()=>({}));
   if(!r.ok)throw new Error((data as {error?:string}).error??'No se pudo desconectar Twitch.');
   await onRefresh();
  }catch(e){setDisconnectError((e as Error).message);}finally{setDisconnecting(false);}
 };
 useEffect(()=>{if(demo)return;let active=true;void fetch('/api/google/config').then(r=>r.json()).then((c:{configured:boolean})=>{if(active)setGoogleConfigured(c.configured);}).catch(()=>{if(active)setGoogleConfigured(false);});return()=>{active=false;};},[demo]);
 // Native profile display for every provider combination; a wallet never gates the identity name.
 const identityName=demo?'@plot_user':account?.twitch?.displayName??account?.google?.displayName??(account?.wallet?`${account.wallet.slice(0,4)}…${account.wallet.slice(-4)}`:'Tu cuenta');
 return <div className="phone-profile"><div className="phone-profile-identity"><div className="phone-avatar-large"><UserRound size={28}/></div><strong>{identityName}</strong>{!account?.twitch&&<a href="/onboarding?connect=twitch" className="phone-connect">Conectá Twitch<ArrowUpRight size={16}/></a>}</div><div className="phone-profile-stats">{[['Jugadas',number(account?.bets.length??0)],['Cobrados',`${number(paid)} pts`],account?.streamerChannels?.length?['Comisiones',`${number(account.streamerEarnings)} pts`]:['Siguiendo',number(snapshot.followed.length)]].map(([label,value])=><Glass key={label}><span>{label}</span><strong>{value}</strong></Glass>)}</div><section className="phone-connected" aria-label="Cuentas conectadas"><h2 className="phone-sr-only">Cuentas conectadas</h2>{([["Twitch",account?.twitch?`@${account.twitch.login}`:'Sin conectar',account?.twitch?'/onboarding':'/onboarding?connect=twitch',<TwitchIcon size={20}/>],["Phantom",account?.wallet?`${account.wallet.slice(0,4)}…${account.wallet.slice(-4)}`:'Sin conectar','/onboarding?connect=phantom',<PhantomIcon size={20}/>],["Google",account?.google?account.google.email??account.google.displayName:'Sin conectar',undefined,<GoogleIcon size={20}/>]] as [string,string,string|undefined,React.ReactNode][]).map(([label,status,href,icon])=>{const isGoogle=label==='Google';const unavailable=isGoogle&&googleConfigured===false;const link=isGoogle?(googleConfigured?'/onboarding?connect=google':undefined):href;const connected=status!=='Sin conectar';return <div key={label} className="phone-connected-row" data-connected={connected?'true':'false'}><span className="phone-connected-icon" aria-hidden="true">{icon}</span><span className="phone-connected-label">{label}</span><small className="phone-connected-status">{unavailable?'No disponible':status}</small>{!connected&&link&&!unavailable&&<a className="phone-connected-action" href={link}>Conectar</a>}{connected&&label==='Twitch'&&!demo&&<button type="button" className="phone-connected-action phone-connected-disconnect" disabled={disconnecting} onClick={()=>void disconnectTwitch()}>{disconnecting?'Desconectando…':'Desconectar'}</button>}{unavailable&&<small className="phone-connected-action" aria-disabled="true">Próximamente</small>}</div>;})}</section>{disconnectError&&<p className="phone-error" role="alert">{disconnectError}</p>}</div>;
}

function OwnBets({snapshot,demo,onClaim,onDetail,theme='ember'}:{snapshot:AppSnapshot;demo:boolean;onClaim:(key:string)=>Promise<void>;onDetail?:(key:string)=>void;theme?:AppTheme}){
 const [busy,setBusy]=useState(''),[error,setError]=useState('');
 const grouped=[...new Set(snapshot.account?.bets.map(b=>b.marketKey)??[])].reverse().map(key=>({key,bets:snapshot.account!.bets.filter(b=>b.marketKey===key),market:snapshot.markets.find(m=>m.key===key)}));
 return <div className="phone-bets">{error&&<p role="alert">{error}</p>}{!grouped.length&&<p className="phone-empty">Todavía no hay jugadas.</p>}{grouped.map(({key,bets,market})=>{
  const stake=bets.reduce((sum,b)=>sum+b.amount,0),payout=bets.reduce((sum,b)=>sum+b.payout,0),pending=bets.filter(b=>!b.claimed).reduce((sum,b)=>sum+b.payout,0),ended=['resolved','void'].includes(bets[0].phase);
  if(ended&&market)return <div key={key} data-position-key={key} className="phone-position phone-position-wrap"><PointsResolution market={market} account={snapshot.account} demo={demo} onClaim={()=>onClaim(key)} onDetail={onDetail?()=>onDetail(key):undefined}/></div>;
  // Same card as the active feed: the option you took stays highlighted in its own colour, with the stake.
  const chosenOutcome=bets[bets.length-1].outcomeId,chosenStake=bets.filter(b=>b.outcomeId===chosenOutcome).reduce((sum,b)=>sum+b.amount,0);
  // Listing view (onDetail present): the same card as the active feed. Detail view (no onDetail):
  // receipt only, because the detail already renders the market card above and must not offer betting twice.
  const withCard=!!onDetail&&!!market;
  return <div key={key} data-position-key={key} className="phone-position phone-position-wrap">
   {withCard&&market?<UserMarketCard market={market} theme={theme} chosenOutcome={chosenOutcome} chosenStake={chosenStake} onDetail={()=>onDetail?.(key)} onChoose={()=>onDetail?.(key)}/>
    :<Glass className="phone-position"><span className="phone-channel">@{bets[0].channel}</span><h2>{bets[0].title}</h2></Glass>}
   <div className="phone-position-receipt">
    {market?.winnerId&&<p className="phone-result">Ganó {market.outcomes.find(o=>o.id===market.winnerId)?.title} · Perdió {market.outcomes.filter(o=>o.id!==market.winnerId).map(o=>o.title).join(', ')}</p>}
    {bets[0].phase==='void'&&<p className="phone-result phone-result-refund">{market?.reason??'Cancelada · Reembolso'}</p>}
    <dl className="phone-receipt"><div><dt>Apuesta</dt><dd>{number(stake)} pts</dd></div>{ended&&<><div><dt>Cobro total</dt><dd>{number(payout)} pts</dd></div><div><dt>Neto</dt><dd>{payout-stake>0?'+':''}{number(payout-stake)} pts</dd></div></>}</dl>
    {ended&&market&&<PointsFees pool={market.totalPoints} fees={market.fees} canceled={market.phase==='void'} historical/>}{pending>0&&<Button disabled={!!busy} onClick={async()=>{setBusy(key);setError('');try{await onClaim(key);}catch(e){setError(e instanceof Error?e.message:'No pudimos cobrar.');}finally{setBusy('');}}}>{busy===key?'Cobrando…':`${demo?'Simular cobro':'Cobrar'} ${number(pending)} pts`}</Button>}
   </div>
  </div>;})}</div>;
}

export function PhoneApp({theme='ember',demo=false,embedded=false,detailLayout='hybrid',initialMarket='',background}:{theme?:AppTheme;demo?:boolean;embedded?:boolean;detailLayout?:DetailLayout;initialMarket?:string;background?:Backdrop}){
 const [detailKey,setDetailKey]=useState(()=>initialMarket||(embedded?'':new URLSearchParams(location.search).get('market')??''));
 const feedScroll=useRef(0),pushedDetail=useRef(false);
 const openDetail=(key:string)=>{feedScroll.current=content.current?.scrollTop??0;setDetailKey(key);if(!embedded){const url=new URL(location.href);url.searchParams.set('market',key);history.pushState(null,'',url);pushedDetail.current=true;}};
 const closeDetail=()=>{setDetailKey('');if(!embedded){if(pushedDetail.current){pushedDetail.current=false;history.back();}else{const url=new URL(location.href);url.searchParams.delete('market');history.replaceState(null,'',url);}}};
 useEffect(()=>{if(embedded)return;const restore=()=>setDetailKey(new URLSearchParams(location.search).get('market')??'');window.addEventListener('popstate',restore);return()=>window.removeEventListener('popstate',restore);},[embedded]);
 useEffect(()=>{content.current?.scrollTo({top:detailKey?0:feedScroll.current});if(detailKey)content.current?.querySelector<HTMLButtonElement>('.detail-back')?.focus({preventScroll:true});},[detailKey]);
 const {snapshot,setSnapshot,loading,error,refresh}=useSnapshot(demo);const [page,setPage]=useState<'bets'|'profile'>(()=>location.hash==='#profile'?'profile':'bets');const [tab,setTab]=useState<'active'|'own'>(()=>location.hash==='#history'?'own':'active');const initialChannel=embedded?'':normalize(new URLSearchParams(location.search).get('channel')??'');const [query,setQuery]=useState(initialChannel?`@${initialChannel}`:''),[selected,setSelected]=useState(initialChannel),[selection,setSelection]=useState<Selection>(),[message,setMessage]=useState(''),[authError,setAuthError]=useState('');const app=useRef<HTMLDivElement>(null),content=useRef<HTMLDivElement>(null),nav=useRef<HTMLElement>(null);const indicator=useActiveIndicator(nav,'[aria-current="page"]');
 const isStreamer=!demo&&!!snapshot.account?.streamerChannels?.length;
 useEffect(()=>{if(!isStreamer||page!=='bets')return;setDetailKey('');setSelection(undefined);if(!embedded){const url=new URL(location.href);url.searchParams.delete('market');url.hash='markets';history.replaceState(null,'',url);}},[isStreamer,page,embedded]);
 useEffect(()=>{if(!app.current||theme==='ember')return;return enhancePointerGlow(app.current);},[theme]);
 useEffect(()=>{if(embedded)return;const change=()=>{setPage(location.hash==='#profile'?'profile':'bets');setTab(location.hash==='#history'?'own':'active');};window.addEventListener('hashchange',change);return()=>window.removeEventListener('hashchange',change);},[embedded]);
 const chooseChannel=(channel:string)=>{setSelected(channel);if(!embedded&&!demo){const url=new URL(location.href);if(channel)url.searchParams.set('channel',channel);else url.searchParams.delete('channel');history.replaceState(null,'',url);}};
 const switchTab=(next:'active'|'own')=>{setTab(next);if(!embedded)history.replaceState(null,'',`${location.pathname}${location.search}#${next==='own'?'history':'markets'}`);};
 useEffect(()=>{
  if(demo||embedded)return;const params=new URLSearchParams(location.search);
  const extensionFlow=sessionStorage.getItem('plotExtensionFlow');
  if(extensionFlow&&/^[a-f0-9]{64}$/.test(extensionFlow)&&(params.has('twitch_ticket')||params.has('twitch_error'))){location.replace(`/onboarding?${params}#flow=${extensionFlow}`);return;}
 if(!params.has('twitch_ticket')&&!params.has('twitch_error')&&!params.has('google_ticket')&&!params.has('google_error'))return;
 const googleTicket=params.get('google_ticket'),googleError=params.get('google_error');
  const ticket=params.get('twitch_ticket'),cancelled=params.get('twitch_error')==='canceled';params.delete('twitch_ticket');params.delete('twitch_error');params.delete('google_ticket');params.delete('google_error');const query=params.toString();history.replaceState(null,'',`${location.pathname}${query?'?'+query:''}#profile`);setPage('profile');
 if(googleError){setAuthError(googleError==='canceled'?'Cancelaste la conexión con Google.':'No se pudo completar la conexión con Google.');return;}
 if(googleTicket){let activeG=true;void client.request<{token:string}>('/api/google/complete',{ticket:googleTicket}).then(result=>{if(!activeG)return;if(result?.token)localStorage.setItem('pointsToken',result.token);void refresh();}).catch(error=>{if(activeG)setAuthError(error instanceof Error?error.message:'No se pudo completar la conexión con Google.');});return()=>{activeG=false;};}
  if(!ticket){setAuthError(cancelled?'Cancelaste la conexión con Twitch.':'No se pudo completar la conexión.');return;}
  // Link completion carries the session bearer when one exists (link flow); the login flow completes without one.
  let active=true;void client.request<{token:string}>('/api/twitch/complete',{ticket},localStorage.getItem('pointsToken')??undefined).then(result=>{if(!active)return;
   // Social-first logins create a brand-new session: persist the returned token before refreshing.
   if(result?.token)localStorage.setItem('pointsToken',result.token);
   void refresh();
  }).catch(error=>{if(active)setAuthError(error instanceof Error?error.message:'No se pudo completar la conexión.');});return()=>{active=false;};
 },[demo,embedded,refresh]);
 const go=(next:'bets'|'profile')=>{setDetailKey('');if(!embedded){const url=new URL(location.href);url.searchParams.delete('market');history.replaceState(null,'',url);}setPage(next);if(next==='bets')setTab('active');setMessage('');content.current?.scrollTo({top:0});if(!embedded)history.replaceState(null,'',`${location.pathname}${location.search}#${next==='bets'?'markets':next}`);};
 const q=normalize(query);const visible=snapshot.markets.filter(m=>['open','locked'].includes(m.phase)&&(selected?m.prediction.channel===selected:q?m.prediction.channel.includes(q):snapshot.followed.includes(m.prediction.channel))).sort((a,b)=>Number(b.canBet)-Number(a.canBet));
 const follow=async(channel:string)=>{if(demo){setSnapshot(old=>({...old,followed:[...new Set([...old.followed,channel])]}));return;}const {token}=await client.request<{token:string}>('/api/pair');await client.request('/api/channels',{channel},token);await refresh();};
 const bet=async(market:AppMarket,outcome:string,amount:number,id:string)=>{
  if(demo){setSnapshot(old=>applyDemoBet(old,market,outcome,amount,id));setMessage('Jugada simulada.');return;}
  if(isStreamer)throw new Error('Las cuentas de streamer no pueden apostar.');
  if(error)throw new Error('Actualizá antes de apostar.');await client.bet({key:market.key,outcomeId:outcome,amount,requestId:id});await refresh();setMessage('Apuesta registrada.');
 };
 const claim=async(key:string)=>{if(!demo){await client.claim({key,requestId:crypto.randomUUID()});await refresh();}else setMessage('Cobro de ejemplo.');};
 return <div ref={app} className={`phone-app theme-${theme} ${embedded?'phone-embedded':''}`} data-demo={demo?'true':undefined} data-signed-in={demo||hasPointsIdentity(snapshot.account)?'true':'false'}>
  {background&&<AnimatedBackdrop variant={background}/>}
  <LiquidGlass refraction={0} blur={16} tint="var(--nav-surface)" className="phone-nav-shell"><div className="phone-top"><PlotLogo className="phone-brand"/><div className="phone-balance" hidden={!demo&&!hasPointsIdentity(snapshot.account)}>{demo&&<small>Ejemplo</small>}<strong id={!embedded?'own-balance':undefined}>{snapshot.account?number(snapshot.account.balance):'—'}<small> pts</small></strong></div></div><nav ref={nav} className="phone-nav" aria-label="Secciones" hidden={!demo&&!hasPointsIdentity(snapshot.account)}>{indicator&&<span className="phone-nav-indicator" aria-hidden="true" style={{left:indicator.left,width:indicator.width}}/>}{([['bets','Mis apuestas',Layers3],['profile','Mi perfil',UserRound]] as const).map(([value,label,Icon])=><button key={value} type="button" aria-current={page===value?'page':undefined} onClick={()=>go(value)}><Icon size={17}/>{label}</button>)}</nav></LiquidGlass>
  <div ref={content} className={`phone-content ${detailKey&&page==='bets'&&!isStreamer?'phone-content-detail':''}`} role="main" aria-label={page==='bets'?'Apuestas':'Perfil'}><h1 className="phone-sr-only">{page==='bets'?'Mis apuestas':'Mi perfil'}</h1>{authError&&<p className="phone-error" role="alert">{authError}</p>}
   {!demo&&loading?<div className="phone-loading" role="status"><Loader2 size={20} className="phone-spin"/>Cargando…</div>:!demo&&!hasPointsIdentity(snapshot.account)?<PointsSignIn/>:page==='bets'&&isStreamer&&snapshot.account?<StreamerManager key={snapshot.account.id} account={snapshot.account} theme={theme} onRefresh={refresh}/>:page==='bets'&&detailKey?<>{loading?<p role="status">Cargando…</p>:snapshot.markets.find(m=>m.key===detailKey)?(()=>{const market=snapshot.markets.find(m=>m.key===detailKey)!;return <MarketDetail market={market} layout={detailLayout} account={snapshot.account} onBack={closeDetail} onChoose={outcome=>setSelection({market,outcome})} receipt={<OwnBets snapshot={{...snapshot,account:snapshot.account?{...snapshot.account,bets:snapshot.account.bets.filter(b=>b.marketKey===detailKey)}:undefined}} demo={demo} onClaim={claim}/>}/>;})():<div className="phone-empty"><p>{error||'Mercado no disponible.'}</p><button className="detail-back" onClick={closeDetail}>Volver a apuestas</button>{error&&<button className="detail-back" onClick={()=>void refresh()}>Reintentar</button>}</div>}</>:page==='bets'?<><StreamerSearch snapshot={snapshot} demo={demo} query={query} setQuery={setQuery} selected={selected} setSelected={chooseChannel} onFollow={follow}/><FeedTabs tab={tab} selected={selected} count={visible.length} onChange={switchTab}/>{error&&<div className="phone-error" role="alert">{error}<button onClick={()=>void refresh()}>Reintentar</button></div>}{message&&<p className="phone-feedback" role="status">{message}</p>}{loading?<div className="phone-loading" role="status"><Loader2 size={20} className="phone-spin"/>Cargando…</div>:tab==='active'?<div className="phone-feed">{visible.map(market=><UserMarketCard key={market.key} market={market} theme={theme} onDetail={()=>openDetail(market.key)} chosenOutcome={selection?.market.key===market.key?selection.outcome:snapshot.account?.bets.filter(b=>b.marketKey===market.key).at(-1)?.outcomeId} chosenStake={(snapshot.account?.bets.filter(b=>b.marketKey===market.key&&b.outcomeId===(selection?.market.key===market.key?selection.outcome:snapshot.account?.bets.filter(x=>x.marketKey===market.key).at(-1)?.outcomeId))??[]).reduce((sum,b)=>sum+b.amount,0)} onChoose={setSelection}/>)}{!visible.length&&!error&&<div className="phone-empty"><Search size={24}/><p>{q?'Sin apuestas activas.':'Buscá un streamer para empezar.'}</p></div>}</div>:<OwnBets snapshot={{...snapshot,account:snapshot.account?{...snapshot.account,bets:snapshot.account.bets.filter(b=>selected?b.channel===selected:q?b.channel.includes(q):true)}:undefined}} demo={demo} onClaim={claim} onDetail={openDetail} theme={theme}/>}</>:<Profile snapshot={snapshot} demo={demo} onRefresh={refresh}/>}
  </div>
  {selection&&(demo||hasPointsIdentity(snapshot.account))&&!isStreamer&&!loading&&<BetSheet selection={selection} account={snapshot.account} demo={demo} theme={theme} onClose={()=>setSelection(undefined)} onBet={bet}/>}
 </div>;
}
function AppOptions(){const initial=new URLSearchParams(location.search).get('theme');const [choice,setChoice]=useState<AppTheme|'all'>(isAppTheme(initial)?initial:'all'),[size,setSize]=useState<'phone'|'wide'>('phone');return <div className="phone-lab"><PreviewHeader/><h1>Elegí cómo se ve.</h1><div className="phone-lab-controls"><div role="group" aria-label="Diseño">{(['all',...appThemes.map(t=>t.id)] as const).map(value=><button key={value} aria-pressed={choice===value} onClick={()=>{setChoice(value);const url=new URL(location.href);if(value==='all')url.searchParams.delete('theme');else url.searchParams.set('theme',value);history.replaceState(null,'',url);}}>{value==='all'?'Las tres':appThemes.find(t=>t.id===value)?.name}</button>)}</div><div role="group" aria-label="Ancho"><button aria-pressed={size==='phone'} onClick={()=>setSize('phone')}>Teléfono</button><button aria-pressed={size==='wide'} onClick={()=>setSize('wide')}>700 px</button></div></div><div className={`phone-comparison ${size==='wide'?'phone-comparison-wide':''} ${choice!=='all'?'phone-comparison-single':''}`}>{appThemes.filter(t=>choice==='all'||t.id===choice).map(theme=><section key={theme.id} aria-labelledby={`theme-${theme.id}`}><div className="phone-theme-description"><h2 id={`theme-${theme.id}`}>{theme.name}</h2><p>{theme.description}</p></div><div className="phone-preview-frame"><PhoneApp theme={theme.id} demo embedded/></div><a href={`/mobile-preview.html?theme=${theme.id}`}>Abrir a pantalla completa<ArrowUpRight size={14}/></a></section>)}</div><footer><span>Datos de ejemplo · Sin transacciones</span><div><a href="https://21st.dev/@ayushmxxn/components/tubelight-navbar" target="_blank" rel="noreferrer">Tubelight Navbar</a><a href="https://21st.dev/@deepraj21/components/glass-tab-bar" target="_blank" rel="noreferrer">Opaline / Liquid Glass</a><a href="https://21st.dev/@johuniq/components/liquid-metal-button" target="_blank" rel="noreferrer">Liquid Metal Button</a></div></footer></div>;}
function DetailOptions(){
 const [choice,setChoice]=useState<DetailLayout|'all'>('all'),[wide,setWide]=useState(false);
 return <div className="phone-lab"><PreviewHeader/><h1>Un mercado, tres maneras de verlo.</h1><div className="phone-lab-controls"><div role="group" aria-label="Detalle">{[{id:'all',name:'Las tres'},...detailLayouts].map(option=><button key={option.id} aria-pressed={choice===option.id} onClick={()=>setChoice(option.id as DetailLayout|'all')}>{option.name}</button>)}</div><div role="group" aria-label="Ancho"><button aria-pressed={!wide} onClick={()=>setWide(false)}>Teléfono</button><button aria-pressed={wide} onClick={()=>setWide(true)}>700 px</button></div></div><div className={`phone-comparison ${wide?'phone-comparison-wide':''} ${choice!=='all'?'phone-comparison-single':''}`}>{detailLayouts.filter(layout=>choice==='all'||layout.id===choice).map(layout=><section key={layout.id} aria-label={layout.name}><div className="phone-theme-description"><h2>{layout.name}</h2><p>{layout.description}</p></div><div className="phone-preview-frame"><PhoneApp demo embedded detailLayout={layout.id} initialMarket="demo-2"/></div><a href={`/market-detail-preview.html?layout=${layout.id}&market=demo-2`}>Abrir a pantalla completa<ArrowUpRight size={14}/></a></section>)}</div><footer>Datos de ejemplo · Podés simular apuestas en cada opción, sin transacciones.</footer></div>;
}
function BackgroundOptions(){
 const [choice,setChoice]=useState<Backdrop|'all'>('all'),[wide,setWide]=useState(false);
 return <div className="phone-lab"><PreviewHeader/><h1>Cuatro fondos para Plot.</h1><div className="phone-lab-controls"><div role="group" aria-label="Fondo">{[{id:'all',name:'Los cuatro'},...backdropOptions].map(option=><button key={option.id} aria-pressed={choice===option.id} onClick={()=>setChoice(option.id as Backdrop|'all')}>{option.name}</button>)}</div><div role="group" aria-label="Ancho"><button aria-pressed={!wide} onClick={()=>setWide(false)}>Teléfono</button><button aria-pressed={wide} onClick={()=>setWide(true)}>700 px</button></div></div><div className={`phone-comparison background-comparison ${wide?'phone-comparison-wide':''} ${choice!=='all'?'phone-comparison-single':''}`}>{backdropOptions.filter(option=>choice==='all'||option.id===choice).map(option=><section key={option.id} aria-label={option.name}><div className="phone-theme-description"><h2>{option.name}</h2><p>{option.description}</p></div><div className="phone-preview-frame"><PhoneApp demo embedded background={option.id}/></div><a href={`/mobile-preview.html?background=${option.id}`}>Abrir a pantalla completa<ArrowUpRight size={14}/></a><a className="background-source" href={option.source} target="_blank" rel="noreferrer">Referencia de 21st.dev<ArrowUpRight size={14}/></a></section>)}</div><footer>Datos de ejemplo · Sin transacciones. Las animaciones se detienen con movimiento reducido.</footer></div>;
}
const params=new URLSearchParams(location.search),theme=params.get('theme');
const mode=document.body.dataset.mode;
createRoot(document.getElementById('phone-root')!).render(mode==='backgrounds'?<BackgroundOptions/>:mode==='details'?<DetailOptions/>:mode==='options'?<AppOptions/>:<PhoneApp theme={isAppTheme(theme)?theme:'ember'} demo={mode==='demo'} background={mode==='demo'?(isBackdrop(params.get('background'))?params.get('background') as Backdrop:'sparks'):undefined} detailLayout={mode==='demo'&&isDetailLayout(params.get('layout'))?params.get('layout') as DetailLayout:'hybrid'}/>);
