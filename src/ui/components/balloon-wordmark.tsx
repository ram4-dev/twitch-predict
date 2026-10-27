import {useEffect,useRef,useState} from 'react';
import {animateBalloonWordmark} from './balloon-renderer.js';

export function BalloonWordmark({paused=false}:{paused?:boolean}){
 const root=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null),[ready,setReady]=useState(false);
 useEffect(()=>{
  if(!root.current||!canvas.current)return;
  setReady(false);
  return animateBalloonWordmark(root.current,canvas.current,paused,setReady);
 },[paused]);
 return <div ref={root} className="plot-image-wordmark plot-balloon-wordmark" role="img" aria-label="Plot!" data-renderer={ready?'balloon':'image'}>
  <img src="/brand/plot-wordmark.jpg" alt="" width={1792} height={1008} decoding="async" draggable={false}/>
  <canvas ref={canvas} aria-hidden="true"/>
 </div>;
}
