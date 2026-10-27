import {createRoot} from 'react-dom/client';
import {Scene} from './scene.js';
import {enableSpotlight} from './components/materials.js';
import {enhanceGlowStage} from '@/components/ui/spotlight-card';

let sceneMounted=false;
function enhance(){
  for(const node of document.querySelectorAll<HTMLElement>('body:has(#predictions),.market-grid'))enhanceGlowStage(node);
  const scene=document.getElementById('plot-scene');if(scene&&!sceneMounted){sceneMounted=true;createRoot(scene).render(<Scene compact={scene.classList.contains('compact')}/>);}
  for(const node of document.querySelectorAll<HTMLElement>('.market-card,.prediction,.watch-row,.managed-market,.position-card,.auth-card'))enableSpotlight(node);
}
enhance();
// React and vanilla views share the same card material, including rows added by polling.
new MutationObserver(enhance).observe(document.body,{childList:true,subtree:true});
