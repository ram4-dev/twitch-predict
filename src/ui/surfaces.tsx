import {createRoot} from 'react-dom/client';
import {Scene} from './scene.js';
import {enableSpotlight} from './components/materials.js';
import {enhanceGlowCard,enhanceGlowStage,enhancePointerGlow} from '@/components/ui/spotlight-card';

let sceneMounted=false;
function enhance(){
  for(const node of document.querySelectorAll<HTMLElement>('body:has(#markets) :is(.market-card,.console-stat,.console-empty,.plot-empty,.position-card,.managed-market,.watch-row,.login-panel,.streamer-channels,.operator)')){node.classList.add('plot-translucent-panel');enhanceGlowCard(node);}
  for(const node of document.querySelectorAll<HTMLElement>('body:has(#predictions),.market-grid'))enhanceGlowStage(node);
  for(const node of document.querySelectorAll<HTMLElement>('body:has(#predictions) .empty'))enhanceGlowCard(node);
  const scene=document.getElementById('plot-scene');if(scene&&!sceneMounted){sceneMounted=true;createRoot(scene).render(<Scene compact={scene.classList.contains('compact')}/>);}
  for(const node of document.querySelectorAll<HTMLElement>('.market-card,.prediction,.watch-row,.managed-market,.position-card,.auth-card'))enableSpotlight(node);
}
enhance();
if(document.getElementById('markets'))enhancePointerGlow(document.body);
// React and vanilla views share the same card material, including rows added by polling.
new MutationObserver(enhance).observe(document.body,{childList:true,subtree:true});
