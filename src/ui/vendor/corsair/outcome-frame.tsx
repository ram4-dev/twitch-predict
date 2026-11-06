// Adapted from KevinGirelli/corsair-ui Animated Border (MIT; see LICENSE).
// https://21st.dev/@kevingirelli/components/animated-border
// Local adaptation: masked 1px rim, opaque fill, hover-only movement and React 18.
import type {HTMLAttributes} from 'react';

export function OutcomeFrame({children,className='',...props}:HTMLAttributes<HTMLDivElement>){
 return <div {...props} className={`detail-side ${className}`}>
  <span className="outcome-frame-rim" aria-hidden="true"/>
  <div className="detail-side-content">{children}</div>
 </div>;
}
