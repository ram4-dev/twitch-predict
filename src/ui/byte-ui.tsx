import {searchTwitch} from './twitch-search.js';
import ExpandableSearchBar from '@/components/ui/expandable-search-bar';
import {twitchChannel} from '../mobile-model.js';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {createRoot} from 'react-dom/client';
import {RefreshCw,Wallet,Plus,ExternalLink} from 'lucide-react';
import {Button} from './components/button.js';
import {Input} from './components/input.js';
import {Chameleon,Notice,Field,Select} from './components/plot.js';
import {type ByteConfig,type DisplayByteMarket,solToLamports} from '../byte-model.js';
import {Scene} from './scene.js';
import {GlowCard,enhanceGlowStage} from '@/components/ui/spotlight-card';
import {ByteBetting,sol,type ByteSelection} from './byte-market.js';
import {connection,phantom,sendBet,checkReceipt,receipts,type BetReceipt} from '../byte-wallet.js';

type Status={configured:boolean;network:'devnet';operatorMode:'wallet'|'local';manualOperations?:boolean;extensionId:string};
type Operation={requestId:string;title:string;options:string[];channel:string};
const short=(address:string)=>`${address.slice(0,5)}…${address.slice(-5)}`;
class ApiError extends Error {constructor(readonly status:number,message:string){super(message);}}
async function request<T>(path:string,body?:unknown,operatorToken?:string):Promise<T>{
  const token=localStorage.getItem('pointsToken');
  const response=await fetch(`/api${path}`,{method:body===undefined?'GET':'POST',headers:{...(token?{authorization:`Bearer ${token}`}:{'accept':'application/json'}),...(body===undefined?{}:{'content-type':'application/json'}),...(operatorToken?{'x-operator-token':operatorToken}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
  const data=await response.json();if(!response.ok)throw new ApiError(response.status,data.error??'No se pudo completar la operación');return data;
}
function App(){
  const [status,setStatus]=useState<Status>(),[config,setConfig]=useState<ByteConfig>(),[markets,setMarkets]=useState<DisplayByteMarket[]>([]),[wallet,setWallet]=useState(''),[balance,setBalance]=useState<number>(),[tab,setTab]=useState(new URLSearchParams(location.search).get('view')==='history'?'history':'markets'),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[connected,setConnected]=useState(false),[channel,setChannel]=useState(new URLSearchParams(location.search).get('channel')??''),[history,setHistory]=useState<BetReceipt[]>(receipts()),[operations,setOperations]=useState<Operation[]>([]),[loading,setLoading]=useState(true),[pairing,setPairing]=useState(false),[watchName,setWatchName]=useState(''),[watchBusy,setWatchBusy]=useState(false);
  const shell=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(shell.current)enhanceGlowStage(shell.current);},[]);
  const operatorToken=useRef('');
  const [operatorReady,setOperatorReady]=useState(false),[loadError,setLoadError]=useState('');
  const refresh=async()=>{
    try{
      const current=await request<Status>('/byte/status');setStatus(current);
      if(current.configured){const result=await request<{markets:DisplayByteMarket[]}>('/byte/markets');setMarkets(result.markets);}
      const next=await request<ByteConfig>('/byte/config');setConfig(next);setLoadError('');
    }catch(e){setLoadError((e as Error).message);}finally{setLoading(false);setHistory(receipts());}
  };
  useEffect(()=>{
    let ready=false,lastRefresh=0,pending:ReturnType<typeof setTimeout>|undefined;
    const reload=()=>{lastRefresh=Date.now();void refresh();};
    const stream=new EventSource('/api/live/markets');
    stream.addEventListener('ready',()=>{ready=true;reload();});
    stream.addEventListener('markets',()=>{if(pending)clearTimeout(pending);pending=setTimeout(reload,250);});
    stream.onerror=()=>{ready=false;};
    reload();const timer=setInterval(()=>{if(!ready||Date.now()-lastRefresh>=30000)reload();},6000);
    const visible=()=>{if(!document.hidden)reload();};document.addEventListener('visibilitychange',visible);
    return()=>{stream.close();clearInterval(timer);if(pending)clearTimeout(pending);document.removeEventListener('visibilitychange',visible);};
  },[]);
  useEffect(()=>{if(!wallet){setBalance(undefined);return;}let active=true;const refreshBalance=()=>void connection().getBalance(new (PublicKeyClass)(wallet)).then(n=>{if(active)setBalance(n);}).catch(()=>{if(active)setBalance(undefined);});refreshBalance();const timer=setInterval(refreshBalance,12000);return()=>{active=false;clearInterval(timer);};},[wallet]);
  useEffect(()=>{
    let active=true;
    const restore=async()=>{
      if(!localStorage.getItem('pointsToken'))return;
      try{
        const session=await request<{wallet:string|null}>('/points/me');
        if(!session.wallet)return;
        const provider=phantom();
        try{const trusted=await provider?.connect({onlyIfTrusted:true});if(trusted&&trusted.publicKey.toString()!==session.wallet)return;}catch{/* Authentication survives a locked wallet; signing still checks its account. */}
        if(active){setWallet(session.wallet);setConnected(true);}
      }catch(e){if(e instanceof ApiError&&e.status===401)localStorage.removeItem('pointsToken');}
    };
    void restore();
    const provider=phantom() as ReturnType<typeof phantom>&{on?:(name:string,listener:(key?:{toString():string}|null)=>void)=>void;removeListener?:(name:string,listener:(key?:{toString():string}|null)=>void)=>void};
    const changed=(key?:{toString():string}|null)=>{if(!key)return;setWallet(current=>{if(current&&current!==key.toString()){setConnected(false);setOperatorReady(false);localStorage.removeItem('pointsToken');return '';}return current;});};
    provider?.on?.('accountChanged',changed);return()=>{active=false;provider?.removeListener?.('accountChanged',changed);};
  },[]);
  const connect=async()=>{
    setBusy(true);setError('');
    try{
      const provider=phantom() as ReturnType<typeof phantom>&{signMessage?:(message:Uint8Array,display:string)=>Promise<{signature:Uint8Array;publicKey?:{toString():string}}>};
      if(!provider?.isPhantom||!provider.signMessage)throw new Error(location.protocol==='http:'&&!['localhost','127.0.0.1'].includes(location.hostname)?'Abrí el panel por HTTPS para conectar Phantom.':'No detectamos Phantom en este navegador. Abrí el panel en Chrome con Phantom instalada y recargá.');
      const result=await provider.connect(),address=result.publicKey.toString();
      const challenge=await request<{challengeId:string;message:string}>('/auth/challenge',{address});
      const proof=await provider.signMessage(new TextEncoder().encode(challenge.message),'utf8');
      if(proof.publicKey&&proof.publicKey.toString()!==address)throw new Error('La wallet cambió durante la firma. Volvé a conectar.');
      const login=await request<{token:string}>('/auth/verify',{challengeId:challenge.challengeId,signature:btoa(String.fromCharCode(...proof.signature))});
      localStorage.setItem('pointsToken',login.token);setWallet(address);setConnected(true);setNotice('Wallet conectada. Las apuestas requieren otra firma de transacción.');await pairExtension(true);if(tab==='operator')await operate();
    }catch(e){setError(walletError(e));}finally{setBusy(false);}
  };
  const operate=async()=>{
    setTab('operator');setError('');setOperatorReady(false);
    try{
      const current=await request<Status>('/byte/status');setStatus(current);
      if(current.operatorMode==='local')operatorToken.current=(await request<{token:string}>('/pair')).token;
      setOperations((await request<{operations:Operation[]}>('/byte/operations',undefined,operatorToken.current)).operations);
      setOperatorReady(true);
    }catch(e){setError((e as Error).message);}
  };
  const pairExtension=async(automatic=false)=>{
    if(pairing)return;setPairing(true);if(!automatic)setError('');try{
      const runtime=(globalThis as unknown as {chrome?:{runtime?:{sendMessage(id:string,message:unknown):Promise<{ok?:boolean;error?:string;flowId?:string}>}}}).chrome?.runtime;
      if(!runtime?.sendMessage||!status?.extensionId)throw new Error('Cargá la extensión de Plot en Chrome y volvé a intentar.');
      if(status.operatorMode==='local'){
        const {token}=await request<{token:string}>('/pair');
        const result=await runtime.sendMessage(status.extensionId,{type:'PAIR',bridgeUrl:location.origin,token});
        if(!result?.ok)throw new Error(result?.error??'No se pudo vincular la extensión.');
      }
      const session=await request<{wallet:string|null}>('/points/me').catch(()=>undefined);
      if(status.operatorMode!=='local'&&!session?.wallet)throw new Error('Conectá Phantom para vincular tu cuenta con la extensión.');
      if(session?.wallet){
        const flow=await runtime.sendMessage(status.extensionId,{type:'LINK_SESSION',bridgeUrl:location.origin});if(!flow?.ok||!flow.flowId)throw new Error(flow?.error??'Actualizá la extensión para vincular la cuenta.');
        const handoff=await request<{flowId:string;code:string;extensionId:string}>('/auth/extension/authorize',{flowId:flow.flowId});
        const linked=await runtime.sendMessage(status.extensionId,{type:'AUTH_COMPLETE',flowId:handoff.flowId,code:handoff.code});if(!linked?.ok)throw new Error(linked?.error??'No se pudo vincular la cuenta.');
        localStorage.setItem('linkedExtensionId',status.extensionId);
      }
      setNotice(`${automatic?'Wallet conectada. ':''}Extensión vinculada.${session?.wallet?' Tu wallet también está disponible en el popup.':' Conectá Phantom para vincular también tu cuenta.'}`);
    }catch(e){if(!automatic)setError((e as Error).message);}finally{setPairing(false);}
  };
  const checkHistory=async()=>{
    setBusy(true);setError('');
    try{for(const receipt of receipts().filter(r=>r.wallet===wallet&&(r.status==='pending'||r.status==='confirmed'&&!r.synced)))await checkReceipt(receipt);setHistory(receipts());await refresh();}
    catch(e){setError(walletError(e));}finally{setBusy(false);}
  };
  const watch=async(query:string)=>{
    if(watchBusy)return;setWatchBusy(true);setError('');
    try{const name=twitchChannel(query);const token=status?.operatorMode==='local'?(await request<{token:string}>('/pair')).token:undefined;
      const result=await request<{predictions:{market:{error?:string}}[]}>('/byte/twitch/watch',{channel:name},token);setWatchName('');await refresh();setNotice(`Siguiendo @${name}. ${result.predictions.find(p=>p.market.error)?.market.error??'Las próximas predicciones se replicarán en devnet.'}`);
    }catch(e){setError((e as Error).message);}finally{setWatchBusy(false);}
  };
  const visibleMarkets=markets.filter(m=>!channel||m.notes?.channel.toLowerCase().includes(channel));

  return <div ref={shell} className="byte-app"><header><div className="brand plot-scene compact"><Scene compact/></div><nav aria-label="Secciones"><button aria-current={tab==='markets'?'page':undefined} onClick={()=>setTab('markets')}>Mercados</button><button aria-current={tab==='history'?'page':undefined} onClick={()=>setTab('history')}>Mis apuestas</button>{status?.manualOperations!==false&&<button aria-current={tab==='operator'?'page':undefined} onClick={()=>void operate()}>Operador</button>}</nav><span className="mode">SOL devnet</span></header>
    <main><section className="intro"><div><h1>{tab==='history'?'Mis apuestas':tab==='operator'?'Consola del streamer':'Predicciones de la comunidad'}</h1><p>{tab==='history'?'Tus transacciones y su confirmación en Solana.':tab==='operator'?'Creá mercados, definí el resultado y seguí los pagos.':'Las jugadas del stream. Un pozo compartido en SOL devnet.'}</p></div><section className="wallet-strip"><div><small>{wallet?short(wallet):'Conectá Phantom'}</small><span>Saldo disponible</span></div><div><strong>{wallet?(balance===undefined?'—':sol(balance)):'—'}</strong><span>SOL devnet</span></div><Button variant="outline" disabled={busy} onClick={()=>void connect()}><Wallet size={16}/>{connected?'Reconectar wallet':'Conectar Phantom'}</Button></section></section>
      <div className="byte-connection"><span>Solana devnet · sin dinero real</span><Button variant="ghost" disabled={pairing||busy} onClick={()=>void pairExtension()}>Vincular extensión</Button></div>
      {tab==='markets'&&<form className="byte-watch" onSubmit={event=>{event.preventDefault();void watch(watchName);}}><label htmlFor="byte-watch-channel">Canal de Twitch</label><div className="form-row"><Input id="byte-watch-channel" value={watchName} onChange={event=>setWatchName(event.target.value)} placeholder="@eggsterr" required disabled={watchBusy}/><Button type="submit" disabled={watchBusy}>{watchBusy?'Verificando Twitch…':'Seguir canal'}</Button></div></form>}
      {status&&!status.configured&&<Notice tone="warning">Los mercados todavía no están habilitados. El operador debe completar la conexión con byte.</Notice>}
      {loadError&&<Notice tone="error">{loadError}</Notice>}{error&&<Notice tone="error">{error}</Notice>}{notice&&<Notice>{notice}</Notice>}
      {tab==='markets'&&<><div className="byte-section-head section-title"><h2>Mercados</h2><div className="byte-market-tools"><ExpandableSearchBar expandDirection="left" width={320} placeholder="Buscar canal…" inputLabel="Filtrar canal" openLabel="Buscar canal" submitLabel="Filtrar mercados" lookup={searchTwitch} defaultOpen={!!channel} defaultValue={channel} onSearch={query=>{setError('');try{const name=twitchChannel(query);setChannel(name);if(connected)void watch(name);}catch(error){setError((error as Error).message);}}} onClear={()=>{setChannel('');setError('');}}/><Button size="icon" variant="ghost" aria-label="Actualizar mercados" onClick={()=>void refresh()}><RefreshCw size={16}/></Button></div></div>
        {loading?<p role="status">Consultando mercados…</p>:loadError?<div className="byte-empty"><h2>No pudimos consultar los mercados</h2><Button variant="outline" onClick={()=>void refresh()}>Reintentar</Button></div>:!visibleMarkets.length?<div className="byte-empty"><Chameleon mood="doubt"/><h2>Todavía no hay mercados</h2>{status?.manualOperations===false?<p>Las predicciones de los canales seguidos aparecerán acá cuando estén abiertas.</p>:<><p>Creá el primero desde el panel del operador.</p><Button onClick={()=>void operate()}><Plus size={16}/>Crear un mercado</Button></>}</div>:<div className="byte-grid market-grid">{visibleMarkets.map(m=><MarketCard key={m.id} market={m} config={config} wallet={wallet} disabled={busy} onDone={async()=>{setHistory(receipts());await refresh();}}/>)}</div>}</>}
      {tab==='history'&&<section><div className="byte-section-head"><h2>Mis apuestas en devnet</h2><Button variant="outline" disabled={busy||!wallet} onClick={()=>void checkHistory()}><RefreshCw size={15}/>Revisar transacciones</Button></div><p className="byte-muted">Recibos guardados en este navegador para la wallet conectada. La confirmación se consulta en cadena; no es un historial completo de tu wallet.</p>{!wallet?<Notice>Conectá la wallet con la que apostaste.</Notice>:!history.some(r=>r.wallet===wallet)?<div className="byte-empty"><p>Todavía no hay apuestas guardadas para esta wallet.</p></div>:history.filter(r=>r.wallet===wallet).map(r=><article className="byte-receipt" key={r.signature}><div><strong>{r.title}</strong><p>{sol(r.amount)} SOL · opción {r.option+1} · {{pending:'Confirmación pendiente',confirmed:'Confirmada',failed:'Falló en cadena',expired:'Expiró sin confirmación'}[r.status]}</p>{r.status==='confirmed'&&!r.synced&&<small>Confirmada en Solana; sincronización con byte pendiente.</small>}</div><a href={`https://explorer.solana.com/tx/${r.signature}?cluster=devnet`} target="_blank" rel="noopener noreferrer">Ver transacción <ExternalLink size={14}/></a></article>)}</section>}
      {tab==='operator'&&<section><div className="byte-section-head"><h2>Panel del operador</h2><span className="byte-muted">{status?.operatorMode==='local'?'Acceso local · no publicar este servidor':'Wallets autorizadas'}</span></div><Notice tone="warning">Los mercados propios se resuelven con evidencia. Las réplicas usan el resultado verificado de la predicción de Twitch.</Notice>{operatorReady?<CreateMarket disabled={!status?.configured} token={operatorToken.current} onDone={async()=>{await refresh();setTab('markets');}}/>:<Notice>Se necesita acceso de operador. Conectá una wallet autorizada o volvé a abrir esta sección.</Notice>}
        {operations.map(op=><Recovery key={op.requestId} operation={op} token={operatorToken.current} onDone={()=>void operate()}/>)}
        <h2 className="byte-subheading">Resolver y seguir pagos</h2><div className="byte-grid market-grid">{operatorReady&&markets.filter(m=>m.notes).map(m=><Resolution key={m.id} market={m} token={operatorToken.current} onDone={refresh}/>)}</div></section>}
      <footer>Pozo compartido · las apuestas tempranas pesan más · 2% sobre la ganancia + 0,5% para el creador si el mercado configura su wallet. Los pagos finales dependen del pozo y del resultado. Sin reclamo manual: byte distribuye los fondos.</footer>
    </main></div>;
}
// Keep the web3 browser import out of server-only code.
import {PublicKey as PublicKeyClass} from '@solana/web3.js';
function walletError(e:unknown){const error=e as Error&{code?:number};return error.code===4001?'Cancelaste la operación en Phantom. Podés volver a intentar.':error.code===-32002?'Ya hay una solicitud pendiente en Phantom. Abrí la extensión para completarla.':error.message;}
function MarketCard({market:m,config,wallet,disabled,onDone}:{market:DisplayByteMarket;config?:ByteConfig;wallet:string;disabled:boolean;onDone:()=>Promise<void>}){
  const query=new URLSearchParams(location.search),target=query.get('market')===m.id;
  const candidate=target?query.get('amount')??'0.01':'0.01';let initialAmount='0.01';try{solToLamports(candidate);initialAmount=candidate;}catch{/* Ignore malformed links. */}
  const candidateOption=Number(target?query.get('option'):0),initialOption=Number.isInteger(candidateOption)&&candidateOption>=0&&candidateOption<m.options.length?candidateOption:0;
  const [selection,setSelection]=useState<ByteSelection>({amount:initialAmount,option:initialOption}),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[failed,setFailed]=useState(false);
  const bet=async(next:ByteSelection)=>{
    setSelection(next);if(!wallet){setMessage('Conectá Phantom para apostar.');return;}
    const {amount,option}=next;
    if(busy||!config)return;setBusy(true);setFailed(false);
    try{const receipt=await sendBet(m,option,amount,wallet,config,setMessage);setMessage(receipt.status==='confirmed'?'':receipt.status==='pending'?'Confirmación pendiente. Revisá la firma en Mis apuestas antes de enviar otra.':receipt.status==='expired'?'La transacción expiró sin confirmación.':'La transacción falló en cadena.');setFailed(receipt.status==='failed');}
    catch(e){setMessage(walletError(e));setFailed(true);}finally{setBusy(false);await onDone();}
  };
  return <GlowCard className="market-card byte-market" data-market-id={m.id}><div className="market-heading"><a href={m.notes?`https://twitch.tv/${m.notes.channel}`:undefined} target="_blank" rel="noopener noreferrer">{m.notes?`@${m.notes.channel}`:'Mercado del partner'}</a><span>Cierre: {new Date(m.closeMs).toLocaleString('es-AR')}</span></div>{!['resolved','invalid'].includes(m.status)&&<h3>{m.title}</h3>}<ByteBetting market={m} config={config} resolution minimal initial={selection} disabled={disabled||busy} onBet={next=>void bet(next)}/>
    {message&&<Notice tone={failed?'error':'info'}>{message}</Notice>}
    <details><summary>Reglas y evidencia</summary><p>{m.notes?.rules??'Este mercado no tiene reglas registradas en esta aplicación.'}</p>{m.notes?.resolution&&<p>Evidencia: {m.notes.resolution.evidence}</p>}{m.invalidReason&&<p>Anulación: {m.invalidReason}</p>}<p>Si no hay apuestas ganadoras o se anula, byte devuelve las apuestas. Sin resolución, el protocolo prevé anular a los 7 días del cierre.</p><a href={`https://explorer.solana.com/address/${m.chain.market}?cluster=devnet`} target="_blank" rel="noopener noreferrer">Ver mercado en Solana <ExternalLink size={13}/></a></details></GlowCard>;
}
function CreateMarket({disabled,token,onDone}:{disabled:boolean;token:string;onDone:()=>Promise<void>}){
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const pending=useRef<{fingerprint:string;requestId:string}>();
  const submit=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();if(busy)return;const form=event.currentTarget,data=new FormData(form);
    const body={title:String(data.get('title')),channel:String(data.get('channel')),options:String(data.get('options')).split('\n').map(s=>s.trim()).filter(Boolean),windowSecs:Number(data.get('windowSecs')),currency:'sol',rules:String(data.get('rules')),...(data.get('wallet')?{wallet:String(data.get('wallet'))}:{})};
    const fingerprint=JSON.stringify(body);if(pending.current?.fingerprint!==fingerprint)pending.current={fingerprint,requestId:crypto.randomUUID()};
    setBusy(true);setError('');try{await request('/byte/markets',{...body,requestId:pending.current.requestId},token);pending.current=undefined;form.reset();await onDone();}catch(e){if(e instanceof ApiError&&[400,401,403,404,429,502].includes(e.status))pending.current=undefined;setError((e as Error).message);}finally{setBusy(false);}
  };
  return <form className="byte-create operator" onSubmit={e=>void submit(e)}><h3>Nuevo mercado en SOL</h3><div className="byte-form-grid"><Field label="Canal de Twitch">{props=><Input {...props} name="channel" placeholder="nombre_del_canal" pattern="[a-zA-Z0-9_]{1,40}" required/>}</Field><Field label="Ventana de apuestas (segundos)" hint="Entre 60 segundos y 7 días. El resultado se declara después del cierre.">{props=><Input {...props} type="number" name="windowSecs" defaultValue={120} min={60} max={604800} required/>}</Field><Field label="Pregunta">{props=><Input {...props} name="title" placeholder="¿Gana la próxima partida?" minLength={3} maxLength={140} required/>}</Field><Field label="Opciones" hint="Una por línea. Entre 2 y 6 opciones diferentes.">{props=><textarea {...props} name="options" defaultValue={'Sí\nNo'} rows={3} required/>}</Field><Field label="Reglas de resolución" hint="Definí el evento, el intento, qué evidencia vale y cuándo se anula.">{props=><textarea {...props} name="rules" rows={4} minLength={10} maxLength={2000} required/>}</Field><Field label="Wallet del creador (opcional)" hint="Si se configura, recibe el 0,5% de las ganancias según las reglas de byte.">{props=><Input {...props} name="wallet" placeholder="Dirección Solana"/>}</Field></div><Button disabled={disabled||busy} type="submit"><Plus size={16}/>{busy?'Abriendo mercado en cadena…':'Crear mercado en devnet'}</Button>{error&&<Notice tone="error">{error}</Notice>}</form>;
}
function Resolution({market:m,token,onDone}:{market:DisplayByteMarket;token:string;onDone:()=>Promise<void>}){
  const [winner,setWinner]=useState('0'),[evidence,setEvidence]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[action,setAction]=useState<'resolve'|'invalidate'>();
  const settle=async()=>{if(!action||busy)return;setBusy(true);setError('');try{await request(`/byte/markets/${m.id}/${action}`,action==='resolve'?{winner:Number(winner),evidence}:{reason:evidence},token);setAction(undefined);await onDone();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  if(m.notes?.twitch)return <article className="byte-market managed-market"><h3>{m.title}</h3><p>Réplica de @{m.notes.channel}. El resultado se confirma con Twitch.</p><p>{m.status==='open'?'Esperando resultado':m.chain.settled?'Pagos completados':'Resultado registrado, pagos pendientes'}</p></article>;
  return <article className="byte-market managed-market"><div className="byte-market-top"><span>@{m.notes?.channel}</span><span>{m.chain.settled?'Pagos completados':m.status==='open'?'Sin resolver':'Pagos pendientes'}</span></div><h3>{m.title}</h3><p className="byte-muted">Cierre: {new Date(m.closeMs).toLocaleString('es-AR')}</p>{m.status==='open'?<><Field label={`Resultado de ${m.title}`}>{props=><Select {...props} value={winner} onChange={e=>{setWinner(e.target.value);setAction(undefined);}} disabled={busy}>{m.options.map((option,index)=><option key={index} value={index}>{option}</option>)}</Select>}</Field><Field label={`Evidencia o motivo de ${m.title}`}>{props=><textarea {...props} value={evidence} minLength={10} maxLength={2000} rows={3} disabled={busy} onChange={e=>{setEvidence(e.target.value);setAction(undefined);}} placeholder="Enlace al VOD, timestamp y explicación del resultado"/>}</Field><div className="byte-actions"><Button disabled={busy||evidence.trim().length<10||Date.now()<m.closeMs||!m.resolvable} onClick={()=>setAction('resolve')}>Resolver mercado</Button><Button variant="outline" disabled={busy||evidence.trim().length<10} onClick={()=>setAction('invalidate')}>Anular y reembolsar</Button></div>{action&&<div className="byte-confirm"><p>{action==='resolve'?`Confirmar resultado: ${m.options[Number(winner)]}.`:'Confirmar anulación y devolución a todos.'} Esta decisión no se puede deshacer.</p><Button disabled={busy} onClick={()=>void settle()}>{busy?'Enviando…':'Confirmar decisión'}</Button><Button variant="ghost" disabled={busy} onClick={()=>setAction(undefined)}>Volver</Button></div>}</>:<p>{m.status==='invalid'?'Anulado':`Ganó: ${m.options[m.winner??0]}`}. {m.chain.settled?'byte completó la distribución.':'Esperando distribución automática de byte.'}</p>}{error&&<Notice tone="error">{error}</Notice>}</article>;
}
function Recovery({operation:op,token,onDone}:{operation:Operation;token:string;onDone:()=>void}){
  const [id,setId]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  return <div className="byte-market managed-market"><h3>Creación por conciliar: {op.title}</h3><p className="byte-muted">Revisá la lista del partner. Si byte creó el mercado, asociá su ID a estas reglas antes de intentar otra creación.</p><Input aria-label={`ID del mercado para ${op.title}`} placeholder="pm_…" value={id} onChange={e=>setId(e.target.value)}/><Button disabled={busy||!id} onClick={()=>{setBusy(true);void request('/byte/reconcile',{requestId:op.requestId,marketId:id},token).then(onDone).catch(e=>setError(e.message)).finally(()=>setBusy(false));}}>Conciliar mercado existente</Button>{error&&<Notice tone="error">{error}</Notice>}</div>;
}
createRoot(document.getElementById('byte-root')!).render(<App/>);
