import {PhantomHandoff} from './components/phantom-handoff.js';
import {AuthLayout} from './components/auth-layout.js';
import {useBettingMode,BettingModeNotice} from './components/betting-mode.js';
import {useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {PlotMascot} from './components/plot.js';
import {Button} from './components/button.js';
import {ArrowRight,Check,Loader2} from 'lucide-react';
import {StreamerOnboarding} from './streamer-onboarding.js';
type Provider={isPhantom?:boolean;connect():Promise<{publicKey:{toString():string}}>;signMessage(message:Uint8Array,display:string):Promise<{signature:Uint8Array;publicKey?:{toString():string}}>};
type Login={token:string;account:{wallet:string;id:string};handoff?:{flowId:string;extensionId:string;code:string}};
const provider=()=> (window as unknown as {phantom?:{solana?:Provider}}).phantom?.solana;
const flowId=new URLSearchParams(location.hash.slice(1)).get('flow')??undefined;
async function request<T>(path:string,body?:unknown):Promise<T>{const token=localStorage.getItem('pointsToken');const response=await fetch(path,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});const data=await response.json();if(!response.ok)throw new Error(data.error||'No se pudo completar el acceso');return data;}
function Onboarding(){
  const mode=useBettingMode();
  const [phase,setPhase]=useState('ready'),[error,setError]=useState(''),[installed,setInstalled]=useState(!!provider()?.isPhantom),[login,setLogin]=useState<Login>(),[flowReady,setFlowReady]=useState(!flowId);
  // Social-first entry: Twitch is the primary access, Google appears only when the server has it configured.
  const [googleConfigured,setGoogleConfigured]=useState<boolean|null>(null);
  useEffect(()=>{let active=true;void request<{configured:boolean}>('/api/google/config').then(c=>{if(active)setGoogleConfigured(c.configured);}).catch(()=>{if(active)setGoogleConfigured(false);});return()=>{active=false;};},[]);
  const social=async(provider:'twitch'|'google')=>{
    setError('');setPhase('connecting');
    try{
      const result=await request<{url:string}>(`/api/${provider}/start`,{});
      location.assign(result.url);
    }catch(e){setError((e as Error).message);setPhase('ready');}
  };
  // Returning from the provider callback: consume the ticket and open the panel.
  useEffect(()=>{
    const params=new URLSearchParams(location.search);const ticket=params.get('twitch_ticket')??params.get('google_ticket');const oauthError=params.get('twitch_error')??params.get('google_error');
    const provider=params.has('google_ticket')?'google':'twitch';
    if(!ticket&&!oauthError)return;
    params.delete('twitch_ticket');params.delete('twitch_error');params.delete('google_ticket');params.delete('google_error');
    const query=params.toString();history.replaceState(null,'',`${location.pathname}${query?'?'+query:''}${location.hash}`);
    let active=true;
    (async()=>{
      if(oauthError){if(active)setError(oauthError==='canceled'?'Cancelaste la conexión. Podés volver a intentar.':'No se pudo completar la conexión. Volvé a intentar.');return;}
      try{
        const result=await request<Login & {token:string}>(`/api/${provider}/complete`,{ticket});
        const previous=localStorage.getItem('pointsToken');if(previous&&previous!==result.token)localStorage.setItem('previousPointsToken',previous);
        localStorage.setItem('pointsToken',result.token);setPhase('done');location.replace('/app#markets');
      }catch(e){if(active)setError((e as Error).message);}
    })();
    return()=>{active=false;};
  },[]);
  useEffect(()=>{let active=true;const timer=setInterval(()=>setInstalled(!!provider()?.isPhantom),500);if(flowId)void request('/api/auth/flow/'+encodeURIComponent(flowId)).then(()=>{if(active)setFlowReady(true);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;clearInterval(timer);};},[]);
  const finish=async(result:Login)=>{
    if(result.handoff){
      setPhase('linking');
      const runtime=(globalThis as unknown as {chrome?:{runtime?:{sendMessage(id:string,message:unknown):Promise<{ok?:boolean;error?:string}>}}}).chrome?.runtime;
      if(!runtime?.sendMessage)throw new Error('Abrí este acceso en el mismo Chrome donde instalaste la extensión.');
      const response=await runtime.sendMessage(result.handoff.extensionId,{type:'AUTH_COMPLETE',flowId:result.handoff.flowId,code:result.handoff.code});
      if(!response?.ok)throw new Error(response?.error||'No se pudo vincular la extensión. Reintentá la conexión.');
      localStorage.setItem('linkedExtensionId',result.handoff.extensionId);
    }
    setPhase('done');if(new URLSearchParams(location.search).has('extension')){window.close();return;}location.replace('/app#markets');
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
    }catch(e){const err=e as Error&{code?:number};setError(err.code===4001?'Cancelaste la conexión o la firma. Podés volver a intentar.':err.message);setPhase('ready');}
  };
  const autoStarted=useRef(false);
  useEffect(()=>{if(flowReady&&installed&&new URLSearchParams(location.search).has('extension')&&!autoStarted.current){autoStarted.current=true;void connect();}},[flowReady,installed]);
  const busy=phase!=='ready';
  const labels:Record<string,string>={ready:login?'Reintentar vinculación':'Conectar Phantom',connecting:'Conectá tu wallet en Phantom…',signing:'Confirmá el inicio de sesión en Phantom…',linking:'Vinculando tu extensión…',done:'Abriendo tu panel…'};
  return <AuthLayout footer="Al terminar, abrimos tu panel y la extensión queda conectada."><div className="auth-progress"><span>{flowId?<><Check size={14}/> Extensión instalada</>:<>plot</>}</span><span>Cuenta y panel</span></div><PlotMascot/><h1>Tu cuenta, también<br/>en el stream.</h1><p>Entrá con Twitch para tener tus puntos y apuestas desde el chat, la extensión y el panel.</p><div className="auth-benefits"><span>Una misma cuenta en todos lados</span><span>Tu saldo e historial se conservan</span><span>Wallet opcional: solo para BYTE</span></div>
      {!flowId&&<div className="auth-social" role="group" aria-label="Formas de entrar">
        <Button className="auth-primary" disabled={phase!=='ready'} onClick={()=>void social('twitch')}>{phase==='connecting'?'Abriendo Twitch…':'Continuar con Twitch'}{phase==='connecting'?<Loader2 size={16} className="animate-spin"/>:<ArrowRight size={16}/>}</Button>
        {googleConfigured!==false&&<Button variant="outline" disabled={phase!=='ready'||googleConfigured===null} onClick={()=>void social('google')}>{googleConfigured===null?'Google…':'Continuar con Google'}</Button>}
        {googleConfigured===false&&<p className="auth-secondary" aria-disabled="true">Google todavía no está disponible.</p>}
      </div>}
      {flowId?(installed?<Button className="auth-primary" disabled={busy||!flowReady} onClick={()=>void connect()}>{busy?<Loader2 size={16} className="animate-spin"/>:null}{labels[phase]}{!busy&&<ArrowRight size={16}/>}</Button>:<><PhantomHandoff className="auth-primary" allowMobile={false}/><p className="auth-secondary">Después de instalarla, volvé acá para conectar tu wallet.</p><Button variant="ghost" onClick={()=>location.reload()}>Ya la instalé · volver a detectar</Button></>)
      :installed&&<Button variant="outline" disabled={phase!=='ready'} onClick={()=>void connect()}>Conectar Phantom</Button>}
      {error&&<p className="auth-error" role="alert">{error}</p>}<BettingModeNotice mode={mode}/></AuthLayout>;
}
createRoot(document.getElementById('onboarding-root')!).render(new URLSearchParams(location.search).has('streamer')?<StreamerOnboarding/>:<Onboarding/>);
