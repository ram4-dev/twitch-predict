import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Plus,RefreshCw} from 'lucide-react';
import type {Points} from '../points.js';
import type {AppAccount,AppMarket,AppTheme} from './mobile-app-data.js';
import {UserMarketCard} from './components/user-market-card.js';
import {Resolution} from './components/resolution.js';
import {StreamerMarketState} from './components/streamer-market-state.js';
import {PointsFees} from './components/points-fees.js';
import {Button} from './components/button.js';
import {MarketComposer,ProposalInbox} from './proposals-ui.js';
import {httpProposalsClient} from './proposals-client.js';
import {number} from './points-ui.js';

type ConsoleData=ReturnType<Points['streamerConsole']>;
type Settlement=ReturnType<Points['previewSettlement']>;
const authenticatedFetch:typeof fetch=(url,init)=>{
 const headers=new Headers(init?.headers);headers.set('Authorization',`Bearer ${localStorage.getItem('pointsToken')??''}`);
 return fetch(url,{...init,headers});
};
async function request<T>(path:string,body?:Record<string,unknown>):Promise<T>{
 const response=await authenticatedFetch(path,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:undefined);
 const data=await response.json();if(!response.ok)throw new Error(data.error??'No pudimos completar la operación.');return data;
}

export function StreamerManager({account,theme,onRefresh}:{account:AppAccount;theme:AppTheme;onRefresh:()=>Promise<void>}){
 const [data,setData]=useState<ConsoleData>(),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const [selected,setSelected]=useState(account.streamerChannels[0]??''),[composing,setComposing]=useState(false),[view,setView]=useState<'markets'|'proposals'>('markets');
 const mounted=useRef(false),sequence=useRef(0),creationIds=useRef(new Map<string,string>());
 const proposals=useMemo(()=>httpProposalsClient(authenticatedFetch),[]);
 const load=useCallback(async()=>{
  const id=++sequence.current;setLoading(true);
  try{const next=await request<ConsoleData>('/api/streamer/console');if(mounted.current&&id===sequence.current){setData(next);setError('');}}
  catch(e){if(mounted.current&&id===sequence.current)setError((e as Error).message);}
  finally{if(mounted.current&&id===sequence.current)setLoading(false);}
 },[]);
 useEffect(()=>{mounted.current=true;void load();const timer=setInterval(()=>void load(),10000);return()=>{mounted.current=false;sequence.current++;clearInterval(timer);};},[load]);
 const changed=async()=>{await Promise.all([load(),onRefresh()]);};
 const channels=data?.channels??account.streamerChannels;
 const channel=channels.includes(selected)?selected:channels[0]??'';
 const phaseOrder={locked:0,open:1,resolved:2,void:2};
 const markets=(data?.markets??[]).filter(m=>m.prediction.channel===channel).sort((a,b)=>phaseOrder[a.phase]-phaseOrder[b.phase]);
 return <section className="phone-manager" aria-label="Consola del streamer" aria-busy={loading}>
  <header className="phone-manager-heading"><div><h2>Tu canal</h2>{channels.length>1?<label>Canal<select aria-label="Canal a administrar" value={channel} onChange={e=>{setSelected(e.target.value);setComposing(false);}}>{channels.map(c=><option key={c} value={c}>@{c}</option>)}</select></label>:<p>@{channel}</p>}</div><Button variant="secondary" disabled={!channel} aria-expanded={composing} aria-controls="manager-composer" onClick={()=>setComposing(!composing)}><Plus size={16}/>{composing?'Cerrar formulario':'Crear mercado'}</Button></header>
  {composing&&channel&&<section id="manager-composer" className="phone-manager-panel" aria-label="Nuevo mercado"><h2>Nuevo mercado</h2><MarketComposer key={channel} mode="create" channelLabel={`@${channel}`} onSubmit={async input=>{const fingerprint=JSON.stringify([channel,input]);if(!creationIds.current.has(fingerprint))creationIds.current.set(fingerprint,crypto.randomUUID());const result=await request<{id?:string}>('/api/streamer/markets',{...input,channelLogin:channel,intentId:creationIds.current.get(fingerprint)});creationIds.current.delete(fingerprint);await changed();setView('markets');return result;}}/></section>}
  <div className="phone-manager-toolbar"><div role="group" aria-label="Administrar canal" className="phone-manager-tabs"><button aria-pressed={view==='markets'} onClick={()=>setView('markets')}>Mercados</button><button aria-pressed={view==='proposals'} onClick={()=>setView('proposals')}>Propuestas</button></div><button className="phone-icon-button" aria-label="Actualizar consola" disabled={loading} onClick={()=>void load()}><RefreshCw size={17}/></button></div>
  {error&&<div className="phone-error" role="alert">{error}<button onClick={()=>void load()}>Reintentar</button></div>}
  {!data&&loading&&<p role="status">Cargando mercados…</p>}
  {data&&!channel&&<p className="phone-manager-empty">Ya no tenés canales para administrar.</p>}
  {channel&&view==='proposals'?<ProposalInbox key={channel} client={proposals} channelId={channel} onChanged={()=>void changed()}/>:<>
   <div className="phone-manager-markets">{markets.map(m=><ManagedMarket key={m.key} market={m} account={account} theme={theme} onChanged={changed}/>)}{data&&!markets.length&&<p className="phone-manager-empty">Todavía no hay mercados en este canal. Creá el primero.</p>}</div>
  </>}
 </section>;
}

function ManagedMarket({market:m,account,theme,onChanged}:{market:AppMarket;account:AppAccount;theme:AppTheme;onChanged:()=>Promise<void>}){
 const [winner,setWinner]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [preview,setPreview]=useState<{action:'resolve'|'cancel';winner:string;data:Settlement}>();
 const requests=useRef(new Map<string,string>());
 // A new market state invalidates an older settlement preview, including updates from another device.
 useEffect(()=>{setPreview(undefined);setWinner('');},[m.phase,m.updatedAt]);
 const run=async(action:'lock'|'resolve'|'cancel')=>{
  if(busy)return;setBusy(true);setError('');
  const fingerprint=`${action}:${winner}`;if(!requests.current.has(fingerprint))requests.current.set(fingerprint,crypto.randomUUID());
  try{await request('/api/streamer/action',{key:m.key,action,...(action==='resolve'?{winnerId:winner}:{}),requestId:requests.current.get(fingerprint)});setPreview(undefined);await onChanged();}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}
 };
 const prepare=async(action:'resolve'|'cancel')=>{
  setBusy(true);setError('');setPreview(undefined);
  try{const data=await request<Settlement>('/api/streamer/preview',{key:m.key,winnerId:action==='cancel'?null:winner});setPreview({action,winner,data});}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}
 };
 const collect=async()=>{
  if(busy)return;setBusy(true);setError('');
  if(!requests.current.has('claim'))requests.current.set('claim',crypto.randomUUID());
  try{await request('/api/points/claim',{key:m.key,requestId:requests.current.get('claim')});await onChanged();}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}
 };
 if(['resolved','void'].includes(m.phase)){
  const own=account.bets.filter(b=>b.marketKey===m.key);
  const stake=own.reduce((sum,b)=>sum+b.amount,0),payout=own.reduce((sum,b)=>sum+b.payout,0),pending=own.filter(b=>!b.claimed).reduce((sum,b)=>sum+b.payout,0);
  const earned=account.ledger.filter(entry=>entry.kind==='streamer_fee'&&entry.marketKey===m.key).reduce((sum,entry)=>sum+entry.delta,0);
  const earnings=m.phase==='void'?0:m.fees?.streamer??earned;
  return <div data-streamer-key={m.key} data-phase={m.phase}><Resolution title={m.prediction.title} channel={m.prediction.channel} outcomes={m.outcomes} winnerId={m.winnerId} canceled={m.phase==='void'} reason={m.phase==='void'?m.reason:undefined} stake={stake} payout={payout} hit={own.some(b=>b.outcomeId===m.winnerId)} material="count" hideEmptyPersonal resultContent={<StreamerMarketState market={m}/>}><section className="manager-earnings" data-positive={earnings>0} aria-label="Ganancia del streamer"><span>Ganancia del streamer</span><p><strong>{number(earnings)}</strong><span>pts</span></p></section>{m.fees&&<PointsFees pool={m.totalPoints} fees={m.fees} canceled={m.phase==='void'} historical/>}{pending>0&&<Button disabled={busy} onClick={()=>void collect()}>{busy?'Cobrando…':`Cobrar ${number(pending)} pts`}</Button>}{error&&<p role="alert" className="phone-error">{error}</p>}</Resolution></div>;
 }
 const canManage=m.source==='plot';
 return <div data-streamer-key={m.key} data-phase={m.phase}><UserMarketCard market={m} theme={theme} management chosenOutcome={m.winnerId??winner} onDetail={()=>{}} onChoose={({outcome})=>{if(!busy&&canManage){setWinner(outcome);setPreview(undefined);setError('');}}}>
  {canManage?<div className="phone-manager-actions">
   {m.phase==='open'?<Button variant="secondary" disabled={busy} onClick={()=>void run('lock')}>{busy?'Cerrando…':'Cerrar apuestas'}</Button>:<>
    <Button variant="secondary" disabled={busy||!winner} onClick={()=>void prepare('resolve')}>{busy?'Calculando…':'Revisar resultado'}</Button>
    <Button variant="ghost" disabled={busy} onClick={()=>void prepare('cancel')}>Cancelar y reembolsar</Button>
   </>}
   {preview&&<section className="phone-manager-confirm" aria-label="Confirmar liquidación"><h3>{preview.action==='cancel'?'Cancelar mercado':`Ganador: ${m.outcomes.find(o=>o.id===preview.winner)?.title}`}</h3><p>{preview.action==='cancel'?'Se devolverán todas las apuestas.':preview.data.phase==='void'?(preview.data.bets.length?'No hay apuestas a la opción ganadora. Al confirmar se anulará la predicción y se devolverán los puntos.':'La predicción no recibió apuestas. Al confirmar quedará anulada.'):'El resultado será definitivo.'}</p><dl className="phone-receipt"><div><dt>Pozo total</dt><dd>{number(preview.data.pool)} pts</dd></div><div><dt>Apuestas</dt><dd>{number(preview.data.bets.length)}</dd></div></dl><PointsFees pool={preview.data.pool} fees={preview.data.fees} canceled={preview.data.phase==='void'}/><div className="phone-manager-preview">{preview.data.bets.slice(0,20).map(b=><p key={b.id}><span>{b.outcome} · Apuesta {number(b.amount)} pts</span><span>Cobro total {number(b.payout)} pts · Neto {b.payout-b.amount>0?'+':''}{number(b.payout-b.amount)} pts</span></p>)}</div>{preview.data.bets.length>20&&<p>Se muestran las primeras 20 apuestas de {number(preview.data.bets.length)}.</p>}{preview.action==='resolve'&&preview.data.phase!=='void'&&<p>Los ganadores podrán cobrar su premio.</p>}<div className="phone-manager-confirm-buttons"><Button variant="secondary" disabled={busy} onClick={()=>void run(preview.action)}>{busy?'Confirmando…':preview.action==='cancel'?'Confirmar reembolso':preview.data.phase==='void'?'Confirmar anulación':'Confirmar ganador'}</Button><Button variant="ghost" disabled={busy} onClick={()=>setPreview(undefined)}>Volver</Button></div></section>}
   {error&&<p role="alert" className="phone-error">{error}</p>}
  </div>:m.source!=='plot'&&<p className="phone-manager-external">El resultado se actualiza desde Twitch.</p>}
 </UserMarketCard></div>;
}
