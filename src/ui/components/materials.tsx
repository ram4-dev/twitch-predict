import {useEffect,useRef,useState} from 'react';
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
 if(spotlightNodes.has(node))return;spotlightNodes.add(node);node.classList.add('plot-spotlight');
 const follow=(e:PointerEvent)=>{if(e.pointerType==='touch')return;const r=node.getBoundingClientRect();node.style.setProperty('--spot-x',`${e.clientX-r.left}px`);node.style.setProperty('--spot-y',`${e.clientY-r.top}px`);};
 node.addEventListener('pointerenter',follow);node.addEventListener('pointermove',follow);
}
// Own canvas treatment informed by Halftone Wordmark Footer and Murmuration Wordmark.
// It preserves Fraunces and the open-outcome o; no third-party particle source is copied.
export function HalftonePlot({replayKey=0,paused=false,label='plot en puntos, con desenlace abierto'}:{replayKey?:number;paused?:boolean;label?:string}){
 const canvas=useRef<HTMLCanvasElement>(null);const reducedMotion=useReducedMotion();const reduced=reducedMotion||paused;
 useEffect(()=>{
  const el=canvas.current;if(!el)return;const ctx=el.getContext('2d');if(!ctx)return;
  type Dot={x:number;y:number;tx:number;ty:number;vx:number;vy:number};
  let stopped=false,raf=0,last=0,width=0,height=0,dots:Dot[]=[],dotX=0,dotY=0,dotRadius=3,visible=true;
  const pointer={x:-1000,y:-1000};
  let ink='#f4f4f4';
  const schedule=()=>{if(!raf&&!stopped&&visible&&!document.hidden)raf=requestAnimationFrame(draw);};
  const layout=()=>{
   const rect=el.getBoundingClientRect();if(!rect.width||!rect.height)return;
   width=rect.width;height=rect.height;const ratio=Math.min(devicePixelRatio||1,2);
   el.width=Math.round(width*ratio);el.height=Math.round(height*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);
   ink=getComputedStyle(el).color;
   const mask=document.createElement('canvas');mask.width=Math.ceil(width);mask.height=Math.ceil(height);const c=mask.getContext('2d')!;
   let font=height*.92;c.font=`800 ${font}px Fraunces`;
   const initial=c.measureText('pl').width+font*.5+c.measureText('t').width;
   font*=Math.min(1,width*.82/initial);c.font=`800 ${font}px Fraunces`;
   const metrics=c.measureText('plot');
   const pl=c.measureText('pl').width,o=font*.5,t=c.measureText('t').width,x=(width-pl-o-t)/2,baseline=(height+metrics.actualBoundingBoxAscent-metrics.actualBoundingBoxDescent)/2;
   c.fillText('pl',x,baseline);c.lineWidth=font*.09;c.beginPath();c.arc(x+pl+o*.5,baseline-o*.45,o*.37,.12,Math.PI*1.88);c.stroke();c.fillText('t',x+pl+o,baseline);
   dotX=x+pl+o*.88;dotY=baseline-o*.62;dotRadius=Math.max(2.4,font*.046);
   const data=c.getImageData(0,0,mask.width,mask.height).data,step=Math.max(2.6,width/250);dots=[];
   for(let y=1;y<height;y+=step)for(let x=1;x<width;x+=step)if(data[(Math.floor(y)*mask.width+Math.floor(x))*4+3]>130){const i=dots.length,seed=Math.sin(i*127.1+replayKey*7.7);dots.push({x:reduced?x:x+seed*width*.38,y:reduced?y:y+Math.cos(i*91.7)*height*.6,tx:x,ty:y,vx:0,vy:0});}
   el.dataset.animationState=reduced?'settled':'assembling';el.dataset.particles=String(dots.length);last=0;draw(performance.now());
  };
  function draw(time:number){
   raf=0;if(stopped)return;const dt=Math.min(last?(time-last)/1000:1/60,.032);last=time;let energy=0;
   ctx!.clearRect(0,0,width,height);ctx!.fillStyle=ink;
   for(const d of dots){
    if(!reduced){let ax=(d.tx-d.x)*130-d.vx*21,ay=(d.ty-d.y)*130-d.vy*21;const dx=d.x-pointer.x,dy=d.y-pointer.y,dist=Math.hypot(dx,dy);if(dist<65&&dist>1){const force=(65-dist)*24;ax+=dx/dist*force;ay+=dy/dist*force;}d.vx+=ax*dt;d.vy+=ay*dt;d.x+=d.vx*dt;d.y+=d.vy*dt;energy+=Math.abs(d.vx)+Math.abs(d.vy)+Math.abs(d.tx-d.x)+Math.abs(d.ty-d.y);}
    ctx!.beginPath();ctx!.arc(d.x,d.y,Math.max(.85,width/620),0,Math.PI*2);ctx!.fill();
   }
   ctx!.fillStyle='#ff7049';ctx!.beginPath();ctx!.arc(dotX,dotY,dotRadius,0,Math.PI*2);ctx!.fill();
   const moving=!reduced&&energy>dots.length*.04;el!.dataset.animationState=moving?'assembling':'settled';if(moving)schedule();
  }
  const move=(e:PointerEvent)=>{if(reduced)return;const r=el.getBoundingClientRect();pointer.x=e.clientX-r.left;pointer.y=e.clientY-r.top;schedule();};
  const leave=()=>{pointer.x=-1000;pointer.y=-1000;schedule();};const visibility=()=>{if(document.hidden){cancelAnimationFrame(raf);raf=0;}else{last=0;schedule();}};
  const resize=new ResizeObserver(layout),intersection=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible){last=0;schedule();}else{cancelAnimationFrame(raf);raf=0;}});
  let ready=false;void document.fonts.ready.then(()=>{if(stopped)return;ready=true;layout();resize.observe(el);intersection.observe(el);});
  el.addEventListener('pointermove',move);el.addEventListener('pointerleave',leave);document.addEventListener('visibilitychange',visibility);
  return()=>{stopped=true;cancelAnimationFrame(raf);if(ready){resize.disconnect();intersection.disconnect();}el.removeEventListener('pointermove',move);el.removeEventListener('pointerleave',leave);document.removeEventListener('visibilitychange',visibility);};
 },[reduced,replayKey]);
 return <canvas ref={canvas} className="plot-halftone" role="img" aria-label={label}/>;
}
