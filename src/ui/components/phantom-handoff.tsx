import {ArrowUpRight} from 'lucide-react';
import {PhantomIcon} from '../brand-icons.js';
import {mobileBrowser,onboardingPhantomUrl} from '../lib/phantom-browser.js';
/** Use a direct user-clicked universal link so mobile Safari/Chrome can open Phantom. */
export function PhantomHandoff({className,allowMobile=true,showIcon=false}:{className?:string;allowMobile?:boolean;showIcon?:boolean}){
  const mobile=allowMobile&&mobileBrowser();
  return <a className={className} href={mobile?onboardingPhantomUrl():'https://phantom.com/download'} {...(!mobile?{target:'_blank',rel:'noopener noreferrer'}:{})}><>{showIcon&&<PhantomIcon size={20}/>}<span>{mobile?'Abrir en Phantom':'Instalar Phantom'}</span></><ArrowUpRight size={16}/></a>;
}
