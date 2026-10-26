import {emptyMarketView,disposePointsViews,createPointsClient,bettingView,performPointsAction,number} from './points-ui.js';
const $=s=>document.querySelector(s);const el=(tag,value,className)=>{const n=document.createElement(tag);if(value!=null)n.textContent=value;if(className)n.className=className;return n;};
const client=createPointsClient('',{get:async()=>localStorage.getItem('pointsToken'),set:async token=>localStorage.setItem('pointsToken',token)});
const forms=new Map();let account,markets=[],token,refreshing=false;
async function admin(path,body){if(!token){const r=await fetch('/api/pair');if(!r.ok)throw new Error('Abrí el panel local para conectar');token=(await r.json()).token;}return client.request(path,body,token);}
function card(m){
  const node=el('article',null,'market-card');node.dataset.key=m.key;const head=el('div',null,'market-heading');const channel=el('a',`@${m.prediction.channel}`);if(!m.demo){channel.href=`https://www.twitch.tv/${m.prediction.channel}`;channel.target='_blank';channel.rel='noopener';}head.append(channel,el('span',m.demo?'Ejemplo de prueba':`Cierre: ${new Date(Date.parse(m.prediction.createdAt)+m.prediction.predictionWindowSeconds*1000).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})}`));node.append(head,el('h3',m.prediction.title),bettingView(m,account?.wallet?account:undefined,a=>performPointsAction(a,client,refresh),forms));
  if(m.demo&&!['resolved','void'].includes(m.phase)){const details=el('details',null,'demo-controls');details.append(el('summary','Resolver este ejemplo'));details.append(el('p','Simulá el resultado para probar el cobro. Los mercados reales se resuelven con Twitch.'));for(const o of m.outcomes){const button=el('button',`Dar ganador: ${o.title}`,'secondary');button.onclick=()=>void operate(async()=>{await admin('/api/demo/resolve',{key:m.key,winnerId:o.id});});details.append(button);}const cancel=el('button','Cancelar y reembolsar','secondary');cancel.onclick=()=>void operate(async()=>{await admin('/api/demo/resolve',{key:m.key,winnerId:null});});details.append(cancel);node.append(details);}
  return node;
}
function render(){
  disposePointsViews();
  $('#account-name').textContent=account?.wallet?`${account.wallet.slice(0,4)}…${account.wallet.slice(-4)}`:'Conectá Phantom';$('#login-panel').hidden=!!account?.wallet;$('#extension-link-status').textContent=localStorage.getItem('linkedExtensionId')?'Extensión conectada. Usás la misma cuenta y el mismo saldo en ambos lugares.':'Conectá Phantom desde la extensión. La vinculación con este panel es automática.';$('#own-balance').textContent=account?number(account.balance):'—';$('#market-count').textContent=`${markets.length} mercados`;
  $('#markets').replaceChildren(...(markets.length?markets.map(card):[emptyMarketView()]));
  const history=$('#history');history.replaceChildren();if(account?.bets.length){history.append(el('h2','Tus apuestas recientes'));for(const b of account.bets.slice(-10).reverse()){const row=el('div',null,'history-row');row.append(el('strong',b.title),el('span',`${b.outcome} · ${number(b.amount)} pts · ${b.claimed?'Cobrado':b.payout?`${number(b.payout)} pts por cobrar`:['resolved','void'].includes(b.phase)?'Finalizada':'En juego'}`));history.append(row);}}
}
async function refresh(){
  if(refreshing)return;refreshing=true;const focused=document.activeElement;const key=focused?.matches('input[aria-label="Puntos a apostar"]')?focused.closest('[data-market-key]')?.dataset.marketKey:null;
  try{const [nextMarkets,nextAccount,channels]=await Promise.all([client.request('/api/markets'),client.me().catch(()=>undefined),client.request('/api/channels')]);markets=nextMarkets;account=nextAccount;render();$('#watched').replaceChildren(...channels.channels.map(c=>{const row=el('div',null,'watch-row');row.append(el('span',`@${c}`));const stop=el('button','Dejar de seguir','secondary');stop.onclick=async()=>{await authorizeDelete(c);await refresh();};row.append(stop);return row;}));$('#source-status').textContent=channels.sourceError?`Twitch: ${channels.sourceError}`:'';if(key)document.querySelector(`[data-market-key="${CSS.escape(key)}"] input`)?.focus();}
  catch(e){account=undefined;document.querySelectorAll('.points-bet,.points-claim').forEach(b=>b.disabled=true);$('#notice').textContent=e.message;}
  finally{refreshing=false;}
}
async function authorizeDelete(channel){await admin('/api/sync',{});const response=await fetch(`/api/channels/${encodeURIComponent(channel)}`,{method:'DELETE',headers:{Authorization:`Bearer ${token}`}});if(!response.ok)throw new Error('No se pudo dejar de seguir el canal');}
async function operate(fn){try{$('#notice').textContent='Guardando…';await fn();$('#notice').textContent='Listo.';await refresh();}catch(e){$('#notice').textContent=e.message;}}
$('#demo').onclick=()=>void operate(async()=>{await admin('/api/demo',{});});
$('#watch-form').onsubmit=e=>{e.preventDefault();void operate(async()=>{await admin('/api/channels',{channel:$('#watch-channel').value.trim().replace(/^@/,'')});});};
$('#login-link').onclick=async e=>{e.preventDefault();const config=await client.request('/api/auth/config');location.href=`${config.origin}/onboarding`;};
await refresh();setInterval(refresh,5000);
setInterval(()=>{for(const m of markets)if(Date.parse(m.prediction.createdAt)+m.prediction.predictionWindowSeconds*1000<=Date.now()||(!m.demo&&Date.now()-Date.parse(m.sourceCheckedAt)>=30000))document.querySelectorAll(`[data-market-key="${CSS.escape(m.key)}"] .points-bet`).forEach(b=>b.disabled=true);},1000);

function setView(){
  const view=['history','channels','connect'].includes(location.hash.slice(1))?location.hash.slice(1):'markets';
  const operator=view==='channels'||view==='connect';
  $('#market-section').hidden=view!=='markets';$('#history').hidden=view!=='history';$('#channels').hidden=!operator;
  document.querySelectorAll('[data-view]').forEach(a=>{if(a.dataset.view===(operator?'channels':view))a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  $('#page-title').textContent=operator?'Canales y extensión':view==='history'?'Mis apuestas':'Predicciones de la comunidad';
  $('#page-description').textContent=operator?'Elegí qué comunidades seguir. Cada apuesta abierta se replica automáticamente.':view==='history'?'Tus puntos en juego y los resultados de tus apuestas.':'Las mismas opciones del stream. Un pozo propio para jugar.';
}
window.addEventListener('hashchange',setView);setView();
