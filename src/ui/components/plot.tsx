import {plotBrand} from '../../brand.js';
import {type ComponentProps,type ReactNode,useId} from 'react';
import {CheckCircle2,AlertCircle,Info} from 'lucide-react';
import {cn} from '../lib/utils.js';

export function PlotLogo({className,size='default'}: {className?:string;size?:'default'|'compact'}) {
  return <span className={cn('plot-logo',className)} data-size={size}><img src={plotBrand.logo} alt={plotBrand.label} width={plotBrand.width} height={plotBrand.height}/></span>;
}
export function PlotBrandLink({className,logoClassName,href='/',...props}:ComponentProps<'a'>&{logoClassName?:string}){
  return <a aria-label="Plot, inicio" {...props} href={href} className={cn('plot-brand-link',className)}><PlotLogo className={logoClassName}/></a>;
}
export function PlotMascot({mood='watch',className}: {mood?:'doubt'|'watch'|'reaction';className?:string}) {
  return <span className={cn('plot-mascot',`mood-${mood}`,className)} role="img" aria-label={{doubt:'Mascota de Plot esperando',watch:'Mascota de Plot observando',reaction:'Mascota de Plot festejando'}[mood]}/>;
}
export function Field({label,hint,error,children}: {label:string;hint?:string;error?:string;children:(props:{id:string;'aria-describedby'?:string;'aria-invalid'?:true})=>ReactNode}) {
  const id=useId();return <div className="plot-field"><label htmlFor={id}>{label}</label>{children({id,'aria-describedby':hint||error?`${id}-help`:undefined,'aria-invalid':error?true:undefined})}{(hint||error)&&<p id={`${id}-help`} className={error?'field-error':'field-hint'}>{error||hint}</p>}</div>;
}
export function Select({className,...props}:ComponentProps<'select'>){return <select className={cn('plot-input',className)} {...props}/>;}
export function Notice({tone='info',children}: {tone?:'info'|'success'|'error'|'warning';children:ReactNode}) {
  const Icon=tone==='success'?CheckCircle2:tone==='error'?AlertCircle:Info;
  return <div className={`plot-notice notice-${tone}`} role={tone==='error'?'alert':'status'}><Icon size={18} aria-hidden="true"/><div>{children}</div></div>;
}
export function MarketStatus({phase}: {phase:'open'|'locked'|'resolved'|'void'|'stale'}) {
  const labels={open:'Apuestas abiertas',locked:'Esperando resultado',resolved:'Resultado confirmado',void:'Reembolso disponible',stale:'Esperando a Twitch'};
  return <span className={`plot-status status-${phase}`}><span aria-hidden="true"/>{labels[phase]}</span>;
}
export function EmptyState({title,children,action}: {title:string;children:ReactNode;action?:ReactNode}) {
  return <div className="plot-empty"><PlotMascot mood="doubt"/><div><h2>{title}</h2><p>{children}</p>{action}</div></div>;
}
export function Skeleton(){return <div className="plot-skeleton" role="status" aria-label="Cargando mercado"><span/><span/><div><span/><span/></div></div>;}
export function Segmented<T extends string>({label,options,value,onChange}: {label:string;options:{value:T;label:string}[];value:T;onChange:(v:T)=>void}) {
  return <div className="plot-segmented" role="group" aria-label={label}>{options.map(o=><button type="button" key={o.value} aria-pressed={value===o.value} onClick={()=>onChange(o.value)}>{o.label}</button>)}</div>;
}
export function Balance({amount,unit='pts',label='Saldo disponible'}:{amount:number;unit?:string;label?:string}){return <div className="plot-balance"><span>{label}</span><strong>{new Intl.NumberFormat('es-AR').format(amount)} <small>{unit}</small></strong></div>;}
