import {useRef,useState} from 'react';
import {ArrowUpRight} from 'lucide-react';
import {Button} from './components/button.js';
import {Resolution} from './components/resolution.js';
import type {Points} from '../points.js';

type Market=ReturnType<Points['market']>;
type Account=ReturnType<Points['me']>;
/** The settled points card shared by the web and extension. Claiming never changes the original totals. */
export function PointsResolution({market,account,english=false,demo=false,busy=false,message='',failed=false,onClaim,onDetail}:{market:Market;account?:Account;english?:boolean;demo?:boolean;busy?:boolean;message?:string;failed?:boolean;onClaim?:()=>unknown;onDetail?:()=>void}){
 const [claiming,setClaiming]=useState(false),[error,setError]=useState('');const lock=useRef(false);
 const own=(account?.bets??[]).filter(b=>b.marketKey===market.key);
 const stake=own.reduce((sum,b)=>sum+b.amount,0),payout=own.reduce((sum,b)=>sum+b.payout,0),pending=own.filter(b=>!b.claimed).reduce((sum,b)=>sum+b.payout,0);
 const fmt=(value:number)=>new Intl.NumberFormat(english?'en-US':'es-AR').format(value);
 const collect=async()=>{if(lock.current||busy||!onClaim)return;lock.current=true;setClaiming(true);setError('');try{await onClaim();}catch(e){setError(e instanceof Error?e.message:english?'Could not claim your points.':'No pudimos cobrar tus puntos.');}finally{lock.current=false;setClaiming(false);}};
 return <Resolution english={english} showOutcomeSummary={!english} title={market.prediction.title} channel={market.prediction.channel} outcomes={market.outcomes} winnerId={market.winnerId} canceled={market.phase==='void'} stake={stake} payout={payout} accountKnown={!!account} hit={own.some(b=>b.outcomeId===market.winnerId)}>
  {pending>0&&onClaim&&<Button type="button" className="points-claim" disabled={busy||claiming} onClick={()=>void collect()}>{claiming?(english?'Claiming…':'Cobrando…'):demo?'Simular cobro':market.phase==='void'?(english?'Recover':'Recuperar'):(english?'Claim':'Cobrar')} {fmt(pending)} pts<ArrowUpRight size={16}/></Button>}
  {payout>0&&pending===0&&<p className="resolution-credited">{market.phase==='void'?(english?'Refund credited':'Reembolso acreditado'):(english?'Payout credited':'Cobro acreditado')} · {fmt(payout)} pts</p>}
  {market.reason&&<p className="points-rule">{market.reason}</p>}
  {(busy||message)&&<p role="status" className={`points-message ${failed?'error':''}`}>{busy?(english?'Saving…':'Guardando operación…'):message}</p>}
  {error&&<p role="alert" className="points-message error">{error}</p>}
  {onDetail&&<Button type="button" variant="ghost" onClick={onDetail}>Abrir mercado<ArrowUpRight size={16}/></Button>}
 </Resolution>;
}
