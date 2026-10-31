import {useState} from 'react';
import {ArrowUpRight,RotateCcw} from 'lucide-react';
import {CountingAmount} from './counting-amount.js';
export function SolRefund({title,channel,refund,winner,english=false,children}:{title:string;channel:string;refund:{lamports:number;count:number;precision:number};winner?:string;english?:boolean;children?:React.ReactNode}){
 const [expanded,setExpanded]=useState(false),amount=refund.lamports/1e9,locale=english?'en-US':'es-AR';
 const formatted=new Intl.NumberFormat(locale,{maximumFractionDigits:9}).format(amount);
 return <article className="plot-resolution count" data-state="void" aria-label={english?'SOL refund':'Reembolso en SOL'}><div className="resolution-content">
  <div className="resolution-meta"><span>@{channel}</span><span><RotateCcw size={13}/>{english?'Voided':'Anulada'}</span></div><h3>{title}</h3>
  <p className="resolution-result">{winner?<>{english?'Twitch result:':'Resultado de Twitch:'} <strong>{winner}</strong></>:(english?'Round voided':'Ronda anulada')}</p>
  <section className="resolution-personal positive" aria-label={english?'Your refund':'Tu reembolso'}><div className="resolution-label">{english?'Refund of your recorded stakes':'Reembolso de tus apuestas registradas'}</div>
   <p className="resolution-net" style={{'--figure-length':formatted.length+1} as React.CSSProperties} aria-label={english?`Refund ${formatted} SOL`:`Reembolso ${formatted} SOL`}><span className="resolution-net-value"><CountingAmount value={amount} fractionDigits={refund.precision} signed={false} locale={locale}/></span><span className="resolution-net-unit">SOL</span></p>
   <p className="resolution-caption">{english?'Net gain: 0 SOL':'Ganancia neta: 0 SOL'}</p>
  </section>
  <dl className="resolution-receipt"><div><dt>{english?'Recorded stake':'Apuesta registrada'}</dt><dd>{formatted} SOL</dd></div><div><dt>{english?'Refund':'Reembolso'}</dt><dd>{formatted} SOL</dd></div></dl>
  {children}
  <button type="button" className="resolution-detail-toggle" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?(english?'Hide details':'Ocultar detalle'):(english?'Show details':'Ver detalle')}<ArrowUpRight size={15}/></button>
  {expanded&&<div className="resolution-detail">{english?`${refund.count} confirmed ${refund.count===1?'stake':'stakes'} from this wallet on this device. The recorded stake is returned, with no profit. Byte confirmed settlement on-chain.`:`${refund.count} ${refund.count===1?'apuesta confirmada':'apuestas confirmadas'} de esta wallet en este dispositivo. Se devuelve el capital registrado, sin ganancias. Byte confirmó la liquidación en cadena.`}</div>}
 </div></article>;
}
