import {disposePointsViews,emptyMarketView,createPointsClient,bettingView,performPointsAction,number} from './points-ui.js';
import './surfaces.js';
import {renderUserConsole,renderStreamerConsole} from './consoles.js';
const $=s=>document.querySelector(s);const el=(tag,value,className)=>{const n=document.createElement(tag);if(value!=null)n.textContent=value;if(className)n.className=className;return n;};
const client=createPointsClient('',{get:async()=>localStorage.getItem('pointsToken'),set:async token=>localStorage.setItem('pointsToken',token)});
const forms=new Map();let account,markets=[],streamer,token,refreshing=false,refreshAgain=false,watchBusy=false;
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
  renderUserConsole($('#history'),account,markets,async key=>{await client.claim({key,requestId:crypto.randomUUID()});await refresh();});
  renderStreamerConsole($('#streamer'),streamer);
  $('#streamer-wallet').textContent=account?.wallet??'Conectá Phantom primero';$('#assign-streamer').disabled=!account?.wallet;

}
async function refresh(){
  if(refreshing){refreshAgain=true;return;}refreshing=true;const focused=document.activeElement;const key=focused?.matches('input[aria-label="Puntos a apostar"]')?focused.closest('[data-market-key]')?.dataset.marketKey:null;
  try{const [nextMarkets,nextAccount,channels]=await Promise.all([client.request('/api/markets'),client.me().catch(()=>undefined),client.request('/api/channels')]);markets=nextMarkets;account=nextAccount;streamer=account?.wallet?await client.authRequest('/api/streamer/console'):undefined;render();renderFollowedChannels(channels);$('#source-status').textContent=channels.sourceError?`Twitch: ${channels.sourceError}`:'';if(key)document.querySelector(`[data-market-key="${CSS.escape(key)}"] input`)?.focus();}
  catch(e){account=undefined;document.querySelectorAll('.points-bet,.points-claim').forEach(b=>b.disabled=true);$('#notice').textContent=e.message;}
  finally{refreshing=false;if(refreshAgain){refreshAgain=false;void refresh();}}
}
function renderFollowedChannels(data){
  $('#watched').replaceChildren(...data.channels.map(channel=>{
    const info=data.details?.find(c=>c.channel===channel)??{},row=el('article',null,'watch-row');row.dataset.channel=channel;
    const copy=el('div',null,'streamer-copy'),link=el('a',`@${channel}`);link.href=`https://www.twitch.tv/${channel}`;link.target='_blank';link.rel='noopener';copy.append(link);
    if(info.displayName&&info.displayName.toLowerCase()!==channel)copy.append(el('span',info.displayName,'streamer-display-name'));
    const status=el('span',info.error?'Error al consultar':info.checkedAt?info.live?'En vivo':'Fuera de línea':'Consultando Twitch…','streamer-status');status.dataset.state=info.error?'error':info.checkedAt?info.live?'live':'offline':'loading';copy.append(status);
    if(info.error)copy.append(el('p',info.error,'streamer-error'));else if(info.live){if(info.title)copy.append(el('p',info.title));if(info.viewers!=null)copy.append(el('p',`${number(info.viewers)} espectadores`,'fine'));}
    const predictions=markets.filter(m=>!m.demo&&m.prediction.channel===channel),active=predictions.filter(m=>['open','locked'].includes(m.phase));
    if(info.checkedAt&&!info.error)copy.append(el('p',active.length?`${active.length} ${active.length===1?'predicción en curso':'predicciones en curso'}`:'Sin predicciones en curso','fine'));
    if(info.checkedAt)copy.append(el('small',`Última consulta: ${new Date(info.checkedAt).toLocaleTimeString('es-AR')}`));
    const actions=el('div',null,'streamer-actions');if(predictions.length){const view=el('a','Ver predicciones →');view.href='#markets';actions.append(view);}
    const stop=el('button','Dejar de seguir','secondary');stop.setAttribute('aria-label',`Dejar de seguir @${channel}`);stop.onclick=async()=>{stop.disabled=true;try{await authorizeDelete(channel);await refresh();}catch(e){$('#watch-feedback').textContent=e.message;stop.disabled=false;}};actions.append(stop);row.append(copy,actions);return row;
  }));
  if(!data.channels.length)$('#watched').append(el('p','Todavía no seguís streamers. Agregá un @usuario para consultar Twitch.','empty'));
}
async function authorizeDelete(channel){await admin('/api/sync',{});const response=await fetch(`/api/channels/${encodeURIComponent(channel)}`,{method:'DELETE',headers:{Authorization:`Bearer ${token}`}});if(!response.ok)throw new Error('No se pudo dejar de seguir el canal');}
async function operate(fn){try{$('#notice').textContent='Guardando…';await fn();$('#notice').textContent='Listo.';await refresh();}catch(e){$('#notice').textContent=e.message;}}
$('#demo').onclick=()=>void operate(async()=>{await admin('/api/demo',{});});
$('#watch-form').onsubmit=async e=>{e.preventDefault();if(watchBusy)return;watchBusy=true;$('#watch-submit').disabled=true;$('#watch-submit').textContent='Consultando Twitch…';$('#watch-feedback').textContent='';try{const channel=$('#watch-channel').value.trim().replace(/^@/,'').toLowerCase();await admin('/api/channels',{channel});$('#watch-channel').value='';$('#watch-feedback').textContent=`@${channel} agregado. Sus datos se actualizan automáticamente.`;await refresh();}catch(e){$('#watch-feedback').textContent=e.message;}finally{watchBusy=false;$('#watch-submit').disabled=false;$('#watch-submit').textContent='Agregar streamer';}};
$('#streamer-form').onsubmit=e=>{e.preventDefault();void operate(async()=>{if(!account?.wallet)throw new Error('Conectá Phantom primero');await admin('/api/operator/streamers',{channel:$('#streamer-channel').value.trim().replace(/^@/,''),wallet:account.wallet});const channel=$('#streamer-channel').value.trim().replace(/^@/,'').toLowerCase();if(channel!=='demo_streamer')await admin('/api/channels',{channel});location.hash='streamer';});};
$('#login-link').onclick=async e=>{e.preventDefault();const config=await client.request('/api/auth/config');location.href=`${config.origin}/onboarding`;};
const twitchParams=new URLSearchParams(location.search);if(twitchParams.has('twitch_ticket')||twitchParams.has('twitch_error')){history.replaceState(null,'','/#streamer');const ticket=twitchParams.get('twitch_ticket');if(ticket){try{await client.authRequest('/api/twitch/complete',{ticket});$('#notice').textContent='Cuenta de Twitch conectada. Tu canal ya está vinculado a tu wallet.';}catch(e){$('#notice').textContent=e.message;}}else $('#notice').textContent=twitchParams.get('twitch_error')==='canceled'?'Cancelaste la conexión con Twitch. Podés volver a intentar.':'No se pudo completar la conexión. Volvé a conectar Twitch.';}
await refresh();setInterval(refresh,5000);
setInterval(()=>{for(const m of markets)if(Date.parse(m.prediction.createdAt)+m.prediction.predictionWindowSeconds*1000<=Date.now()||(!m.demo&&Date.now()-Date.parse(m.sourceCheckedAt)>=30000))document.querySelectorAll(`[data-market-key="${CSS.escape(m.key)}"] .points-bet`).forEach(b=>b.disabled=true);},1000);

function setView(){
  const view=['history','streamer','channels','connect'].includes(location.hash.slice(1))?location.hash.slice(1):'markets';
  const operator=view==='channels'||view==='connect';
  $('#market-section').hidden=view!=='markets';$('#history').hidden=view!=='history';$('#streamer').hidden=view!=='streamer';$('#channels').hidden=!operator;$('#streamer-channels').hidden=!(operator||view==='streamer');
  document.querySelectorAll('[data-view]').forEach(a=>{if(a.dataset.view===(operator?'channels':view))a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  $('#page-title').textContent=operator?'Canales y extensión':view==='streamer'?'Consola del streamer':view==='history'?'Mis apuestas':'Predicciones de la comunidad';
  $('#page-description').textContent=operator?'Elegí qué comunidades seguir. Cada apuesta abierta se replica automáticamente.':view==='streamer'?'Estado y resultados de los mercados de tus canales, sincronizados con Twitch.':view==='history'?'Tus puntos en juego y los resultados de tus apuestas.':'Las mismas opciones del stream. Un pozo propio para jugar.';
}
window.addEventListener('hashchange',setView);setView();
