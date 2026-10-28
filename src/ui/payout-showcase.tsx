import {useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ArrowUpRight,Check,ChevronLeft,RotateCcw,X} from 'lucide-react';

type Variant='count'|'reel'|'cut'|'impact';
type Scenario='profit'|'loss'|'spectator'|'pending';
const variants:{id:Variant;name:string;description:string}[]=[
 {id:'count',name:'Inter',description:'La actual. Clara y precisa, con números estables.'},
 {id:'reel',name:'Space Grotesk',description:'Geométrica, con más personalidad en las cifras.'},
 {id:'cut',name:'Fraunces',description:'La del logo. Más expresiva y editorial.'},
 {id:'impact',name:'Archivo Black',description:'Ancha y contundente, para darle peso al resultado.'},
];
const scenarios:{id:Scenario;label:string}[]=[{id:'profit',label:'Ganancia'},{id:'loss',label:'Pérdida'},{id:'spectator',label:'Sin apuesta'},{id:'pending',label:'Pago pendiente'}];
const values:Record<Scenario,{net:number|null;label:string;detail:string}>={
 profit:{net:.018,label:'Ganancia neta',detail:'Apuesta 0,010 SOL · Cobro total 0,028 SOL'},
 loss:{net:-.01,label:'Pérdida neta',detail:'Apuesta 0,010 SOL · Cobro total 0 SOL'},
 spectator:{net:null,label:'No participaste',detail:'Esta ronda no modificó tu saldo.'},
 pending:{net:null,label:'Pago por confirmar',detail:'El resultado llegó. El importe final todavía no está confirmado.'},
};
const amount=(value:number)=>`${value<0?'−':'+'}${new Intl.NumberFormat('es-AR',{minimumFractionDigits:3,maximumFractionDigits:3}).format(Math.abs(value))}`;
function useReducedMotion(){
 const [reduced,setReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
 useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)'),change=()=>setReduced(media.matches);media.addEventListener('change',change);return()=>media.removeEventListener('change',change);},[]);return reduced;
}
function CountingAmount({value,reduced}:{value:number;reduced:boolean}){
 const [current,setCurrent]=useState(reduced?value:0);
 useEffect(()=>{if(reduced){setCurrent(value);return;}let raf=0;const start=performance.now();const tick=(now:number)=>{const progress=Math.min(1,(now-start)/1150);setCurrent(value*(1-Math.pow(1-progress,4)));if(progress<1)raf=requestAnimationFrame(tick);};raf=requestAnimationFrame(tick);return()=>cancelAnimationFrame(raf);},[value,reduced]);
 return <span className="counting-number" data-complete={current===value}>{current===0&&value<0?amount(current).replace('+','−'):amount(current)}</span>;
}
function ResultCard({variant,scenario,run,reduced}:{variant:Variant;scenario:Scenario;run:number;reduced:boolean}){
 const result=values[scenario],display=result.net===null?'—':amount(result.net);
 return <article className={`payout-card type-${variant}`} data-scenario={scenario} data-motion={reduced?'off':'on'} aria-label={`${variants.find(v=>v.id===variant)!.name}: ${result.label}`}>
  <div className="payout-context"><span>@gorgc</span><span><Check size={13}/>Resultado confirmado</span></div>
  <p className="payout-question">Astra vs BB</p>
  <div className="reveal-content" key={`${scenario}:${run}:${reduced}`}>
   <p className="result-label">{result.label}</p>
   <div className="money" aria-label={result.net===null?result.label:`${result.label}: ${display} SOL`}>
    <span className="money-number" aria-hidden="true">{result.net===null?'—':<CountingAmount value={result.net} reduced={reduced}/>}</span>
    {result.net!==null&&<span className="money-unit" aria-hidden="true">SOL</span>}
   </div>
   <p className="payout-detail">{result.detail}</p>
  </div>
  <div className="payout-foot"><span>Datos de ejemplo</span><span>plot<span className="orange">!</span></span></div>
 </article>;
}
function OpeningDemo({variant,scenario,reduced,onClose}:{variant:Variant;scenario:Scenario;reduced:boolean;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),[open,setOpen]=useState(false),[run,setRun]=useState(0);
 useEffect(()=>{dialog.current?.showModal();},[]);
 useEffect(()=>{setOpen(false);const timer=setTimeout(()=>setOpen(true),1200);return()=>clearTimeout(timer);},[run]);
 const finish=()=>{dialog.current?.close();onClose();};
 return <dialog ref={dialog} className="opening-dialog" aria-label={`Apertura simulada · ${variants.find(v=>v.id===variant)!.name}`} onCancel={event=>{event.preventDefault();finish();}}>
  <header className="demo-header"><div><span className="orange">●</span><strong>Apertura simulada</strong><span>Datos de ejemplo</span></div><button onClick={finish} aria-label="Cerrar simulación"><X size={20}/></button></header>
  <div className="browser-stage" data-popup={open?'open':'closed'}>
   <div className="browser-bar"><span className="browser-address">twitch.tv/gorgc</span><span className={`toolbar-mark ${open?'has-result':''}`} aria-label={open?'Plot tiene un resultado':'Plot'}>!</span></div>
   <div className="stream-placeholder"><span>@gorgc</span><strong>{open?'Resultado recibido.':'Esperando el resultado…'}</strong><p>{open?'El popup se abre y revela el importe.':'La extensión está cerrada.'}</p></div>
   {open&&<div className="simulated-popup" data-motion={reduced?'off':'on'}><div className="popup-heading"><span>plot<span className="orange">!</span></span><span>SOL devnet · Demo</span></div><ResultCard variant={variant} scenario={scenario} run={run} reduced={reduced}/></div>}
  </div>
  <footer className="demo-footer"><span role="status">{open?'Popup abierto': 'Popup cerrado · el resultado llega en un momento'}</span><button onClick={()=>setRun(r=>r+1)}><RotateCcw size={14}/>Repetir secuencia</button></footer>
 </dialog>;
}
function Showcase(){
 const [scenario,setScenario]=useState<Scenario>('profit'),[runs,setRuns]=useState<Record<Variant,number>>({count:0,reel:0,cut:0,impact:0}),[demo,setDemo]=useState<Variant|null>(null),[color,setColor]=useState('orange');
 const reduced=useReducedMotion(),lastTrigger=useRef<HTMLButtonElement|null>(null);
 useEffect(()=>{if(demo===null)lastTrigger.current?.focus();},[demo]);
 const close=()=>setDemo(null);
 return <main className="payout-showcase" data-color={color}>
  <header className="showcase-header"><a href="/" className="brand">plot<span>!</span></a><span>Laboratorio / Resolución</span><span className="preview-note">Prototipo · Datos de ejemplo</span></header>
  <section className="showcase-intro"><a href="/resolution.html" className="back"><ChevronLeft size={14}/>Showcase anterior</a><h1>Conteo con carácter.</h1><p>Mismo conteo, cuatro tipografías. Al llegar, la cifra crece y vuelve a su tamaño.</p></section>
  <div className="scenario-controls"><fieldset><legend>Probá un resultado</legend><div className="scenario-buttons">{scenarios.map(s=><button key={s.id} aria-pressed={scenario===s.id} onClick={()=>setScenario(s.id)}>{s.label}</button>)}</div></fieldset><span>Cifras ficticias en SOL devnet</span></div>
  <fieldset className="color-controls"><legend>Color de la ganancia</legend>{[{id:'orange',name:'Naranja Plot'},{id:'mint',name:'Menta'},{id:'gold',name:'Dorado'}].map(c=><button key={c.id} aria-pressed={color===c.id} onClick={()=>setColor(c.id)}>{c.name}</button>)}<button className="replay-all" onClick={()=>setRuns(r=>({count:r.count+1,reel:r.reel+1,cut:r.cut+1,impact:r.impact+1}))}><RotateCcw size={14}/>Repetir todas</button></fieldset>
  <div className="payout-grid">{variants.map((v,i)=><section className="payout-variant" key={v.id} aria-label={`Opción ${i+1}: ${v.name}`}>
   <div className="variant-heading"><div><span className="variant-number">0{i+1}</span><h2>{v.name}</h2></div><button aria-label={`Repetir ${v.name}`} onClick={()=>setRuns(r=>({...r,[v.id]:r[v.id]+1}))}><RotateCcw size={15}/></button></div>
   <p className="variant-description">{v.description}</p>
   <ResultCard variant={v.id} scenario={scenario} run={runs[v.id]} reduced={reduced}/>
   <button className="opening-trigger" onClick={event=>{lastTrigger.current=event.currentTarget;setDemo(v.id);}}>Probar con la extensión cerrada<ArrowUpRight size={16}/></button>
  </section>)}</div>
  <footer className="showcase-footer"><p>Conteo de 1,15 s + un pulso al llegar. Sin animación de fondo.</p><p>La apertura de esta página es una simulación. El popup actual sigue igual.</p></footer>
  {demo&&<OpeningDemo variant={demo} scenario={scenario} reduced={reduced} onClose={close}/>}
 </main>;
}
createRoot(document.getElementById('payout-showcase-root')!).render(<Showcase/>);
