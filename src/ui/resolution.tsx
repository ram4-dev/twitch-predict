import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ArrowLeft,ArrowUpRight,RotateCcw,ShieldCheck,Minus} from 'lucide-react';

type State='won'|'lost'|'spectator'|'void';
type Material='solid'|'glass'|'liquid';
import {Resolution} from './components/resolution.js';
const variants: {id:Material;name:string;description:string}[]=[
 {id:'solid',name:'Sólido',description:'El resultado, sin distracciones.'},
 {id:'glass',name:'Glass',description:'Profundidad y reflejos. Sin movimiento.'},
 {id:'liquid',name:'Liquid glass',description:'Un reflejo que acompaña la resolución.'}
];

export function ResolutionCard({state,material,stake=100}:{state:State;material:Material;stake?:number}){
 return <Resolution title="¿Baja a Margit en este intento?" channel="ramitapai" outcomes={[{id:'yes',title:'Lo baja'},{id:'no',title:'Se queda cerca'}]} winnerId="yes" canceled={state==='void'} stake={state==='spectator'?0:stake} payout={state==='void'?stake:state==='won'?Math.floor(stake*3.2):0} hit={state==='won'} material={material}/>;
}
function Showcase(){
 const [state,setState]=useState<State>('won');const [replay,setReplay]=useState(0);const [motion,setMotion]=useState(true);const [wide,setWide]=useState(false);
 return <main className="resolution-showcase" data-motion={motion?'on':'off'}>
  <header className="showcase-header"><a href="/components.html"><ArrowLeft size={16}/> Componentes</a><a className="plot-mark" href="/">plot<span>•</span></a><span>Laboratorio de extensión</span></header>
  <div className="intro"><div><h1>Resolución de predicciones.</h1><p>Quién ganó. Cómo te fue. Cuánto te llevás.</p></div><span className="demo-label">Datos de ejemplo</span></div>
  <div className="showcase-toolbar"><fieldset><legend>Tu resultado</legend><div className="segments">{([{id:'won',name:'Acertaste'},{id:'lost',name:'Perdiste'},{id:'spectator',name:'Sin apuesta'},{id:'void',name:'Anulada'}] as const).map(s=><button key={s.id} aria-pressed={state===s.id} onClick={()=>{setState(s.id);setReplay(r=>r+1);}}>{s.name}</button>)}</div></fieldset>
   <div className="preview-controls"><button aria-pressed={wide} onClick={()=>setWide(!wide)}>{wide?'700 px · Popup':'360 px · Compacto'}</button><button aria-pressed={!motion} onClick={()=>setMotion(!motion)}>{motion?'Pausar animación':'Activar animación'}</button><button onClick={()=>setReplay(r=>r+1)}><RotateCcw size={15}/> Repetir</button></div>
  </div>
  <div className={`variant-grid ${wide?'wide':''}`}>{variants.map(v=><section className="variant" key={v.id}><div className="variant-title"><h2>{v.name}</h2><span>{v.id==='solid'?'Sin efecto':v.id==='glass'?'Sin animación':'Con animación'}</span></div><p className="variant-description">{v.description}</p><div className="extension-preview"><div className="extension-chrome"><span className="mini-mark">plot</span><span>Extensión · Vista de prueba</span><Minus size={14}/></div><div className="preview-body" key={replay}><ResolutionCard state={state} material={v.id}/></div><div className="extension-footer"><ShieldCheck size={12}/> Puntos internos · Sin valor monetario</div></div></section>)}</div>
  <footer className="showcase-footer"><p>El cobro total incluye tu apuesta. La ganancia neta es lo que ganaste por encima de ella.</p><a href="https://21st.dev/community/components/explore/liquid-glass-components" target="_blank" rel="noreferrer">Referencia visual: 21st <ArrowUpRight size={14}/></a></footer>
 </main>;
}
if(document.getElementById('resolution-root'))createRoot(document.getElementById('resolution-root')!).render(<Showcase/>);
