import {useState} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {ArrowUpRight,Check,Loader2,Coins} from 'lucide-react';
import {Button} from './components/button.js';
import {Input} from './components/input.js';
import {Badge} from './components/badge.js';
import type {Points} from '../points.js';
type Market=ReturnType<Points['market']>;
type Account=ReturnType<Points['me']>;
type Form={amount:number|string;busy:boolean;message:string;failed:boolean;pending?:{fingerprint:string;id:string}};
type Action={type:'render'}|{type:'bet'|'claim';market:Market;form:Form;outcomeId?:string;amount?:number};
type Client=ReturnType<typeof createPointsClient>;
const roots=new Set<Root>();
export const number=(n:number|null|undefined)=>new Intl.NumberFormat('es-AR').format(n??0);
export function createPointsClient(base:string,storage:{get():Promise<string|null|undefined>;set(token:string):Promise<void>}) {
  let session:Promise<string>|undefined;
  const request=async<T=unknown>(path:string,body?:unknown,token?:string):Promise<T>=>{
    const response=await fetch(`${base}${path}`,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
    const data=await response.json();if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);return data;
  };
  const ensure=()=>session??=(async()=>{let token=await storage.get();if(!token){const data=await request<{token:string}>('/api/points/session',{});token=data.token;await storage.set(token);}return token;})().catch(e=>{session=undefined;throw e;});
  return {request,me:async()=>request<Account>('/api/points/me',undefined,await ensure()),bet:async(body:unknown)=>request<{amount:number}>('/api/points/bet',body,await ensure()),claim:async(body:unknown)=>request<{paid:number}>('/api/points/claim',body,await ensure())};
}
export function disposePointsViews(){for(const root of roots)root.unmount();roots.clear();}
export function bettingView(market:Market,account:Account|undefined,onAction:(a:Action)=>unknown,forms:Map<string,Form>){
  const form=forms.get(market.key)??{amount:100,busy:false,message:'',failed:false};forms.set(market.key,form);
  const node=document.createElement('section');node.className='points-market';node.dataset.marketKey=market.key;
  const root=createRoot(node);roots.add(root);flushSync(()=>root.render(<Betting market={market} account={account} form={form} onAction={onAction}/>));return node;
}
function Betting({market,account,form,onAction}:{market:Market;account?:Account;form:Form;onAction:(a:Action)=>unknown}){
  const [amount,setAmount]=useState(String(form.amount));
  const own=(account?.bets??[]).filter(b=>b.marketKey===market.key);
  const pending=own.filter(b=>!b.claimed).reduce((n,b)=>n+b.payout,0);
  const stake=own.reduce((n,b)=>n+b.amount,0);
  const status={open:market.canBet?'Apuestas abiertas':market.sourceFresh?'Apuestas cerradas':'Esperando confirmación de Twitch',locked:'Esperando resultado de Twitch',resolved:'Resultado confirmado',void:'Reembolso disponible'};
  const change=(value:string)=>{setAmount(value);form.amount=value;form.pending=undefined;};
  const bet=(outcomeId:string)=>{const value=Number(amount);if(!Number.isSafeInteger(value)||value<1||value>(account?.balance??0)){form.message='Ingresá una cantidad entera dentro de tu saldo.';form.failed=true;onAction({type:'render'});return;}void onAction({type:'bet',market,form,outcomeId,amount:value});};
  return <>
    <div className="points-market-head"><span className={`points-status ${market.canBet?'live':''}`}><span className="status-mark"/>{status[market.phase]}</span><Badge variant="secondary">{market.demo?'Ejemplo':'Puntos internos'}</Badge></div>
    <div className="pool-summary"><div className="points-pool"><span>Pozo de la comunidad</span><strong>{number(market.totalPoints)} <small>pts</small></strong></div><div className="pool-people"><span>{number(market.participants)} {market.participants===1?'jugador':'jugadores'}</span><span>{number(market.totalBets)} {market.totalBets===1?'apuesta':'apuestas'}</span></div></div>
    <div className="pool-split" role="img" aria-label={`Distribución de puntos internos: ${market.outcomes.map(o=>`${o.title} ${number(o.points)}`).join(', ')}`}>
      {market.outcomes.map((o,i)=><span key={o.id} className={i===0?'share-primary':'share-secondary'} style={{width:`${o.share}%`}}/>)}
    </div>
    {market.canBet&&<div className="stake-row"><label className="points-stake"><span>Tu apuesta</span><span className="stake-input"><Coins size={16}/><Input type="number" min={1} max={account?.balance??0} step={1} aria-label="Puntos a apostar" value={amount} disabled={form.busy} onChange={e=>change(e.currentTarget.value)}/><span>pts</span></span></label><div className="points-quick">{[100,250,500,1000].map(value=><Button key={value} variant="ghost" size="sm" type="button" aria-pressed={Number(amount)===value} disabled={form.busy||!account||account.balance<value} onClick={()=>change(String(value))}>{number(value)}</Button>)}</div></div>}
    <div className="points-options">{market.outcomes.map((o,i)=>{
      const my=own.filter(b=>b.outcomeId===o.id).reduce((n,b)=>n+b.amount,0);
      return <div key={o.id} className={`points-option ${i===0?'side-first':'side-second'}`}>
        <div className="points-option-title"><strong>{o.title}</strong><span>{market.totalPoints?`${Math.round(o.share)}%`:'Sin apuestas'}</span></div>
        <p>{number(o.points)} pts <span>· {number(o.bets)} {o.bets===1?'apuesta':'apuestas'}</span></p>
        {my>0&&<p className="points-own">Apostaste {number(my)} pts</p>}
        {market.winnerId===o.id&&<strong className="points-winner"><Check size={14}/> Resultado ganador</strong>}
        {market.canBet&&<Button type="button" variant="secondary" className="points-bet" disabled={form.busy||!account||account.balance<1} onClick={()=>bet(o.id)}>Apostar a {o.title}<ArrowUpRight size={14}/></Button>}
      </div>;
    })}</div>

    {stake>0&&<p className="points-position">Tu participación <strong>{number(stake)} pts</strong>{own.every(b=>b.claimed)&&<span> · cobrada</span>}</p>}
    {pending>0&&<Button type="button" className="points-claim" disabled={form.busy} onClick={()=>void onAction({type:'claim',market,form})}>{market.phase==='void'?'Recuperar':'Cobrar'} {number(pending)} pts<ArrowUpRight size={16}/></Button>}
    {market.phase==='resolved'&&stake>0&&!own.some(b=>b.payout)&&<p className="points-position">Tu opción no ganó. No hay puntos para cobrar.</p>}
    {market.reason&&<p className="points-rule">{market.reason}</p>}
    {(form.busy||form.message)&&<p role="status" className={`points-message ${form.failed?'error':''}`}>{form.busy?<><Loader2 size={14} className="animate-spin"/> Guardando operación…</>:form.message}</p>}
    <p className="points-rule">El pozo se reparte entre quienes ganan, según sus puntos apostados. Sin comisión.</p>
  </>;
}
export async function performPointsAction(action:Action,client:Client,refresh:()=>Promise<void>){
  if(action.type==='render'){await refresh();return;}
  const {form,market}=action;if(form.busy)return;form.busy=true;form.message='';form.failed=false;
  const fingerprint=JSON.stringify([action.type,market.key,action.outcomeId,action.amount]);
  if(form.pending?.fingerprint!==fingerprint)form.pending={fingerprint,id:crypto.randomUUID()};
  void refresh();
  try{
    if(action.type==='bet'){const result=await client.bet({key:market.key,outcomeId:action.outcomeId,amount:action.amount,requestId:form.pending.id});form.message=`Apuesta registrada: ${number(result.amount)} pts.`;}
    else{const result=await client.claim({key:market.key,requestId:form.pending.id});form.message=`Se acreditaron ${number(result.paid)} pts a tu saldo.`;}
    form.pending=undefined;
  }catch(e){form.message=(e as Error).message;form.failed=true;}
  finally{form.busy=false;await refresh();}
}
