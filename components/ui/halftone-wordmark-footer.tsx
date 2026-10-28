'use client';

// Adapted from the Halftone Wordmark Footer supplied for Plot.
// Shared canvas keeps the footer and compact wordmark on the same renderer.
import * as React from 'react';

export interface HalftonePalette {background:string;ink:string;warm:string}
export type HalftonePreset='night'|'paper'|'ember'|'cobalt';
export interface FooterLink {label:string;href?:string}
export interface FooterColumn {title:string;links:FooterLink[]}
export interface HalftoneWordmarkFooterProps {
 wordmark?:string;label?:string;meta?:string;columns?:FooterColumn[];backToTop?:boolean;
 preset?:HalftonePreset;palette?:Partial<HalftonePalette>;dotGap?:number;radius?:number;
 crop?:number;grain?:number;interactive?:boolean;fontFamily?:string;fontWeight?:number;
 monoFamily?:string;height?:string;className?:string;
}
const PRESETS:Record<HalftonePreset,HalftonePalette>={
 night:{background:'#080808',ink:'#f2f2f2',warm:'#ff7049'},
 paper:{background:'#efebe3',ink:'#17150f',warm:'#c2361c'},
 ember:{background:'#160a06',ink:'#f2c48c',warm:'#ff5a1f'},
 cobalt:{background:'#0d1b4d',ink:'#dfe7ff',warm:'#ffcd3c'},
};
export function hwfHex(hex:string){
 const match=/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((hex||'').trim());if(!match)return null;
 const h=match[1].length===3?match[1].split('').map(c=>c+c).join(''):match[1];
 return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];
}
export function hwfRadius(coverage:number,gap:number){return Math.sqrt(Math.max(0,Math.min(1,coverage)))*gap*.56;}
export function hwfStep(x:number,y:number,vx:number,vy:number,hx:number,hy:number,px:number,py:number,r:number,dt=1){
 const dx=x-px,dy=y-py,d2=dx*dx+dy*dy;
 if(r>0&&d2<r*r){const d=Math.sqrt(d2)+.001,f=(1-d/r)*2.6;vx+=dx/d*f*dt;vy+=dy/d*f*dt;}
 const drag=Math.pow(.84,dt);vx=(vx+(hx-x)*.05*dt)*drag;vy=(vy+(hy-y)*.05*dt)*drag;
 return [x+vx*dt,y+vy*dt,vx,vy];
}
export function hwfWarmth(x:number,y:number,hx:number,hy:number,span:number){return span>0?Math.min(1,Math.hypot(x-hx,y-hy)/span):0;}
export function hwfFitSize(measured:number,width:number){return measured>0?width/measured*100:0;}

export interface HalftoneWordmarkProps {
 wordmark?:string;label?:string;className?:string;ink?:string;warm?:string;
 fontFamily?:string;fontWeight?:number;dotGap?:number;radius?:number;
 crop?:number;grain?:number;interactive?:boolean;paused?:boolean;replayKey?:number;
 placement?:'center'|'bottom';assemble?:boolean;accentLast?:boolean;
}
/** Transparent canvas for the app header and MV3 popup, without footer navigation. */
export function HalftoneWordmark({wordmark='Plot!',label=wordmark,className='',ink='#f2f2f2',warm='#ff7049',fontFamily='Fraunces',fontWeight=800,dotGap=2,radius=28,crop=0,grain=0,interactive=true,paused=false,replayKey=0,placement='center',assemble=true,accentLast=true}:HalftoneWordmarkProps){
 const ref=React.useRef<HTMLCanvasElement>(null);
 const [reduced,setReduced]=React.useState(()=>typeof matchMedia!=='undefined'&&matchMedia('(prefers-reduced-motion: reduce)').matches);
 React.useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)'),change=()=>setReduced(media.matches);media.addEventListener('change',change);return()=>media.removeEventListener('change',change);},[]);
 React.useEffect(()=>{
  const canvas=ref.current,ctx=canvas?.getContext('2d');if(!canvas||!ctx)return;
  const still=reduced||paused,base=hwfHex(ink)??[242,242,242],hot=hwfHex(warm)??[255,112,73];
  let width=0,height=0,dpr=1,raf=0,last=0,visible=true,disposed=false,ready=false,ring={x:0,y:0,t:-Infinity};
  // x, y, vx, vy, homeX, homeY, radius, accent
  let dots=new Float32Array(0),grainPattern:CanvasPattern|null=null;
  const pointer={x:-1e5,y:-1e5};
  const wake=()=>{if(!raf&&!disposed&&visible&&!document.hidden)raf=requestAnimationFrame(draw);};
  const layout=()=>{
   const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;
   width=rect.width;height=rect.height;dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
   const mask=document.createElement('canvas');mask.width=Math.ceil(width);mask.height=Math.ceil(height);const m=mask.getContext('2d',{willReadFrequently:true});if(!m)return;
   m.font=`${fontWeight} 100px ${fontFamily}`;
   const fit=hwfFitSize(m.measureText(wordmark||' ').width,width*(placement==='bottom'?1.02:.92));
   const size=placement==='bottom'?fit:Math.min(height*.98,fit);m.font=`${fontWeight} ${size}px ${fontFamily}`;
   const box=m.measureText(wordmark),ascent=box.actualBoundingBoxAscent||size*.72,descent=box.actualBoundingBoxDescent||0;
   const x=(width-box.width)/2,baseline=placement==='bottom'?height+ascent*Math.max(0,Math.min(.6,crop)):(height+ascent-descent)/2;
   m.fillText(wordmark,x,baseline);const pixels=m.getImageData(0,0,mask.width,mask.height).data;
   // A second coverage mask identifies the punctuation without guessing glyph widths.
   m.clearRect(0,0,mask.width,mask.height);
   if(accentLast&&wordmark){const advance=m.measureText(wordmark).width-m.measureText(wordmark.slice(-1)).width;m.fillText(wordmark.slice(-1),x+advance,baseline);}
   const accent=m.getImageData(0,0,mask.width,mask.height).data,gap=Math.max(1.6,dotGap,width/400),values:number[]=[];
   for(let gy=0;gy<height;gy+=gap)for(let gx=0;gx<width;gx+=gap){
    let alpha=0,tint=0;
    for(let sy=0;sy<3;sy++)for(let sx=0;sx<3;sx++){const px=Math.min(mask.width-1,Math.floor(gx+(sx+.5)*gap/3)),py=Math.min(mask.height-1,Math.floor(gy+(sy+.5)*gap/3)),index=(py*mask.width+px)*4+3;alpha+=pixels[index];tint+=accent[index];}
    const coverage=alpha/(9*255);if(coverage<.06)continue;
    const hx=gx+gap/2,hy=gy+gap/2,i=values.length/8,seed=Math.sin(i*127.1+replayKey*7.7);
    values.push(hx+(still||!assemble?0:seed*width*.28),hy+(still||!assemble?0:Math.cos(i*91.7)*height*.45),0,0,hx,hy,hwfRadius(coverage,gap),tint>0?1:0);
   }
   dots=new Float32Array(values);ring.t=-Infinity;last=0;
   grainPattern=null;
   if(grain>0){const tile=document.createElement('canvas');tile.width=tile.height=128;const g=tile.getContext('2d');if(g){const data=g.createImageData(128,128);for(let i=0;i<data.data.length;i+=4){const shade=Math.random()*255;data.data[i]=data.data[i+1]=data.data[i+2]=shade;data.data[i+3]=28;}g.putImageData(data,0,0);grainPattern=ctx.createPattern(tile,'repeat');}}
   canvas.dataset.particles=String(dots.length/8);canvas.dataset.animationState=still||!assemble?'settled':'assembling';wake();
  };
  function draw(now:number){
   raf=0;if(disposed||!visible||document.hidden)return;
   const dt=Math.max(.25,Math.min(2,last?(now-last)/(1000/60):1));last=now;
   ctx!.setTransform(dpr,0,0,dpr,0,0);ctx!.clearRect(0,0,width,height);
   const age=now-ring.t,ringActive=!still&&interactive&&age<900,r=!still&&interactive?Math.max(0,radius):0;let moving=false;
   for(let j=0;j<dots.length;j+=8){
    let x=dots[j],y=dots[j+1],vx=dots[j+2],vy=dots[j+3];const hx=dots[j+4],hy=dots[j+5];
    if(!still){
     if(ringActive){const dx=hx-ring.x,dy=hy-ring.y,d=Math.hypot(dx,dy)+.001,band=1-Math.min(1,Math.abs(d-age*.9)/26),force=band*3.2*(1-age/900)*dt;vx+=dx/d*force;vy+=dy/d*force;}
     [x,y,vx,vy]=hwfStep(x,y,vx,vy,hx,hy,pointer.x,pointer.y,r,dt);
     const pushed=r>0&&Math.hypot(x-pointer.x,y-pointer.y)<r,velocity=Math.abs(vx)+Math.abs(vy),distance=Math.abs(x-hx)+Math.abs(y-hy);
     if(velocity>.02||(!pushed&&distance>.05))moving=true;
     else if(!pushed){x=hx;y=hy;vx=vy=0;}
     dots[j]=x;dots[j+1]=y;dots[j+2]=vx;dots[j+3]=vy;
    }
    const k=dots[j+7]?1:hwfWarmth(x,y,hx,hy,28);
    ctx!.fillStyle=k>.02?`rgb(${Math.round(base[0]+(hot[0]-base[0])*k)},${Math.round(base[1]+(hot[1]-base[1])*k)},${Math.round(base[2]+(hot[2]-base[2])*k)})`:ink;
    ctx!.beginPath();ctx!.arc(x,y,dots[j+6],0,Math.PI*2);ctx!.fill();
   }
   if(grainPattern&&grain>0){ctx!.globalAlpha=Math.min(1,grain)*.09;ctx!.fillStyle=grainPattern;ctx!.fillRect(0,0,width,height);ctx!.globalAlpha=1;}
   canvas!.dataset.animationState=moving||ringActive?'assembling':'settled';
   if(!still&&(moving||ringActive))wake();
  }
  const local=(e:PointerEvent)=>{const b=canvas.getBoundingClientRect();return {x:e.clientX-b.left,y:e.clientY-b.top};};
  const move=(e:PointerEvent)=>{if(still||!interactive||e.pointerType==='touch')return;Object.assign(pointer,local(e));wake();};
  const leave=()=>{pointer.x=pointer.y=-1e5;wake();};
  const down=(e:PointerEvent)=>{if(still||!interactive)return;ring={...local(e),t:performance.now()};wake();};
  const visibility=()=>{cancelAnimationFrame(raf);raf=0;last=0;if(!document.hidden)wake();};
  const resize=new ResizeObserver(layout),intersection=new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting??true;cancelAnimationFrame(raf);raf=0;last=0;if(visible)wake();});
  void document.fonts.ready.then(()=>{if(disposed)return;ready=true;layout();resize.observe(canvas);intersection.observe(canvas);});
  canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerleave',leave);canvas.addEventListener('pointerdown',down);document.addEventListener('visibilitychange',visibility);
  return()=>{disposed=true;cancelAnimationFrame(raf);if(ready){resize.disconnect();intersection.disconnect();}canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerleave',leave);canvas.removeEventListener('pointerdown',down);document.removeEventListener('visibilitychange',visibility);};
 },[wordmark,ink,warm,fontFamily,fontWeight,dotGap,radius,crop,grain,interactive,paused,replayKey,placement,assemble,accentLast,reduced]);
 return <canvas ref={ref} className={className} role="img" aria-label={label}/>;
}

/** Original footer composition, available for pages that need navigation above the wordmark. */
export default function HalftoneWordmarkFooter({wordmark='Plot!',label='Plot',meta='El stream en juego',columns=[],backToTop=true,preset='night',palette,dotGap=6,radius=80,crop=.2,grain=.5,interactive=true,fontFamily='Fraunces, Georgia, serif',fontWeight=800,monoFamily='Inter, system-ui, sans-serif',height='560px',className=''}:HalftoneWordmarkFooterProps){
 const colors={...PRESETS[preset],...palette};
 return <footer className={`hwf-root ${className}`} style={{height,background:colors.background,color:colors.ink,fontFamily:monoFamily}}>
  <HalftoneWordmark wordmark={wordmark} label={wordmark} className="hwf-canvas" ink={colors.ink} warm={colors.warm} fontFamily={fontFamily} fontWeight={fontWeight} dotGap={dotGap} radius={radius} crop={crop} grain={grain} interactive={interactive} placement="bottom" assemble={false} accentLast={false}/>
  <div className="hwf-top"><div><strong>{label}</strong><p>{meta}</p></div>{columns.map(col=><nav key={col.title} aria-label={col.title}><h3>{col.title}</h3><ul>{col.links.map(link=><li key={link.label}>{link.href?<a href={link.href}>{link.label}</a>:<span>{link.label}</span>}</li>)}</ul></nav>)}</div>
  {backToTop&&<div className="hwf-rule"><button type="button" onClick={()=>window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'})}>Volver arriba ↑</button></div>}
 </footer>;
}
