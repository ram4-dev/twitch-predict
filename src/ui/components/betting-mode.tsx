import {useEffect,useState} from 'react';
export type BettingMode='points'|'byte';
type ModeState=BettingMode|'unavailable';
export function useBettingMode(){
  const [mode,setMode]=useState<ModeState>();
  useEffect(()=>{const abort=new AbortController();void fetch('/api/health',{signal:abort.signal}).then(async response=>{
    if(!response.ok)throw new Error('Modo no disponible');
    const data=await response.json();
    if(!abort.signal.aborted)setMode(data.marketMode==='byte'?'byte':data.marketMode==='offchain'?'points':'unavailable');
  }).catch(()=>{if(!abort.signal.aborted)setMode('unavailable');});return()=>abort.abort();},[]);
  return mode;
}
export function BettingModeLabel({mode,short=false}:{mode?:ModeState;short?:boolean}){
  const label=mode==='byte'?'SOL devnet':mode==='points'?'Puntos internos de Plot':mode==='unavailable'?'Modo no disponible':'Consultando modo…';
  return <span>{label}{!short&&(mode==='points'||mode==='byte')?' · sin dinero real':''}</span>;
}
export function BettingModeNotice({mode}:{mode?:ModeState}){
  return <p className="auth-note">La firma de acceso no envía una transacción.{mode==='byte'?' Las apuestas usan SOL de devnet.':mode==='points'?' Los puntos son internos y de prueba. No necesitás depositar SOL.':''}</p>;
}
