import {useEffect,useRef} from 'react';

// The orange exclamation is sampled from the same original artwork as the logo.
// One canvas keeps the repeated balloons light, decorative and non-interactive.
export function LatexAtmosphere(){
 const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const root=ref.current,canvas=root?.querySelector('canvas'),ctx=canvas?.getContext('2d');if(!root||!canvas||!ctx)return;
  const media=matchMedia('(prefers-reduced-motion: reduce)');let w=1,h=1,dpr=1,x=0,y=0,tx=0,ty=0,raf=0,last=0,disposed=false,active=false;
  const stop=()=>{cancelAnimationFrame(raf);raf=0;};
  const image=new Image();let loaded=false;
  const paint=()=>{
   ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);ctx.fillStyle='#080808';ctx.fillRect(0,0,w,h);
   if(!loaded)return;
   // Staggered rows cover compact popups and large pages without stretching.
   const cols=Math.max(3,Math.ceil(w/175)),rows=Math.max(4,Math.ceil(h/170));
   root.dataset.balloons=String(cols*rows);
   ctx.globalCompositeOperation='screen';
   for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
    const seed=row*13+col*7,cx=(col+.25+(row%2)*.42)*w/cols,cy=(row+.32)*h/rows;
    const distance=Math.hypot(cx-(x+1)*w/2,cy-(y+1)*h/2);
    const influence=media.matches||!active?0:Math.max(0,1-distance/200);
    const size=75+(seed%5)*15,inflate=1+influence*.12;
    ctx.save();ctx.translate(cx+x*8*influence,cy+y*8*influence);
    ctx.rotate(((seed%7)-3)*.14+influence*x*.08);ctx.scale(inflate+influence*.04,inflate-influence*.025);
    ctx.globalAlpha=.24+(seed%3)*.05+influence*.25;
    // Source rectangle contains only ! (including its dot), never the letters.
    ctx.drawImage(image,1230,268,158,425,-size*158/425/2,-size/2,size*158/425,size);
    ctx.restore();
   }
   ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
  };
  image.onload=()=>{if(disposed)return;loaded=true;paint();root.dataset.ready='true';};
  image.src='/brand/plot-wordmark.jpg';
  const frame=(now:number)=>{raf=0;if(disposed||document.hidden)return;if(now-last<32){raf=requestAnimationFrame(frame);return;}last=now;x+=(tx-x)*.15;y+=(ty-y)*.15;const moving=Math.abs(x-tx)+Math.abs(y-ty)>.001;if(!moving){x=tx;y=ty;}paint();root.dataset.motion=moving?'following':'resting';if(moving)raf=requestAnimationFrame(frame);};
  const wake=()=>{if(!raf&&!disposed&&!document.hidden&&!media.matches)raf=requestAnimationFrame(frame);};
  const layout=()=>{const box=root.getBoundingClientRect();w=Math.max(1,box.width);h=Math.max(1,box.height);dpr=Math.min(devicePixelRatio||1,1.5);canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);paint();root.dataset.motion='resting';root.dataset.reduced=String(media.matches);};
  const move=(event:PointerEvent)=>{if(media.matches||event.pointerType==='touch')return;active=true;tx=Math.max(-1,Math.min(1,event.clientX/w*2-1));ty=Math.max(-1,Math.min(1,event.clientY/h*2-1));wake();};
  const leave=()=>{active=false;tx=ty=0;wake();};
  const reduced=()=>{stop();active=false;x=y=tx=ty=0;paint();root.dataset.motion='resting';root.dataset.reduced=String(media.matches);};
  const visibility=()=>{if(document.hidden)stop();else wake();};
  const ro=new ResizeObserver(layout);ro.observe(root);layout();document.body.addEventListener('pointermove',move,{passive:true});document.body.addEventListener('pointerleave',leave);document.addEventListener('visibilitychange',visibility);media.addEventListener('change',reduced);
  return()=>{disposed=true;image.onload=null;stop();ro.disconnect();document.body.removeEventListener('pointermove',move);document.body.removeEventListener('pointerleave',leave);document.removeEventListener('visibilitychange',visibility);media.removeEventListener('change',reduced);};
 },[]);
 return <div ref={ref} className="plot-latex-field" data-pattern="exclamation-balloons" aria-hidden="true"><canvas/></div>;
}
