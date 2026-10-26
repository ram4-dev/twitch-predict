import {useState} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {Button} from './components/button.js';
import {Badge} from './components/badge.js';
import {Check,ArrowUpRight,Wallet,LockKeyhole} from 'lucide-react';
import type {Points} from '../points.js';

type Account=ReturnType<Points['me']>;
type Market=ReturnType<Points['market']>;
type Console=ReturnType<Points['streamerConsole']>;
type ManagedMarket=Console['markets'][number];
const fmt=(n:number)=>new Intl.NumberFormat('es-AR').format(n);
const time=(s:string)=>new Date(s).toLocaleString('es-AR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
const labels={open:'Abierta',locked:'Esperando resultado',resolved:'Resuelta',void:'Reembolso'};
const roots=new Map<HTMLElement,Root>();
function mount(node:HTMLElement,view:React.ReactNode){let root=roots.get(node);if(!root){root=createRoot(node);roots.set(node,root);}root.render(view);}
function Stat({label,value,hint}:{label:string;value:string;hint?:string}){return <div className="console-stat"><span>{label}</span><strong>{value}</strong>{hint&&<small>{hint}</small>}</div>;}
export function renderUserConsole(node:HTMLElement,account:Account|undefined,markets:Market[],claim:(key:string)=>Promise<void>){mount(node,<UserConsole account={account} markets={markets} claim={claim}/>);}
function UserConsole({account,markets,claim}:{account?:Account;markets:Market[];claim:(key:string)=>Promise<void>}){
  const [filter,setFilter]=useState('all'),[busy,setBusy]=useState<string>(),[message,setMessage]=useState('');
  if(!account?.wallet)return <div className="console-empty"><Wallet size={28}/><h2>Tu consola de usuario</h2><p>Conectá Phantom para ver tus apuestas y movimientos.</p><a href="/onboarding">Conectar Phantom →</a></div>;
  const groups=[...new Set(account.bets.map(b=>b.marketKey))].reverse().map(key=>({key,bets:account.bets.filter(b=>b.marketKey===key),market:markets.find(m=>m.key===key)}));
  const inPlay=account.bets.filter(b=>['open','locked'].includes(b.phase)).reduce((n,b)=>n+b.amount,0);
  const credited=account.bets.filter(b=>b.claimed).reduce((n,b)=>n+b.payout,0);
  const collect=async(key:string)=>{setBusy(key);setMessage('');try{await claim(key);setMessage('Puntos acreditados a tu saldo.');}catch(e){setMessage((e as Error).message);}finally{setBusy(undefined);}};
  return <div className="user-console">
    <div className="console-wallet"><Wallet size={18}/><span>Wallet de tu cuenta</span><code title={account.wallet}>{account.wallet}</code><Badge variant="secondary">Phantom conectada</Badge></div>
    <div className="console-stats"><Stat label="En juego" value={`${fmt(inPlay)} pts`}/><Stat label="Para cobrar" value={`${fmt(account.claimable)} pts`}/><Stat label="Premios y reembolsos cobrados" value={`${fmt(credited)} pts`}/><Stat label="Apuestas registradas" value={fmt(account.bets.length)}/></div>
    <div className="console-section-title"><h2>Tus posiciones</h2><div className="console-tabs" aria-label="Filtrar apuestas">{[['all','Todas'],['active','En juego'],['pending','Por cobrar'],['done','Finalizadas']].map(([value,label])=><Button key={value} variant="ghost" aria-pressed={filter===value} onClick={()=>setFilter(value)}>{label}</Button>)}</div></div>
    {message&&<p role="status">{message}</p>}
    <div className="position-list">{groups.filter(g=>filter==='all'||(filter==='active'?g.bets.some(b=>['open','locked'].includes(b.phase)):filter==='pending'?g.bets.some(b=>b.payout>0&&!b.claimed):g.bets.every(b=>['resolved','void'].includes(b.phase)))).map(({key,bets,market})=>{
      const pending=bets.filter(b=>!b.claimed).reduce((n,b)=>n+b.payout,0),paid=bets.filter(b=>b.claimed).reduce((n,b)=>n+b.payout,0),stake=bets.reduce((n,b)=>n+b.amount,0);
      return <article className="position-card" key={key} data-position-key={key}><div className="console-section-title"><span>@{bets[0].channel}</span><Badge variant="secondary">{labels[bets[0].phase]}</Badge></div><h3>{bets[0].title}</h3><div className="position-outcomes">{bets.map(b=><div key={b.id}><span>{b.outcome}</span><strong>{fmt(b.amount)} pts</strong><small>{time(b.createdAt)} · {b.claimed?`Cobrado: ${fmt(b.payout)} pts`:b.payout?`Por cobrar: ${fmt(b.payout)} pts`:['resolved','void'].includes(b.phase)?'Sin premio':'En juego'}</small></div>)}</div><div className="position-total"><span>Tu apuesta total</span><strong>{fmt(stake)} pts</strong></div>{market?.winnerId&&<p className="console-winner"><Check size={14}/> Ganó {market.outcomes.find(o=>o.id===market.winnerId)?.title}</p>}{paid>0&&<p className="console-winner">Acreditados {fmt(paid)} pts · resultado neto {paid-stake>=0?'+':''}{fmt(paid-stake)} pts</p>}{pending>0&&<Button className="console-primary" disabled={!!busy} onClick={()=>void collect(key)}>{busy===key?'Acreditando…':`${bets[0].phase==='void'?'Recuperar':'Cobrar'} ${fmt(pending)} pts`}<ArrowUpRight size={16}/></Button>}</article>;
    })}{!groups.length&&<p className="console-empty">Todavía no hiciste apuestas. Elegí un mercado para empezar.</p>}</div>
    <div className="console-section-title"><h2>Movimientos del saldo</h2><span>Últimos 100 movimientos</span></div><div className="console-table-wrap"><table className="console-table"><thead><tr><th>Fecha</th><th>Movimiento</th><th>Mercado</th><th>Puntos</th><th>Saldo</th></tr></thead><tbody>{account.ledger.map(l=><tr key={l.id}><td>{time(l.createdAt)}</td><td>{{welcome:'Puntos iniciales',bet:'Apuesta',claim:'Cobro',distribution:'Reparto del streamer'}[l.kind]}</td><td>{l.title??'—'}</td><td className={l.delta>0?'positive':''}>{l.delta>0?'+':''}{fmt(l.delta)}</td><td>{fmt(l.balance)}</td></tr>)}</tbody></table></div>
  </div>;
}
export function renderStreamerConsole(node:HTMLElement,data:Console|undefined){mount(node,<StreamerConsole data={data}/>);}
function StreamerConsole({data}:{data?:Console}){
  const [channel,setChannel]=useState('all');
  if(!data?.channels.length)return <div className="console-empty"><LockKeyhole size={28}/><h2>Consola del streamer</h2><p>Los mercados de tu canal aparecen acá cuando se vincula tu cuenta de Twitch.</p><a href="#channels">Ver canales →</a></div>;
  const markets=data.markets.filter(m=>channel==='all'||m.prediction.channel===channel);
  return <div className="streamer-console"><div className="console-section-title"><div><h2>Tus mercados</h2><p>El estado y el resultado se actualizan desde Twitch.</p></div><label>Canal<select aria-label="Canal del streamer" value={channel} onChange={e=>setChannel(e.target.value)}><option value="all">Todos mis canales</option>{data.channels.map(c=><option key={c} value={c}>@{c}</option>)}</select></label></div>
    <div className="console-stats"><Stat label="Mercados" value={fmt(markets.length)}/><Stat label="Abiertos" value={fmt(markets.filter(m=>m.phase==='open').length)}/><Stat label="Esperando resultado" value={fmt(markets.filter(m=>m.phase==='locked').length)}/><Stat label="Finalizados" value={fmt(markets.filter(m=>['resolved','void'].includes(m.phase)).length)}/></div>
    {markets.map(m=><StreamerMarket key={m.key} market={m}/>)}{!markets.length&&<p className="console-empty">Cuando Twitch abra una predicción en tu canal, el mercado aparecerá acá.</p>}
  </div>;
}
function StreamerMarket({market:m}:{market:ManagedMarket}){
  return <article className="managed-market" data-streamer-key={m.key}><div className="console-section-title"><span>@{m.prediction.channel} · {m.demo?'Ejemplo de prueba':'Predicción de Twitch'}</span><Badge variant="secondary">{labels[m.phase]}</Badge></div><h3>{m.prediction.title}</h3>
    <div className="position-outcomes">{m.outcomes.map(o=><div key={o.id}><span>{o.title}</span>{m.winnerId===o.id&&<span className="console-winner"><Check size={14}/> Ganadora</span>}</div>)}</div>
    {m.phase==='void'&&<p className="console-winner">Predicción cancelada · Reembolso</p>}
    {m.phase==='resolved'&&<p className="console-winner">Ganó {m.outcomes.find(o=>o.id===m.winnerId)?.title}</p>}
    {m.settlement&&<p className="fine">{m.settlement.source==='twitch'?'Confirmado por Twitch':m.settlement.source==='demo'?'Resultado del ejemplo':'Resultado registrado'} · {time(m.settlement.at)}</p>}
  </article>;
}
