import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {DitherField} from './components/materials.js';

export function Scene({compact=false}:{compact?:boolean}){
  const [paused]=useState(()=>!compact&&sessionStorage.getItem('plot-motion-paused')==='true');
  useEffect(()=>{document.documentElement.dataset.motion=paused?'off':'on';},[paused]);
  return <>{compact?createPortal(<div className="popup-atmosphere" aria-hidden="true"><DitherField paused={paused}/></div>,document.body):<div className="scene-atmosphere"><DitherField paused={paused}/></div>}<div className="plot-image-wordmark"><img src="/brand/plot-wordmark.jpg" alt="Plot!" width={1792} height={1008} decoding="async" draggable={false}/></div></>;
}
