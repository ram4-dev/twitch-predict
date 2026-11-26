import {PhantomHandoff} from './phantom-handoff.js';
import {useBettingMode,BettingModeNotice} from './betting-mode.js';
import {useEffect,useRef,useState} from 'react';
import {PlotMascot} from './plot.js';
import {Button} from './button.js';
import {ArrowRight,Check,Loader2} from 'lucide-react';
import {TwitchIcon,GoogleIcon} from '../brand-icons.js';

type Provider={isPhantom?:boolean;connect():Promise<{publicKey:{toString():string}}>;signMessage(message:Uint8Array,display:string):Promise<{signature:Uint8Array;publicKey?:{toString():string}}>};
type Login={token:string;account:{wallet?:string;id:string};handoff?:{flowId:string;extensionId:string;code:string}};
const provider=()=>(window as unknown as {phantom?:{solana?:Provider}}).phantom?.solana;
const extensionFlow=()=>{const raw=new URLSearchParams(location.hash.slice(1)).get('flow')??'';return /^[a-f0-9]{64}$/.test(raw)?raw:undefined;};
async function request<T>(path:string,body?:unknown):Promise<T>{
 const token=localStorage.getItem('pointsToken');
 const response=await fetch(path,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 const data=await response.json();if(!response.ok)throw Object.assign(new Error(data.error||'No se pudo completar el acceso'),{status:response.status});return data;
}
/** Pair the extension tab that started the flow with the account that just signed in on the app. */
export async function completeExtensionFlow(flowId:string){
 const runtime=(globalThis as unknown as {chrome?:{runtime?:{sendMessage(id:string,message:unknown):Promise<{ok?:boolean;error?:string}>}}}).chrome?.runtime;
 if(!runtime?.sendMessage)throw new Error('Abrí este acceso en el mismo Chrome donde instalaste la extensión.');
 const handoff=await request<NonNullable<Login['handoff']>>('/api/auth/extension/authorize',{flowId});
 const response=await runtime.sendMessage(handoff.extensionId,{type:'AUTH_COMPLETE',flowId:handoff.flowId,code:handoff.code});
 if(!response?.ok)throw new Error(response?.error||'No se pudo vincular la extensión. Reintentá la conexión.');
 localStorage.setItem('linkedExtensionId',handoff.extensionId);
 sessionStorage.removeItem('plotExtensionFlow');
 return handoff;
}
/** The one sign-in surface. It used to live on /onboarding; the app renders it inline. */
export function AuthGate({onSignedIn}:{onSignedIn:()=>Promise<void>|void}){
 const mode=useBettingMode();
 const flowId=useRef(extensionFlow()).current;
 const [phase,setPhase]=useState('ready'),[error,setError]=useState(''),[installed,setInstalled]=useState(!!provider()?.isPhantom),[login,setLogin]=useState<Login>(),[flowReady,setFlowReady]=useState(!flowId);
 // Social-first entry: Twitch is the primary access, Google appears only when the server has it configured.
 const [googleConfigured,setGoogleConfigured]=useState<boolean|null>(null);
 useEffect(()=>{let active=true;void request<{configured:boolean}>('/api/google/config').then(c=>{if(active)setGoogleConfigured(c.configured);}).catch(()=>{if(active)setGoogleConfigured(false);});return()=>{active=false;};},[]);
 const social=async(social:'twitch'|'google')=>{
  setError('');setPhase('connecting');
  try{
   if(localStorage.getItem('pointsToken')){
    try{await request('/api/points/me');}catch(problem){if((problem as {status?:number}).status===401)localStorage.removeItem('pointsToken');else throw problem;}
   }
   if(flowId)sessionStorage.setItem('plotExtensionFlow',flowId);
   const result=await request<{url:string}>(`/api/${social}/start`,{});
   location.assign(result.url);
  }catch(problem){setError((problem as Error).message);setPhase('ready');}
 };
 const finish=async(result:Login)=>{
  if(result.handoff){
   setPhase('linking');
   const runtime=(globalThis as unknown as {chrome?:{runtime?:{sendMessage(id:string,message:unknown):Promise<{ok?:boolean;error?:string}>}}}).chrome?.runtime;
   if(!runtime?.sendMessage)throw new Error('Abrí este acceso en el mismo Chrome donde instalaste la extensión.');
   const response=await runtime.sendMessage(result.handoff.extensionId,{type:'AUTH_COMPLETE',flowId:result.handoff.flowId,code:result.handoff.code});
   if(!response?.ok)throw new Error(response?.error||'No se pudo vincular la extensión. Reintentá la conexión.');
   localStorage.setItem('linkedExtensionId',result.handoff.extensionId);
  }
  sessionStorage.removeItem('plotExtensionFlow');
  // A flow id lives in the URL hash for the extension popup; drop it once the account is linked.
  if(flowId){const url=new URL(location.href);url.hash='';history.replaceState(null,'',url);}
  setPhase('done');
  await onSignedIn();
 };
 const connect=async()=>{
  setError('');
  try{
   if(login){await finish(login);return;}
   const wallet=provider();if(!wallet?.isPhantom){setInstalled(false);throw new Error('Instalá Phantom en este navegador y volvé a esta página.');}
   setPhase('connecting');const {publicKey}=await wallet.connect();const address=publicKey.toString();
   const challenge=await request<{challengeId:string;message:string}>('/api/auth/challenge',{address,...(flowId?{flowId}:{})});
   setPhase('signing');const signed=await wallet.signMessage(new TextEncoder().encode(challenge.message),'utf8');
   if(signed.publicKey&&signed.publicKey.toString()!==address)throw new Error('Cambiaste de wallet durante el acceso. Volvé a conectar.');
   const signature=btoa(String.fromCharCode(...new Uint8Array(signed.signature)));
   const result=await request<Login>('/api/auth/verify',{challengeId:challenge.challengeId,signature});
   const previous=localStorage.getItem('pointsToken');if(previous&&previous!==result.token)localStorage.setItem('previousPointsToken',previous);
   localStorage.setItem('pointsToken',result.token);setLogin(result);await finish(result);
  }catch(problem){const failure=problem as Error&{code?:number};setError(failure.code===4001?'Cancelaste la conexión o la firma. Podés volver a intentar.':failure.message);setPhase('ready');}
 };
 // Deep links from the profile land straight on the provider, so a connect row is one click.
 const deepLinkStarted=useRef(false);
 useEffect(()=>{
  if(deepLinkStarted.current)return;
  const wanted=new URLSearchParams(location.search).get('connect');
  if(!wanted)return;
  deepLinkStarted.current=true;
  if(wanted==='twitch'||wanted==='google'){void social(wanted);return;}
  if(wanted==='phantom'){void connect();}
 },[]);
 useEffect(()=>{let active=true;const timer=setInterval(()=>setInstalled(!!provider()?.isPhantom),500);if(flowId)void request('/api/auth/flow/'+encodeURIComponent(flowId)).then(()=>{if(active)setFlowReady(true);}).catch(problem=>{if(active)setError((problem as Error).message);});return()=>{active=false;clearInterval(timer);};},[]);
 const autoStarted=useRef(false);
 useEffect(()=>{if(flowReady&&installed&&!new URLSearchParams(location.search).get('connect')&&!autoStarted.current){autoStarted.current=true;void connect();}},[flowReady,installed]);
 const busy=phase!=='ready';
 const labels:Record<string,string>={ready:login?'Reintentar vinculación':'Conectar Phantom',connecting:'Conectá tu wallet en Phantom…',signing:'Confirmá el inicio de sesión en Phantom…',linking:'Vinculando tu extensión…',done:'Abriendo tu panel…'};
 return <section className="phone-sign-in" aria-label="Iniciar sesión">
  <div className="auth-progress"><span>{flowId?<><Check size={14}/> Extensión instalada</>:<>plot</>}</span><span>Cuenta y panel</span></div>
  <PlotMascot/>
  <h2>Tu cuenta, también<br/>en el stream.</h2>
  <p>Entrá con Twitch para tener tus puntos y apuestas desde el chat, la extensión y el panel.</p>
  <div className="auth-social" role="group" aria-label="Formas de entrar">
   <Button className="auth-primary" disabled={busy} onClick={()=>void social('twitch')}>{phase==='connecting'?<Loader2 size={16} className="animate-spin"/>:<TwitchIcon size={18}/>}<span>{phase==='connecting'?'Abriendo Twitch…':'Continuar con Twitch'}</span>{phase==='connecting'?null:<ArrowRight size={16}/>}</Button>
   {!flowId&&googleConfigured!==false&&<Button variant="outline" disabled={busy||googleConfigured===null} onClick={()=>void social('google')}>{googleConfigured===null?<Loader2 size={16} className="animate-spin"/>:<GoogleIcon size={18}/>}<span>{googleConfigured===null?'Google…':'Continuar con Google'}</span></Button>}
   {!flowId&&googleConfigured===false&&<p className="auth-secondary" aria-disabled="true">Google todavía no está disponible.</p>}
  </div>
  {flowId?(installed?<Button className="auth-primary" disabled={busy||!flowReady} onClick={()=>void connect()}>{busy?<Loader2 size={16} className="animate-spin"/>:null}{labels[phase]}{!busy&&<ArrowRight size={16}/>}</Button>:<><PhantomHandoff className="auth-primary" allowMobile={false}/><p className="auth-secondary">Después de instalarla, volvé acá para conectar tu wallet.</p><Button variant="ghost" onClick={()=>location.reload()}>Ya la instalé · volver a detectar</Button></>)
   :installed?<Button variant="outline" disabled={busy} onClick={()=>void connect()}>Conectar Phantom</Button>:<PhantomHandoff className="auth-secondary"/>}
  {error&&<p className="auth-error" role="alert">{error}</p>}
  <BettingModeNotice mode={mode}/>
 </section>;
}
