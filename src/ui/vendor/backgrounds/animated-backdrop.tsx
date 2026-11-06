// 21st.dev references: Kokonut Beams, Bundui Floating Paths, Magic UI Particles, Corsair Animated Border.
// SVG/CSS interpretations in Ember's palette; curve geometry adapted from Bundui (MIT).
// Sources and licenses in SOURCES.md. No raster textures or canvas scaling.
// A subtle CSS blur is applied only to the decorative background layer.
import {useId,type CSSProperties} from 'react';
export const backdropOptions=[
 {id:'beams',name:'Ember Beams',description:'Haces ámbar lentos sobre negro. Sigue los reflejos de los botones.',source:'https://21st.dev/@kokonutd/components/beams-background'},
 {id:'silk',name:'Ember Silk',description:'Pocas líneas naranjas, curvas y fluidas, como un reflejo sobre vidrio.',source:'https://21st.dev/@bundui/components/floating-paths'},
 {id:'sparks',name:'Ember P&L',description:'Números positivos verdes y negativos rojos que flotan por los laterales.',source:'https://21st.dev/@dillionverma/components/particles'},
 {id:'rim',name:'Ember Rim',description:'Reflejos finos en los bordes. La opción más discreta.',source:'https://21st.dev/@kevingirelli/components/animated-border'},
] as const;
export type Backdrop=typeof backdropOptions[number]['id'];
export const isBackdrop=(value:string|null):value is Backdrop=>backdropOptions.some(option=>option.id===value);
export function AnimatedBackdrop({variant}:{variant:Backdrop}){
 const id=useId().replaceAll(':','');
 return <div className={`animated-backdrop backdrop-${variant}`} data-background={variant} aria-hidden="true">
 {variant==='sparks'&&Array.from({length:18},(_,i)=>{const positive=i%2===0;return <span key={i} className="ember-change" data-change={positive?'positive':'negative'} style={{left:`${i%2===0?3+(i*7%12):84+(i*3%9)}%`,'--rest-y':`${10+(i*17%85)}%`,animationDelay:`-${i*.85}s`,animationDuration:`${8+i%5}s`} as CSSProperties}>{positive?'+':'−'}{[10,25,50,100,15,75][i%6]}</span>;})}
 {variant!=='sparks'&&<svg width="100%" height="100%" viewBox="0 0 700 900" preserveAspectRatio={variant==='rim'?'none':'xMidYMid slice'} fill="none">
 <defs><linearGradient id={`${id}-light`} x1="0%" y1="0%" x2="0%" y2="100%"><stop stopColor="#ffb18b" stopOpacity="0"/><stop offset=".4" stopColor="#ff9c78" stopOpacity=".6"/><stop offset=".65" stopColor="#ff783c" stopOpacity=".25"/><stop offset="1" stopColor="#ff783c" stopOpacity="0"/></linearGradient><linearGradient id={`${id}-beam`}><stop stopColor="#ff8c50" stopOpacity="0"/><stop offset=".5" stopColor="#ff9c78" stopOpacity=".16"/><stop offset="1" stopColor="#ff8c50" stopOpacity="0"/></linearGradient></defs>
 {variant==='beams'&&<g className="ember-beams">{[0,1,2,3].map(i=><g key={i} className="ember-beam" style={{animationDelay:`-${i*5}s`}}><path d={`M${-280+i*220} -100L${340+i*220} 1000`} stroke={`url(#${id}-beam)`} strokeWidth={45+i*12}/><path d={`M${-280+i*220} -100L${340+i*220} 1000`} stroke={`url(#${id}-light)`} strokeWidth=".65" opacity=".28"/></g>)}</g>}
 {variant==='silk'&&<g className="ember-silk">{Array.from({length:9},(_,i)=><path key={i} className="ember-thread" d={`M-${380-i*14} -${189+i*10}C-${380-i*14} -${189+i*10} -${312-i*14} ${216-i*10} ${152-i*14} ${343-i*10}C${616-i*14} ${470-i*10} ${684-i*14} ${875-i*10} ${684-i*14} ${875-i*10}`} stroke={`url(#${id}-light)`} strokeWidth={.8+i*.1} pathLength="1" style={{animationDelay:`-${i*2}s`}}/>)}</g>}

 {variant==='rim'&&<>{[0,1,2].map(i=><g key={i}><path d={`M${-10+i*14} -60 Q${95+i*12} 380 ${8+i*12} 960 M${710-i*14} -60 Q${605-i*12} 520 ${692-i*12} 960`} stroke="#ff9c78" strokeWidth=".6" opacity=".18"/><path className="ember-rim-trace" d={`M${-10+i*14} -60 Q${95+i*12} 380 ${8+i*12} 960 M${710-i*14} -60 Q${605-i*12} 520 ${692-i*12} 960`} stroke={`url(#${id}-light)`} strokeWidth="1.3" pathLength="1" style={{animationDelay:`-${i*6}s`}}/></g>)}</>}
 </svg>}
 </div>;
}
