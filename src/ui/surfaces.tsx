import {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Pause,Play} from 'lucide-react';
import {Button} from './components/button.js';
import {DitherField,HalftonePlot,enableSpotlight} from './components/materials.js';

function Scene({compact=false}:{compact?:boolean}){
  const [paused,setPaused]=useState(()=>sessionStorage.getItem('plot-motion-paused')==='true');
  const [reduced,setReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)');const change=()=>setReduced(media.matches);media.addEventListener('change',change);return()=>media.removeEventListener('change',change);},[]);
  return <><div className="scene-atmosphere"><DitherField paused={paused}/></div><HalftonePlot paused={paused} label={compact?'plot':'plot en puntos, con desenlace abierto'}/><Button variant="outline" size="icon-sm" className="scene-pause" aria-label={paused?'Reanudar animación':'Pausar animación'} aria-pressed={paused} disabled={reduced} onClick={()=>setPaused(value=>{sessionStorage.setItem('plot-motion-paused',String(!value));return !value;})}>{paused?<Play size={14}/>:<Pause size={14}/>}</Button></>;
}
let sceneMounted=false;
function enhance(){
  const scene=document.getElementById('plot-scene');if(scene&&!sceneMounted){sceneMounted=true;createRoot(scene).render(<Scene compact={scene.classList.contains('compact')}/>);}
  for(const node of document.querySelectorAll<HTMLElement>('.market-card,.prediction,.watch-row,.managed-market,.position-card,.auth-card'))enableSpotlight(node);
}
enhance();
// React and vanilla views share the same card material, including rows added by polling.
new MutationObserver(enhance).observe(document.body,{childList:true,subtree:true});
