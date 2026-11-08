import {createPortal} from 'react-dom';
import {LatexAtmosphere} from './components/latex-atmosphere.js';
import {BalloonWordmark} from './components/balloon-wordmark.js';

export function Scene({compact=false}:{compact?:boolean}){
 return <>{compact&&createPortal(<div className="popup-atmosphere" aria-hidden="true"><LatexAtmosphere/></div>,document.body)}<BalloonWordmark key={compact?'compact':'full'}/></>;
}
