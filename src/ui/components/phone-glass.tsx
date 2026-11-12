import type {ComponentProps} from 'react';
import {LiquidGlass} from '../vendor/opaline/liquid-glass.js';

/** Shared surface for active markets, proposals and the app's other panels. */
export function PhoneGlass({className='',...props}:ComponentProps<typeof LiquidGlass>){
 return <LiquidGlass {...props} refraction={0} blur={8} tint="var(--surface)" shadow={false} className={`phone-glass ${className}`}/>;
}
