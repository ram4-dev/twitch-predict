import {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {PlotLogo,Chameleon} from './components/plot.js';
import {Button} from './components/button.js';
import {ArrowRight,Check,Loader2} from 'lucide-react';
type Provider={isPhantom?:boolean;connect():Promise<{publicKey:{toString():string}}>;signMessage(message:Uint8Array,display:string):Promise<{signature:Uint8Array;publicKey?:{toString():string}}>};
type Login={token:string;account:{wallet:string;id:string};handoff?:{flowId:string;extensionId:string;code:string}};
const provider=()=> (window as unknown as {phantom?:{solana?:Provider}}).phantom?.solana;
const flowId=new URLSearchParams(location.hash.slice(1)).get('flow')??undefined;
async function request<T>(path:string,body?:unknown):Promise<T>{const token=localStorage.getItem('pointsToken');const response=await fetch(path,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});const data=await response.json();if(!response.ok)throw new Error(data.error||'No se pudo completar el acceso');return data;}
function Onboarding(){
  const [phase,setPhase]=useState('ready'),[error,setError]=useState(''),[installed,setInstalled]=useState(!!provider()?.isPhantom),[login,setLogin]=useState<Login>(),[flowReady,setFlowReady]=useState(!flowId);
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
    setPhase('done');location.replace('/#markets');
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
  const busy=phase!=='ready';
  const labels:Record<string,string>={ready:login?'Reintentar vinculación':'Conectar Phantom',connecting:'Conectá tu wallet en Phantom…',signing:'Confirmá el inicio de sesión en Phantom…',linking:'Vinculando tu extensión…',done:'Abriendo tu panel…'};
  return <main className="onboarding"><a className="auth-brand" href="/"><PlotLogo/></a><section className="auth-card"><div className="auth-progress"><span>{flowId?<><Check size={14}/> Extensión instalada</>:<>plot</>}</span><span>Cuenta y panel</span></div><Chameleon/><h1>Tu cuenta, también<br/>en el stream.</h1><p>Conectá Phantom para tener tus puntos y apuestas en la extensión y en el panel.</p><div className="auth-benefits"><span>Una misma cuenta en ambos lugares</span><span>Tu saldo e historial se conservan</span><span>Solo una firma de acceso, sin comisión</span></div>
      {installed?<Button className="auth-primary" disabled={busy||!flowReady} onClick={()=>void connect()}>{busy?<Loader2 size={16} className="animate-spin"/>:null}{labels[phase]}{!busy&&<ArrowRight size={16}/>}</Button>:<><a className="auth-primary" href="https://phantom.com/download" target="_blank" rel="noopener">Instalar Phantom <ArrowRight size={16}/></a><p className="auth-secondary">Después de instalarla, volvé acá para conectar tu wallet.</p><Button variant="ghost" onClick={()=>location.reload()}>Ya la instalé · volver a detectar</Button></>}
      {error&&<p className="auth-error" role="alert">{error}</p>}<p className="auth-note">Los puntos son internos y de prueba. No necesitás depositar SOL.</p></section><p className="auth-footer">Al terminar, abrimos tu panel y la extensión queda conectada.</p></main>;
}
createRoot(document.getElementById('onboarding-root')!).render(<Onboarding/>);
