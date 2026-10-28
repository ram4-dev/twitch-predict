import {useState} from 'react';
import {ArrowUpRight,RotateCcw} from 'lucide-react';
import {CountingAmount} from './counting-amount.js';
export function SolRefund({title,channel,refund,winner,children}:{title:string;channel:string;refund:{lamports:number;count:number;precision:number};winner?:string;children?:React.ReactNode}){
 const [expanded,setExpanded]=useState(false),amount=refund.lamports/1e9;
 const formatted=new Intl.NumberFormat('es-AR',{maximumFractionDigits:9}).format(amount);
 return <article className="plot-resolution count" data-state="void" aria-label="Reembolso en SOL"><div className="resolution-content">
  <div className="resolution-meta"><span>@{channel}</span><span><RotateCcw size={13}/>Anulada</span></div><h3>{title}</h3>
  <p className="resolution-result">{winner?<>Resultado de Twitch: <strong>{winner}</strong></>:'Ronda anulada'}</p>
  <section className="resolution-personal positive" aria-label="Tu reembolso"><div className="resolution-label">Reembolso de tus apuestas registradas</div>
   <p className="resolution-net" style={{'--figure-length':formatted.length+1} as React.CSSProperties} aria-label={`Reembolso ${formatted} SOL`}><span className="resolution-net-value"><CountingAmount value={amount} fractionDigits={refund.precision} signed={false}/></span><span className="resolution-net-unit">SOL</span></p>
   <p className="resolution-caption">Ganancia neta: 0 SOL</p>
  </section>
  <dl className="resolution-receipt"><div><dt>Apuesta registrada</dt><dd>{formatted} SOL</dd></div><div><dt>Reembolso</dt><dd>{formatted} SOL</dd></div></dl>
  {children}
  <button type="button" className="resolution-detail-toggle" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?'Ocultar detalle':'Ver detalle'}<ArrowUpRight size={15}/></button>
  {expanded&&<div className="resolution-detail">{refund.count} {refund.count===1?'apuesta confirmada':'apuestas confirmadas'} de esta wallet en este dispositivo. Se devuelve el capital registrado, sin ganancias. Byte confirmó la liquidación en cadena.</div>}
 </div></article>;
}
