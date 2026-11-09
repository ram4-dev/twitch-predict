import {PlotLogo} from './components/plot.js';
import {useRef,useState,type CSSProperties} from 'react';
import {createRoot} from 'react-dom/client';
import {BarChart3,Layers3,Radio,Users,ArrowUpRight,ArrowLeft,Check} from 'lucide-react';

type Variant='glass'|'rim'|'dock';
type View='markets'|'history'|'streamer'|'channels';
const items=[{id:'markets',label:'Mercados',icon:BarChart3},{id:'history',label:'Mis apuestas',icon:Layers3},{id:'streamer',label:'Streamer',icon:Radio},{id:'channels',label:'Canales',icon:Users}] as const;
// Original Plot adaptations of navigation patterns referenced on 21st.dev.
// These previews make no wallet, market or transaction requests.
const variants=[
 {id:'glass',name:'Isla de vidrio',detail:'Cápsula flotante, reflejos suaves y una selección líquida que se desliza.',trait:'Vidrio · flotante · borde sutil',reference:'Glass Tab Bar',author:'deepraj21',url:'https://21st.dev/@deepraj21/components/glass-tab-bar'},
 {id:'rim',name:'Órbita naranja',detail:'Barra superior enmarcada, luz en el contorno y un trazo que sigue la sección activa.',trait:'Marco luminoso · arriba · indicador deslizante',reference:'Tubelight Navbar',author:'Ayushmaan Singh',url:'https://21st.dev/@ayushmxxn/components/tubelight-navbar'},
 {id:'dock',name:'Dock abierto',detail:'Controles independientes sin marco exterior. Abajo en mobile; al costado cuando hay espacio.',trait:'Sin borde · modular · hover magnético',reference:'DockMorph',author:'Ruixen UI',url:'https://21st.dev/@ruixen.ui/components/dock-morph'},
] as const;
const isVariant=(value:string|null):value is Variant=>variants.some(v=>v.id===value);

function BrandAndBalance(){return <div className="preview-head"><PlotLogo className="nav-brand"/><div className="preview-balance"><span>Saldo de ejemplo</span><strong>10.000 <small>pts</small></strong></div></div>;}
function Navbar({variant,active,onChange}:{variant:Variant;active:View;onChange:(view:View)=>void}){
 const index=items.findIndex(item=>item.id===active);
 return <nav className={`option-navbar navbar-${variant}`} aria-label="Secciones de Plot" style={{'--active':index} as CSSProperties}>
  {variant!=='dock'&&<span className="nav-indicator" aria-hidden="true">{variant==='glass'&&<span key={active} className="liquid-ripple"/>}</span>}
  {items.map(({id,label,icon:Icon})=><button type="button" className="nav-item" key={id} aria-current={active===id?'page':undefined} onClick={()=>onChange(id)}><span className="nav-icon"><Icon size={20} strokeWidth={1.6}/></span><span className="nav-label">{label}</span>{variant==='dock'&&active===id&&<span className="dock-dot" aria-hidden="true"/>}</button>)}
 </nav>;
}
function MarketExample(){return <article className="demo-market"><div className="demo-meta"><span>@ramitapai</span><span className="demo-open"><span/>Apuestas abiertas</span></div><h2>¿Gana la próxima partida?</h2><div className="demo-pool"><span>Pozo de la comunidad</span><strong>1.000 <small>pts</small></strong></div><div className="demo-split" aria-label="Gana 60%, pierde 40%"><span/><span/></div><div className="demo-outcomes"><div><strong>Gana <span>60%</span></strong><p>600 pts</p></div><div><strong>Pierde <span>40%</span></strong><p>400 pts</p></div></div><p className="demo-note">Navegá para probar cada opción.</p></article>;}
function Content({active}:{active:View}){
 const Heading=document.body.dataset.mode==='preview'?'h1':'h3';
 if(active==='markets')return <><div className="demo-title"><Heading>Mercados</Heading><span>1 abierto</span></div><MarketExample/></>;
 if(active==='history')return <><Heading>Mis apuestas</Heading><div className="demo-stats"><div><span>En juego</span><strong>250 pts</strong></div><div><span>Para cobrar</span><strong>0 pts</strong></div></div><article className="demo-market"><div className="demo-meta"><span>@ramitapai</span><span>En juego</span></div><h2>¿Gana la próxima partida?</h2><p className="demo-position"><Check size={16}/>Tu elección: Gana</p><p>Apuesta: <strong>250 pts</strong></p><p className="demo-note">Esperando el resultado del stream.</p></article></>;
 if(active==='streamer')return <><Heading>Streamer</Heading><article className="demo-market"><div className="demo-meta"><span>Tu canal de ejemplo</span><Radio size={18}/></div><h2>@ramitapai</h2><p>1 predicción abierta</p><div className="demo-channel-row"><span>¿Gana la próxima partida?</span><span className="demo-status">Abierta</span></div></article></>;
 return <><Heading>Canales</Heading><article className="demo-market"><h2>Streamers que seguís</h2>{['ramitapai','demo_streamer'].map(channel=><div key={channel} className="demo-channel-row"><span>@{channel}</span><span className="demo-status">Siguiendo</span></div>)}<p className="demo-note">Canales y datos de ejemplo.</p></article></>;
}
function Preview({variant}:{variant:Variant}){
 const initial=items.find(item=>item.id===location.hash.slice(1))?.id??'markets';
 const [active,setActive]=useState<View>(initial);
 const content=useRef<HTMLDivElement>(null);
 const change=(view:View)=>{setActive(view);content.current?.scrollTo({top:0,behavior:'instant'});if(document.body.dataset.mode==='preview')history.replaceState(null,'',`${location.pathname}${location.search}#${view}`);};
 return <div className={`preview-app preview-${variant}`}>
  {variant==='rim'?<div className="orbit-shell"><BrandAndBalance/><Navbar variant={variant} active={active} onChange={change}/></div>:<><BrandAndBalance/><Navbar variant={variant} active={active} onChange={change}/></>}
  <div ref={content} className="preview-content" role={document.body.dataset.mode==='preview'?'main':'region'} aria-label="Contenido de ejemplo"><Content active={active}/><p className="preview-disclaimer">Vista de ejemplo · Sin transacciones</p></div>
 </div>;
}
function Comparison(){
 const query=new URLSearchParams(location.search),fromQuery=query.get('variant');
 const [choice,setChoice]=useState<Variant|'all'>(isVariant(fromQuery)?fromQuery:'all');
 const [size,setSize]=useState<'fluid'|'360'|'700'>('fluid');
 const choose=(value:Variant|'all')=>{setChoice(value);const next=new URL(location.href);if(value==='all')next.searchParams.delete('variant');else next.searchParams.set('variant',value);history.replaceState(null,'',next);};
 const shown=choice==='all'?variants:variants.filter(variant=>variant.id===choice);
 return <div className="navbar-lab"><header className="lab-header"><a href="/app" aria-label="Volver a Plot"><PlotLogo className="nav-brand"/></a><a className="back-link" href="/app"><ArrowLeft size={16}/>Volver a la app</a></header><main>
  <div className="lab-intro"><h1>Tres formas de navegar Plot.</h1><p>El mismo negro y naranja. Tres estructuras, materiales y movimientos distintos.</p></div>
  <div className="lab-controls"><div className="variant-picker" role="group" aria-label="Comparar opciones"><button aria-pressed={choice==='all'} onClick={()=>choose('all')}>Las tres</button>{variants.map(variant=><button key={variant.id} aria-pressed={choice===variant.id} onClick={()=>choose(variant.id)}>{variant.name}</button>)}</div><div className="size-picker" role="group" aria-label="Ancho de la vista previa">{([['fluid','Adaptable'],['360','360 px'],['700','700 px']] as const).map(([value,label])=><button key={value} aria-pressed={size===value} onClick={()=>setSize(value)}>{label}</button>)}</div></div>
  <div className={`variants-grid ${choice==='all'?'compare-all':'compare-one'}`} data-size={size}>
   {shown.map(variant=><section className={`variant-section variant-${variant.id}`} key={variant.id} aria-labelledby={`title-${variant.id}`}><div className="variant-description"><h2 id={`title-${variant.id}`}>{variant.name}</h2><p>{variant.detail}</p><span>{variant.trait}</span></div><div className="preview-viewport"><Preview variant={variant.id}/></div><div className="variant-footer"><a href={variant.url} target="_blank" rel="noreferrer">Referencia: {variant.reference}<ArrowUpRight size={14}/></a><button onClick={()=>choose(choice===variant.id?'all':variant.id)}>{choice===variant.id?'Comparar las tres':'Ver en grande'}<ArrowUpRight size={14}/></button></div></section>)}
  </div>
  <p className="lab-note">Adaptaciones propias de referencias de 21st.dev. Cambiá de sección, pasá el mouse o probá con el teclado. Los datos son de ejemplo.</p>
 </main></div>;
}
const value=new URLSearchParams(location.search).get('variant');
createRoot(document.getElementById('navbar-root')!).render(document.body.dataset.mode==='preview'?<Preview variant={isVariant(value)?value:'glass'}/>:<Comparison/>);
