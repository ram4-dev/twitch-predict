import {useEffect,useRef,useState} from 'react';
import {HalftoneWordmark} from '@/components/ui/halftone-wordmark-footer';
import {enhanceGlowCard} from '@/components/ui/spotlight-card';
import {ShaderMount,liquidMetalFragmentShader,ditheringFragmentShader} from '@paper-design/shaders';

// Liquid Metal Button: adapted from johuniq / Joly UI (MIT).
// https://www.jolyui.dev/r/liquid-metal-button
// Current Paper Shaders lifecycle, native button semantics and static fallback are retained here.
function useReducedMotion(){
 const [reduced,setReduced]=useState(()=>typeof matchMedia!=='undefined'&&matchMedia('(prefers-reduced-motion: reduce)').matches);
 useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)');const change=()=>setReduced(media.matches);media.addEventListener('change',change);return()=>media.removeEventListener('change',change);},[]);return reduced;
}
const sizing={u_originX:.5,u_originY:.5,u_worldWidth:0,u_worldHeight:0,u_fit:2,u_scale:1,u_rotation:0,u_offsetX:0,u_offsetY:0};
export type MetalTone='neutral'|'positive'|'negative';
export function LiquidMetalSurface({active,tone='neutral'}:{active:boolean;tone?:MetalTone}){
 const node=useRef<HTMLSpanElement>(null);const reduced=useReducedMotion();
 useEffect(()=>{
  if(!active||reduced||!node.current)return;
  let mount:ShaderMount|undefined;
  const tint=tone==='positive'?[.12,.8,.42,.8]:tone==='negative'?[1,.18,.25,.8]:[.8,.8,.8,.08];
  try{mount=new ShaderMount(node.current,liquidMetalFragmentShader,{...sizing,u_colorBack:[.025,.025,.025,1],u_colorTint:tint,u_repetition:4,u_softness:.5,u_shiftRed:.3,u_shiftBlue:.3,u_distortion:.12,u_contour:0,u_angle:45,u_scale:8,u_shape:0,u_isImage:false},undefined,.6,0,1,60000);}
  catch{node.current.dataset.fallback='true';}
  return()=>mount?.dispose();
 },[active,reduced,tone]);
 return <span ref={node} className="liquid-metal-surface" aria-hidden="true"/>;
}
// Simplex and Swirl selected in Dia use the same Paper Shaders dithering family.
export function DitherField({shape='swirl',paused=false}:{shape?:'swirl'|'simplex';paused?:boolean}){
 const node=useRef<HTMLDivElement>(null);const reduced=useReducedMotion();
 useEffect(()=>{
  if(!node.current)return;let mount:ShaderMount|undefined,visible=true;
  try{mount=new ShaderMount(node.current,ditheringFragmentShader,{...sizing,u_colorBack:[.025,.025,.025,1],u_colorFront:[.16,.16,.16,1],u_shape:shape==='swirl'?6:1,u_type:3,u_pxSize:1.5,u_scale:.75},undefined,reduced||paused?0:.22,1800,1.5,700000);}
  catch{node.current.dataset.fallback='true';}
  const update=()=>mount?.setSpeed(reduced||paused||document.hidden||!visible?0:.22);
  const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;update();});observer.observe(node.current);document.addEventListener('visibilitychange',update);update();
  return()=>{observer.disconnect();document.removeEventListener('visibilitychange',update);mount?.dispose();};
 },[shape,reduced,paused]);
 return <div ref={node} className="plot-dither-field" aria-hidden="true"/>;
}
// Spotlight Card by Hossain Jahed: own implementation of the documented pointer-light behavior.
const spotlightNodes=new WeakSet<HTMLElement>();
export function enableSpotlight(node:HTMLElement){
 if(node.matches('.market-card,.prediction')){enhanceGlowCard(node);return;}
 if(spotlightNodes.has(node))return;spotlightNodes.add(node);node.classList.add('plot-spotlight');
 const follow=(e:PointerEvent)=>{if(e.pointerType==='touch')return;const r=node.getBoundingClientRect();node.style.setProperty('--spot-x',`${e.clientX-r.left}px`);node.style.setProperty('--spot-y',`${e.clientY-r.top}px`);};
 node.addEventListener('pointerenter',follow);node.addEventListener('pointermove',follow);
}
// Shared halftone engine, adapted from the supplied wordmark component.
export function HalftonePlot({replayKey=0,paused=false,label='plot! en puntos'}:{replayKey?:number;paused?:boolean;label?:string}){
 return <HalftoneWordmark wordmark="plot!" className="plot-halftone" label={label} replayKey={replayKey} paused={paused}/>;
}
