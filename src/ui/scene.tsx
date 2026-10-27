import {useEffect,useState} from 'react';
import {Pause,Play} from 'lucide-react';
import {Button} from './components/button.js';
import {DitherField,HalftonePlot} from './components/materials.js';

export function Scene({compact=false}:{compact?:boolean}){
  const [paused,setPaused]=useState(()=>sessionStorage.getItem('plot-motion-paused')==='true');
  const [reduced,setReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(()=>{document.documentElement.dataset.motion=paused?'off':'on';},[paused]);
  useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)');const change=()=>setReduced(media.matches);media.addEventListener('change',change);return()=>media.removeEventListener('change',change);},[]);
  return <><div className="scene-atmosphere"><DitherField paused={paused}/></div><HalftonePlot paused={paused} label={compact?'plot':'plot, con desenlace abierto'}/><Button variant="outline" size="icon-sm" className="scene-pause" aria-label={paused?'Reanudar animación':'Pausar animación'} aria-pressed={paused} disabled={reduced} onClick={()=>setPaused(value=>{sessionStorage.setItem('plot-motion-paused',String(!value));return !value;})}>{paused?<Play size={14}/>:<Pause size={14}/>}</Button></>;
}
