import {useEffect,useRef,useState} from 'react';

// Stable across market refreshes: replay only when the verified amount changes.
export function CountingAmount({value,fractionDigits=0,signed=true,locale='es-AR'}:{value:number;fractionDigits?:number;signed?:boolean;locale?:string}){
 const ref=useRef<HTMLSpanElement>(null),[display,setDisplay]=useState({value:0,complete:false});
 useEffect(()=>{
  const media=matchMedia('(prefers-reduced-motion: reduce)');let raf=0;
  const finish=()=>{cancelAnimationFrame(raf);setDisplay({value,complete:true});};
  if(media.matches||ref.current?.closest('[data-motion="off"]')){finish();return;}
  const start=performance.now();setDisplay({value:0,complete:false});
  const tick=(now:number)=>{const progress=Math.min(1,(now-start)/1150);setDisplay({value:progress===1?value:value*(1-Math.pow(1-progress,4)),complete:progress===1});if(progress<1)raf=requestAnimationFrame(tick);};
  const change=()=>{if(media.matches)finish();};media.addEventListener('change',change);raf=requestAnimationFrame(tick);
  return()=>{cancelAnimationFrame(raf);media.removeEventListener('change',change);};
 },[value]);
 const scale=10**fractionDigits,shown=display.complete?Math.abs(value):Math.floor(Math.abs(display.value)*scale)/scale;
 const formatted=new Intl.NumberFormat(locale,{maximumFractionDigits:fractionDigits,minimumFractionDigits:fractionDigits}).format(shown);
 return <span ref={ref} className="resolution-count" data-complete={display.complete} aria-hidden="true">{signed?(value>0?'+':value<0?'−':''):''}{formatted}</span>;
}
