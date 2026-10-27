import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {BalloonWordmark} from './components/balloon-wordmark.js';
import {DitherField} from './components/materials.js';

export function Scene({compact=false}:{compact?:boolean}){
  const [paused]=useState(()=>!compact&&sessionStorage.getItem('plot-motion-paused')==='true');
  useEffect(()=>{document.documentElement.dataset.motion=paused?'off':'on';},[paused]);
  return <>{compact?createPortal(<div className="popup-atmosphere" aria-hidden="true"><DitherField paused={paused}/></div>,document.body):<div className="scene-atmosphere"><DitherField paused={paused}/></div>}<BalloonWordmark paused={paused}/></>;
}
