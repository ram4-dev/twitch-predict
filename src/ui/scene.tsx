import {createPortal} from 'react-dom';
import {BalloonWordmark} from './components/balloon-wordmark.js';
import {LatexAtmosphere} from './components/latex-atmosphere.js';

export function Scene({compact=false}:{compact?:boolean}){
 return <>{createPortal(<div className="popup-atmosphere" aria-hidden="true"><LatexAtmosphere/></div>,document.body)}<BalloonWordmark key={compact?'compact':'full'}/></>;
}
