import {useEffect,useRef} from 'react';

// Broad specular folds instead of the former dither/particle field. Pointer
// events are observed on the page; the canvas never intercepts a control.
export function LatexAtmosphere(){
 const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const root=ref.current,canvas=root?.querySelector('canvas'),ctx=canvas?.getContext('2d');if(!root||!canvas||!ctx)return;
  const media=matchMedia('(prefers-reduced-motion: reduce)');let w=1,h=1,dpr=1,x=0,y=0,tx=0,ty=0,raf=0,last=0,disposed=false;
  const stop=()=>{cancelAnimationFrame(raf);raf=0;};
  const paint=()=>{
   ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);ctx.fillStyle='#080808';ctx.fillRect(0,0,w,h);
   ctx.save();ctx.translate(x*w*.09,y*h*.065);
   const gradient=ctx.createLinearGradient(0,h*.1,w,h*.8);
   for(const [offset,color]of [[0,'#080808'],[.3,'#12100f'],[.47,'#36251c'],[.50,'#64412c'],[.52,'#a36c47'],[.535,'#38271f'],[.65,'#0c0b0a'],[1,'#080808']] as const)gradient.addColorStop(offset,color);
   ctx.fillStyle=gradient;ctx.beginPath();ctx.moveTo(-w*.25,-h*.15);ctx.bezierCurveTo(w*.9,-h*.1,w*.16,h*.65,w*1.2,h*1.2);ctx.lineTo(w*1.25,h*.38);ctx.bezierCurveTo(w*.42,h*.15,w*.66,-h*.4,-w*.25,-h*.15);ctx.fill();
   const second=ctx.createLinearGradient(0,h*.6,w*.65,h);second.addColorStop(0,'#080808');second.addColorStop(.55,'#191716');second.addColorStop(.65,'#61534a');second.addColorStop(.69,'#24201d');second.addColorStop(1,'#080808');
   ctx.globalAlpha=.45;ctx.fillStyle=second;ctx.beginPath();ctx.moveTo(-w*.3,h*.55);ctx.bezierCurveTo(w*.2,h*.2,w*.45,h*1.2,w*1.2,h*.9);ctx.lineTo(w*1.1,h*1.2);ctx.bezierCurveTo(w*.2,h*1.3,w*.1,h*.8,-w*.3,h*.9);ctx.closePath();ctx.fill();ctx.restore();
  };
  const frame=(now:number)=>{raf=0;if(disposed||document.hidden)return;if(now-last<32){raf=requestAnimationFrame(frame);return;}last=now;x+=(tx-x)*.15;y+=(ty-y)*.15;const moving=Math.abs(x-tx)+Math.abs(y-ty)>.001;if(!moving){x=tx;y=ty;}paint();root.dataset.motion=moving?'following':'resting';if(moving)raf=requestAnimationFrame(frame);};
  const wake=()=>{if(!raf&&!disposed&&!document.hidden&&!media.matches)raf=requestAnimationFrame(frame);};
  const layout=()=>{const box=root.getBoundingClientRect();w=Math.max(1,box.width);h=Math.max(1,box.height);dpr=Math.min(devicePixelRatio||1,1.5);canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);paint();root.dataset.motion='resting';root.dataset.reduced=String(media.matches);};
  const move=(event:PointerEvent)=>{if(media.matches||event.pointerType==='touch')return;tx=Math.max(-1,Math.min(1,event.clientX/w*2-1));ty=Math.max(-1,Math.min(1,event.clientY/h*2-1));wake();};
  const leave=()=>{tx=ty=0;wake();};
  const reduced=()=>{stop();x=y=tx=ty=0;paint();root.dataset.motion='resting';root.dataset.reduced=String(media.matches);};
  const visibility=()=>{if(document.hidden)stop();else wake();};
  const ro=new ResizeObserver(layout);ro.observe(root);layout();document.body.addEventListener('pointermove',move,{passive:true});document.body.addEventListener('pointerleave',leave);document.addEventListener('visibilitychange',visibility);media.addEventListener('change',reduced);
  return()=>{disposed=true;stop();ro.disconnect();document.body.removeEventListener('pointermove',move);document.body.removeEventListener('pointerleave',leave);document.removeEventListener('visibilitychange',visibility);media.removeEventListener('change',reduced);};
 },[]);
 return <div ref={ref} className="plot-latex-field" aria-hidden="true"><canvas/></div>;
}
