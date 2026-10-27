import {useEffect,useState} from 'react';
import {ArrowRight,Check,Loader2} from 'lucide-react';
import {PlotLogo,Chameleon} from './components/plot.js';
import {Button} from './components/button.js';

type Provider={isPhantom?:boolean;connect(options?:{onlyIfTrusted?:boolean}):Promise<{publicKey:{toString():string}}>;signMessage(message:Uint8Array,display:string):Promise<{signature:Uint8Array;publicKey?:{toString():string}}>};
type Account={wallet:string|null;twitch?:{login:string;displayName:string}|null};
const provider=()=>{const w=window as unknown as {phantom?:{solana?:Provider};solana?:Provider};return w.phantom?.solana??w.solana;};
async function request<T>(path:string,body?:unknown,extra:Record<string,string>={}):Promise<T>{
 const token=localStorage.getItem('pointsToken');const response=await fetch(path,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(token?{Authorization:`Bearer ${token}`} :{}),...extra},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
 const result=await response.json();if(!response.ok)throw new Error(result.error||'No se pudo completar la conexión.');return result;
}
export function StreamerOnboarding(){
 const [account,setAccount]=useState<Account>(),[configured,setConfigured]=useState<boolean>(),[installed,setInstalled]=useState(!!provider()?.isPhantom),[busy,setBusy]=useState(''),[error,setError]=useState(''),[watching,setWatching]=useState(false);
 const load=async()=>{if(!localStorage.getItem('pointsToken'))return;const a=await request<Account>('/api/points/me');setAccount(a);return a;};
 const watch=async(channel:string)=>{
  const status=await request<{operatorMode:string}>('/api/byte/status');let headers:Record<string,string>={};
  if(status.operatorMode==='local'){const pair=await request<{token:string}>('/api/pair');headers={'x-operator-token':pair.token};}
  await request('/api/byte/twitch/watch',{channel},headers);setWatching(true);
 };
 useEffect(()=>{
  let active=true;const timer=setInterval(()=>setInstalled(!!provider()?.isPhantom),500);
  void (async()=>{try{
   const config=await request<{configured:boolean}>('/api/twitch/config');if(active)setConfigured(config.configured);
   const params=new URLSearchParams(location.search),ticket=params.get('twitch_ticket'),oauthError=params.get('twitch_error');
   if(ticket||oauthError)history.replaceState(null,'','/onboarding?streamer=1');
   if(oauthError){await load();throw new Error(oauthError==='canceled'?'Cancelaste la conexión con Twitch. Podés volver a intentar.':'No se pudo conectar Twitch. Volvé a intentar.');}
   if(ticket){setBusy('Finalizando Twitch…');await request('/api/twitch/complete',{ticket});}
   const a=await load();
   if(a?.twitch)await watch(a.twitch.login);
  }catch(e){if(active)setError((e as Error).message);}finally{if(active)setBusy('');}})();
  return()=>{active=false;clearInterval(timer);};
 },[]);
 const connectWallet=async()=>{setError('');setBusy('Conectando wallet…');try{
  const wallet=provider();if(!wallet?.isPhantom)throw new Error('Instalá Phantom y volvé a esta página.');
  const {publicKey}=await wallet.connect(),address=publicKey.toString();const challenge=await request<{challengeId:string;message:string}>('/api/auth/challenge',{address});
  setBusy('Confirmá la firma en Phantom…');const proof=await wallet.signMessage(new TextEncoder().encode(challenge.message),'utf8');if(proof.publicKey&&proof.publicKey.toString()!==address)throw new Error('La wallet cambió durante la firma. Volvé a conectar.');
  const result=await request<{token:string}>('/api/auth/verify',{challengeId:challenge.challengeId,signature:btoa(String.fromCharCode(...proof.signature))});localStorage.setItem('pointsToken',result.token);setWatching(false);await load();
 }catch(e){const err=e as Error&{code?:number};setError(err.code===4001?'Cancelaste la conexión o la firma. Podés volver a intentar.':err.message);}finally{setBusy('');}};
 const connectTwitch=async()=>{setError('');setBusy('Abriendo Twitch…');try{const result=await request<{url:string}>('/api/twitch/start',{streamerOnboarding:true});location.assign(result.url);}catch(e){setError((e as Error).message);setBusy('');}};
 const register=async()=>{if(!account?.twitch)return;setError('');setBusy('Activando tu canal…');try{await watch(account.twitch.login);}catch(e){setError((e as Error).message);}finally{setBusy('');}};
 return <main className="onboarding"><a className="auth-brand" href="/"><PlotLogo/></a><section className="auth-card streamer-onboarding"><div className="auth-progress"><span>Plot para streamers</span><span>SOL devnet</span></div><Chameleon/><h1>Tu stream, en Plot.</h1><p>Conectá tu wallet y verificá tu canal para seguir tus predicciones de Twitch.</p>
  <ol className="streamer-steps"><li><div><strong>Wallet Phantom</strong><p>{account?.wallet?`${account.wallet.slice(0,6)}…${account.wallet.slice(-5)}`:'Conectá y firmá para crear tu cuenta.'}</p></div>{account?.wallet?<Check aria-label="Conectada" size={20}/>:installed?<Button variant="outline" disabled={!!busy} onClick={()=>void connectWallet()}>Conectar Phantom</Button>:<a href="https://phantom.com/download" target="_blank" rel="noopener">Instalar Phantom</a>}</li>
  <li><div><strong>Canal de Twitch</strong><p>{account?.twitch?`@${account.twitch.login}`:configured===false?'La conexión con Twitch todavía no está configurada.':'Verificá que el canal es tuyo.'}</p></div>{account?.twitch?<Check aria-label="Conectado" size={20}/>:<Button variant="outline" disabled={!account?.wallet||configured!==true||!!busy} onClick={()=>void connectTwitch()}>Conectar Twitch</Button>}</li></ol>
  {busy&&<p role="status"><Loader2 size={16} className="animate-spin"/> {busy}</p>}{error&&<p className="auth-error" role="alert">{error}</p>}
  {account?.twitch&&<div className="streamer-finish">{watching?<p role="status">Tu canal está en seguimiento. Las predicciones elegibles se replicarán en devnet.</p>:<Button className="auth-primary" disabled={!!busy} onClick={()=>void register()}>Activar seguimiento <ArrowRight size={16}/></Button>}<a href={`/?channel=${encodeURIComponent(account.twitch.login)}`}>Ver mercados de mi canal →</a></div>}
  <p className="auth-note">La firma de acceso no envía una transacción. Las apuestas usan SOL de devnet.</p></section></main>;
}
