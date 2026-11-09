import {ArrowUpRight} from 'lucide-react';
import {mobileBrowser,onboardingPhantomUrl} from '../lib/phantom-browser.js';
/** Use a direct user-clicked universal link so mobile Safari/Chrome can open Phantom. */
export function PhantomHandoff({className,allowMobile=true}:{className?:string;allowMobile?:boolean}){
  const mobile=allowMobile&&mobileBrowser();
  return <a className={className} href={mobile?onboardingPhantomUrl():'https://phantom.com/download'} {...(!mobile?{target:'_blank',rel:'noopener noreferrer'}:{})}>{mobile?'Abrir en Phantom':'Instalar Phantom'}<ArrowUpRight size={16}/></a>;
}
