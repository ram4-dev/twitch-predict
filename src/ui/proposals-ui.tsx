/** Plan 2 — proposal components shared by the streamer inbox and the author's "Mis propuestas".
 * Accessible by default: no hover-only information, no color-only state, keyboard reachable, reduced-motion safe. */
import {useCallback,useEffect,useRef,useState} from 'react';
import {Button} from './components/button.js';
import {Badge} from './components/badge.js';
import type {ProposalsClient,ProposalItem} from './proposals-client.js';

const statusLabels:{[k in ProposalItem['status']]:string}={pending:'Pendiente',accepted:'Aceptada',rejected:'Rechazada',withdrawn:'Retirada'};
const time=(s:string)=>new Date(s).toLocaleString('es-AR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});

export function ProposalStatusBadge({status}:{status:ProposalItem['status']}){
  return <Badge variant={status==='pending'?'default':'secondary'} data-proposal-status={status}>{statusLabels[status]}</Badge>;
}

export function ProposalCard({proposal,children,management=false}:{proposal:ProposalItem;children?:React.ReactNode;management?:boolean}){
  const content=proposal.editedInput??proposal.input;
  return <article className="proposal-card" data-proposal-id={proposal.id} data-proposal-state={proposal.status} data-accepted-market-id={proposal.acceptedMarketId}>
    {management&&<span className="outcome-frame-rim proposal-card-rim" aria-hidden="true"/>}
    <div className="console-section-title"><span className="proposal-meta">Propuesta #{proposal.shortId}</span>
      <ProposalStatusBadge status={proposal.status}/></div>
    <h3>{content.title}</h3>
    <ol className="proposal-options" aria-label="Opciones de la propuesta">{content.options.map((o,i)=><li key={i}><span className="proposal-option-label">Opción {i+1}</span><strong>{o}</strong></li>)}</ol>
    <p className="proposal-details">{content.durationSeconds!==undefined&&<>{content.durationSeconds>=60?`${new Intl.NumberFormat('es-AR',{maximumFractionDigits:1}).format(content.durationSeconds/60)} min`:`${content.durationSeconds} s`} para apostar · </>}Recibida el {time(proposal.createdAt)}</p>
    {proposal.editedInput&&<p className="fine">Contenido ajustado por el streamer antes de publicar (original conservado).</p>}
    {proposal.status==='rejected'&&proposal.rejectionReason&&<p className="fine">Motivo: {proposal.rejectionReason}</p>}
    {proposal.status==='accepted'&&proposal.acceptedMarketId&&<p className="fine proposal-published">Mercado publicado.</p>}
    {children}
  </article>;
}

/** Streamer inbox. Only rendered with server-verified owner capabilities; actions call the API and show its result. */
export function ProposalInbox({client,channelId,onChanged,initial}:{client:ProposalsClient;channelId:string;onChanged?:()=>void;initial?:{loaded?:boolean}}){
  const [proposals,setProposals]=useState<ProposalItem[]>([]);
  const [loaded,setLoaded]=useState(initial?.loaded??false);
  const [busy,setBusy]=useState<string>();
  const [message,setMessage]=useState('');
  const [loadError,setLoadError]=useState('');
  const requestSequence=useRef(0),actionPending=useRef(false);
  const refresh=useCallback(async()=>{
    const sequence=++requestSequence.current;
    try{const data=await client.forChannel(channelId);if(sequence!==requestSequence.current)return;setProposals(data.proposals);setLoaded(true);setLoadError('');}
    catch(e){if(sequence!==requestSequence.current)return;setLoaded(true);setLoadError((e as Error).message);}
  },[client,channelId]);
  useEffect(()=>{
    if(!initial?.loaded)void refresh();
    const timer=setInterval(()=>void refresh(),5000);
    return ()=>{clearInterval(timer);requestSequence.current++;};
  },[refresh,initial?.loaded]);
  const act=async(action:'accept'|'reject'|'withdraw',proposal:ProposalItem)=>{
    if(actionPending.current)return;actionPending.current=true;
    setBusy(proposal.id);setMessage('');
    try{
      if(action==='accept')await client.accept(proposal.id,`inbox-${proposal.id}-${Date.now()}`);
      else if(action==='reject')await client.reject(proposal.id,`inbox-${proposal.id}-${Date.now()}`);
      else await client.withdraw(proposal.id,`inbox-${proposal.id}-${Date.now()}`);
      setMessage(action==='accept'?'Propuesta aceptada y mercado publicado.':action==='reject'?'Propuesta rechazada.':'Propuesta retirada.');
      await refresh();onChanged?.();
    }catch(e){setMessage((e as Error).message);}finally{actionPending.current=false;setBusy(undefined);}
  };
  const pending=proposals.filter(p=>p.status==='pending');
  return <section className="proposal-inbox" aria-label="Bandeja de propuestas">
    <div className="console-section-title"><h2>Propuestas</h2><Badge variant="secondary">{pending.length} pendientes</Badge></div>
    {message&&<p role="status">{message}</p>}
    {loadError&&<p role="alert">{loadError} <Button variant="ghost" onClick={()=>void refresh()}>Reintentar</Button></p>}
    {!loaded&&<p role="status">Cargando propuestas…</p>}
    {loaded&&!loadError&&!proposals.length&&<p className="console-empty">Todavía no hay propuestas para este canal.</p>}
    <div className="proposal-list">{proposals.map(p=><ProposalCard key={p.id} proposal={p} management>{p.status==='pending'&&
      <div className="proposal-actions">
        <Button className="console-primary" disabled={!!busy} onClick={()=>void act('accept',p)}>{busy===p.id?'Publicando…':'Aceptar y publicar'}</Button>
        <Button variant="ghost" disabled={!!busy} onClick={()=>void act('reject',p)}>Rechazar</Button>
      </div>}</ProposalCard>)}</div>
  </section>;
}

/** Author view ("Mis propuestas") with withdraw for pending ones. */
export function MyProposals({client,initial}:{client:ProposalsClient;initial?:{loaded?:boolean}}){
  const [proposals,setProposals]=useState<ProposalItem[]>([]);
  const [loaded,setLoaded]=useState(initial?.loaded??false);
  const [busy,setBusy]=useState<string>();
  const [message,setMessage]=useState('');
  const refresh=async()=>{try{const data=await client.mine();setProposals(data.proposals);setLoaded(true);}catch(e){setMessage((e as Error).message);}};
  if(!loaded)void refresh();
  const withdraw=async(p:ProposalItem)=>{setBusy(p.id);setMessage('');try{await client.withdraw(p.id,`mine-${p.id}-${Date.now()}`);setMessage('Propuesta retirada.');await refresh();}catch(e){setMessage((e as Error).message);}finally{setBusy(undefined);}};
  return <section className="my-proposals" aria-label="Mis propuestas">
    <div className="console-section-title"><h2>Mis propuestas</h2><span>{proposals.filter(p=>p.status==='pending').length} pendientes</span></div>
    {message&&<p role="status">{message}</p>}
    {loaded&&!proposals.length&&<p className="console-empty">No enviaste propuestas. Podés proponer un mercado desde la página del canal.</p>}
    <div className="proposal-list">{proposals.map(p=><ProposalCard key={p.id} proposal={p}>{p.status==='pending'&&
      <Button variant="ghost" disabled={!!busy} onClick={()=>void withdraw(p)}>{busy===p.id?'Retirando…':'Retirar propuesta'}</Button>}</ProposalCard>)}</div>
  </section>;
}

export type ComposerMode='create'|'propose';
/** MarketComposer: same fields for direct creation (owner/moderator) and proposals (viewers); the server decides by role. */
export function MarketComposer({mode,onSubmit,channelLabel,defaultDuration=120}:{mode:ComposerMode;onSubmit:(input:{title:string;options:string[];durationSeconds:number})=>Promise<{id?:string;shortId?:string}>;channelLabel:string;defaultDuration?:number}){
  const [title,setTitle]=useState('');const [options,setOptions]=useState(['','']);const [duration,setDuration]=useState(String(defaultDuration));
  const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [ok,setOk]=useState('');
  const setOption=(i:number,v:string)=>setOptions(current=>current.map((o,j)=>j===i?v:o));
  const submit=async()=>{
    setMessage('');setOk('');
    const cleaned=options.map(o=>o.trim()).filter(Boolean);
    if(!title.trim()||cleaned.length<2)return setMessage('Completá la pregunta y al menos dos opciones.');
    if(new Set(cleaned.map(o=>o.toLocaleLowerCase())).size!==cleaned.length)return setMessage('Las opciones deben ser distintas entre sí.');
    if(!Number.isInteger(Number(duration))||Number(duration)<30||Number(duration)>1800)return setMessage('Usá una duración entre 30 y 1800 segundos.');
    setBusy(true);
    try{const result=await onSubmit({title:title.trim(),options:cleaned,durationSeconds:Number(duration)||defaultDuration});
      setOk(mode==='propose'?`Propuesta ${result.shortId??''} enviada; pendiente de aprobación.`:'Mercado publicado.');
      setTitle('');setOptions(['','']);}
    catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
  };
  return <form className="market-composer" aria-label={mode==='propose'?'Proponer mercado':'Crear mercado'} onSubmit={e=>{e.preventDefault();void submit();}}>
    <label>Pregunta<input value={title} onChange={e=>setTitle(e.target.value)} maxLength={140} placeholder="¿Gana el equipo rojo?"/></label>
    <fieldset><legend>Opciones (2 a 6)</legend>
      {options.map((o,i)=><label key={i} className="composer-option"><span className="fine">{i+1}</span>
        <input value={o} maxLength={60} aria-label={`Opción ${i+1}`} onChange={e=>setOption(i,e.target.value)}/>
        {options.length>2&&i>=2&&<Button type="button" variant="ghost" aria-label={`Quitar opción ${i+1}`} onClick={()=>setOptions(c=>c.filter((_,j)=>j!==i))}>×</Button>}</label>)}
      {options.length<6&&<Button type="button" variant="ghost" onClick={()=>setOptions(c=>[...c,''])}>Agregar opción</Button>}
    </fieldset>
    <label>Duración de apuestas (segundos)<input type="number" min={30} max={1800} value={duration} onChange={e=>setDuration(e.target.value)}/></label>
    <p className="fine">Canal: {channelLabel} · {mode==='propose'?'Se envía como propuesta para aprobación del streamer.':'Se publica según tu rol en el canal.'}</p>
    {message&&<p role="alert">{message}</p>}
    {ok&&<p role="status">{ok}</p>}
    <Button type="submit" className="console-primary" disabled={busy}>{busy?'Enviando…':mode==='propose'?'Enviar propuesta':'Crear mercado'}</Button>
  </form>;
}
