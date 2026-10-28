import {useRef,useState,type FormEvent} from 'react';
import {createRoot} from 'react-dom/client';
import {createPortal} from 'react-dom';
import {ArrowRight,RotateCcw,Check} from 'lucide-react';
import {BalloonWordmark} from './components/balloon-wordmark.js';
import {LatexAtmosphere} from './components/latex-atmosphere.js';
import {Button} from './components/button.js';
function LandingBrand(){return <span className="landing-brand" role="img" aria-label="Plot!"><img src="/brand/plot-wordmark.jpg" alt="" width={1792} height={1008}/></span>;}

function WaitlistForm(){
  const [email,setEmail]=useState(''),[state,setState]=useState<'idle'|'saving'|'joined'|'error'>('idle'),[error,setError]=useState('');
  const sending=useRef(false);
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(sending.current)return;
    sending.current=true;setState('saving');setError('');
    try{
      const response=await fetch('/api/waitlist',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});
      if(!response.ok){const result=await response.json();throw new Error(result.error||'No pudimos guardar tu email. Intentá de nuevo.');}
      setState('joined');setEmail('');
    }catch(error){setError(error instanceof Error?error.message:'No pudimos guardar tu email. Intentá de nuevo.');setState('error');}
    finally{sending.current=false;}
  }
  return <form id="waitlist" className="waitlist-form" aria-label="Lista de espera" onSubmit={event=>void submit(event)}>
    <label htmlFor="waitlist-email">Sumate a la waitlist</label>
    {state!=='joined'&&<div className="waitlist-controls"><input id="waitlist-email" name="email" type="email" autoComplete="email" placeholder="Tu email" maxLength={254} required value={email} onChange={event=>setEmail(event.target.value)} aria-describedby="waitlist-feedback" aria-invalid={state==='error'||undefined} readOnly={state==='saving'}/><Button type="submit" loading={state==='saving'} aria-label="Anotarme en la waitlist">Anotarme <ArrowRight size={16} aria-hidden="true"/></Button></div>}
    <p id="waitlist-feedback" role={state==='error'?'alert':'status'} aria-live="polite">{state==='joined'?'Ya estás en la lista. Te avisamos cuando puedas entrar.':error||'Te avisamos por email cuando abramos el acceso.'}</p>
  </form>;
}

function PredictionPreview(){
  const [side,setSide]=useState<'Gana'|'Pierde'|null>(null);
  return <div className="prediction-preview" data-ui="" aria-label="Predicción de ejemplo">
    <div className="preview-meta"><span>Probá una predicción</span><span className="example-label">Ejemplo</span></div>
    <h2>¿Gana la próxima partida?</h2>
    <div className="preview-pool"><span>Pozo de ejemplo<strong>{side?'1.250':'1.000'} <small>pts</small></strong></span><span>Tu saldo<strong>{side?'9.750':'10.000'} <small>pts</small></strong></span></div>
    <div className="preview-split" aria-hidden="true"><span style={{flex:side==='Gana'?850:600}}/><span style={{flex:side==='Pierde'?650:400}}/></div>
    <div className="preview-outcomes">{(['Gana','Pierde'] as const).map((outcome,index)=><div className="preview-outcome" key={outcome} data-selected={side===outcome}>
      <div><strong>{outcome}</strong><span>{side?(side==='Gana'?(index===0?'68%':'32%'):(index===0?'48%':'52%')):(index===0?'60%':'40%')}</span></div>
      <p>{side===outcome?'Tu jugada: 250 pts':'Participá con 250 pts'}</p>
      <Button tone={index===0?'positive':'negative'} aria-pressed={side===outcome} onClick={()=>setSide(outcome)}>{side===outcome?<><Check size={16} aria-hidden="true"/>Tu elección</>:<>Elegir {outcome.toLowerCase()}</>}</Button>
    </div>)}</div>
    <div className="preview-feedback"><p role="status" aria-live="polite">{side?`Elegiste ${side.toLowerCase()}. Así se ve tu jugada.`:'Elegí un lado para ver cómo funciona.'}</p>{side&&<Button variant="ghost" size="icon-sm" aria-label="Reiniciar ejemplo" onClick={()=>setSide(null)}><RotateCcw size={16}/></Button>}</div>
    <p className="preview-disclaimer">Simulación con puntos de prueba. No realiza apuestas.</p>
  </div>;
}
function Landing(){return <div className="landing">
  {createPortal(<div className="landing-atmosphere" aria-hidden="true"><LatexAtmosphere/></div>,document.body)}
  <header className="landing-header"><a href="/landing" aria-label="plot, inicio"><LandingBrand/></a><nav aria-label="Navegación"><a href="#como-funciona">Cómo funciona</a><a className="waitlist-link" href="#waitlist">Entrar a la waitlist</a></nav></header>
  <main id="contenido">
    <section className="landing-hero" aria-labelledby="landing-title">
      <div className="hero-copy"><h1 id="landing-title">El stream juega.<br/>Vos elegís.</h1><p>Predicciones de Twitch con un pozo propio. Elegí tu lado y seguí la jugada con tu comunidad.</p><WaitlistForm/></div>
      <div className="hero-product"><div className="plot-scene landing-scene"><BalloonWordmark/></div><PredictionPreview/></div>
    </section>
    <section className="landing-how" id="como-funciona" aria-labelledby="how-title"><div className="how-heading"><h2 id="how-title">Tu primera jugada, acá.</h2><p>Del stream a tu lado del pozo.</p></div><div className="how-details"><article><h3>Elegí tu lado</h3><p>Abrí un mercado y participá con puntos de prueba. El resultado sigue la predicción original de Twitch.</p></article><article><h3>Llevá tu cuenta</h3><p>Conectá Phantom para conservar tu saldo e historial entre el panel y la extensión.</p></article></div></section>
  </main>
  <footer className="landing-footer"><LandingBrand/><p>La próxima jugada está por empezar.</p><a className="waitlist-link" href="#waitlist">Entrar a la waitlist</a></footer>
</div>;}
createRoot(document.getElementById('landing-root')!).render(<Landing/>);
