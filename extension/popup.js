import {defaultBridge,isAppOrigin} from './app-config.js';
import {popupScope,matchingCache,cacheAllowsBet,cachedBalance,reconcileBytePredictions} from './popup-cache.js';
import { countdown, isOpen, pointShare, formatNumber, totalMetric, statusLabel } from './model.js';
import {disposePointsViews,createPointsClient,bettingView,performPointsAction,number} from './points-ui.js';
import './surfaces.js';
import {byteMarketView,disposeByteViews} from './byte-ui.js';
const $=s=>document.querySelector(s);
const el=(tag,value,className)=>{const node=document.createElement(tag);if(value!=null)node.textContent=value;if(className)node.className=className;return node;};
let selectedChannel='',state={},snapshot,markets=[],account,client,clientBase,byteMode=false;
const polling=new Set();
const settledCards=new Map();
const forms=new Map();let loading=false,again=false,forceAgain=false,byteCache,lastRefresh=0,byteError='',contextDirty=false;
function bridgeUrl(){try{const u=new URL(state.bridgeUrl||defaultBridge);return isAppOrigin(u.href)?u.origin:defaultBridge;}catch{return defaultBridge;}}
function time(value){return value?new Date(value).toLocaleString('es-AR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}):'Sin informar';}
function fact(list,title,value){list.append(el('dt',title),el('dd',value??'Sin informar'));}
function sourceView(p){
  const details=el('details',null,'source-reference');details.append(el('summary','Ver puntos de Twitch y datos originales'));
  for(const [i,o] of p.outcomes.entries()){
    const option=el('section',null,`outcome ${i%2?'pink':'blue'}`);const head=el('div',null,'outcome-head');const share=pointShare(o,p.outcomes);
    head.append(el('strong',o.title),el('span',share==null?'—':`${share.toLocaleString('es-AR')}%`,'percentage'));
    option.append(head,el('p',`${formatNumber(o.totalPoints)} puntos · ${formatNumber(o.totalUsers)} participantes`));details.append(option);
  }
  details.append(el('p',`${formatNumber(totalMetric(p.outcomes,'totalPoints'))} puntos de Twitch. El pozo y tu saldo de arriba usan puntos internos independientes.`,'distribution-note'));
  const list=el('dl');fact(list,'Predicción de Twitch',p.id);fact(list,'Inicio',time(p.createdAt));fact(list,'Cierre previsto',time(new Date(Date.parse(p.createdAt)+p.predictionWindowSeconds*1000).toISOString()));fact(list,'Estado en Twitch',statusLabel(p.status));details.append(list);return details;
}
function predictionCard(p,market,item){
  if(market&&['resolved','void'].includes(market.phase)){
    let settled=settledCards.get(market.key);
    if(!settled){settled=el('article',null,'prediction');settled.dataset.predictionId=p.id;settledCards.set(market.key,settled);}
    const view=bettingView(market,account?.wallet?account:undefined,action=>performPointsAction(action,client,load),forms,true);
    if(settled.firstElementChild!==view)settled.replaceChildren(view,sourceView(p));
    return settled;
  }
  const card=el('article',null,'prediction');card.dataset.predictionId=p.id;
  const line=el('div',null,'topline');line.append(el('span',`@${p.channel}`,'status'));const timer=el('span',countdown(p),'countdown');timer.dataset.timer=p.id;line.append(timer);card.append(line,el('h1',p.title));
  if(market)card.append(bettingView(market,account?.wallet?account:undefined,action=>performPointsAction(action,client,load),forms,true));
  else{const pending=el('section',null,'market');const labels={unpaired:'Conectá la extensión para crear la copia',offline:'Mercado sin conexión',closed:'La predicción ya está cerrada',failed:'No se pudo crear el mercado'};pending.append(el('strong',labels[item?.market?.state]||'Creando la copia automáticamente…'));if(item?.market?.error)pending.append(el('p',item.market.error,'market-error'));card.append(pending);}
  card.append(sourceView(p));return card;
}
function render(){
  disposePointsViews();
  const current=snapshot?.predictions??[];const visible=markets.filter(m=>m.prediction.channel===selectedChannel&&(current.some(p=>p.prediction.id===m.prediction.id)||['open','locked'].includes(m.phase)||account?.bets.some(b=>b.marketKey===m.key)));
  const cards=current.map(item=>predictionCard(item.prediction,markets.find(m=>m.prediction.id===item.prediction.id&&m.prediction.channel===selectedChannel),item));
  for(const m of visible)if(!current.some(p=>p.prediction.id===m.prediction.id))cards.push(predictionCard(m.prediction,m));
  reconcileCards(cards);for(const key of settledCards.keys())if(!markets.some(m=>m.key===key))settledCards.delete(key);$('#empty').hidden=!!cards.length;
  $('#empty-copy').textContent=selectedChannel?`No hay apuestas disponibles en @${selectedChannel}. La próxima aparecerá automáticamente.`:'Abrí un canal de Twitch. La próxima apuesta se copiará automáticamente.';
  $('#account-name').textContent=account?.wallet?`${account.wallet.slice(0,4)}…${account.wallet.slice(-4)}`:'Conectá Phantom';$('#own-balance').textContent=account?number(account.balance):'—';
  const history=$('#history');history.replaceChildren();const bets=account?.bets??[];
  if(bets.length){history.append(el('h2','Tus apuestas recientes'));for(const bet of bets.slice(-8).reverse()){const row=el('div',null,'history-row');row.append(el('strong',bet.title),el('span',`${bet.outcome} · ${number(bet.amount)} pts · ${bet.claimed?'Cobrado':bet.payout?`${number(bet.payout)} pts para cobrar`:['resolved','void'].includes(bet.phase)?'Finalizada':'En juego'}`));if(bet.payout&&!bet.claimed){const market=markets.find(m=>m.key===bet.marketKey);const button=el('button','Ver cobro');button.onclick=()=>{selectedChannel=market.prediction.channel;void load();};row.append(button);}history.append(row);}}
  tick();
}
function tick(){
  if(byteMode){if(byteCache&&!cacheAllowsBet(byteCache))renderByte();return;}
  const age=snapshot?.fetchedAt?Math.max(0,Math.floor((Date.now()-Date.parse(snapshot.fetchedAt))/1000)):null;
  $('#freshness').textContent=age==null?'Esperando consulta de Twitch…':`Twitch actualizado hace ${age} s`;
  for(const p of [...(snapshot?.predictions??[]).map(i=>i.prediction),...markets.map(m=>m.prediction)]){const timer=document.querySelector(`[data-timer="${CSS.escape(p.id)}"]`);if(timer)timer.textContent=countdown(p);}
  // Deadlines disable betting immediately, without waiting for the next network poll.
  for(const m of markets){if(!isOpen(m.prediction)||(!m.demo&&Date.now()-Date.parse(m.sourceCheckedAt)>=30000))document.querySelectorAll(`[data-market-key="${CSS.escape(m.key)}"] .points-bet`).forEach(b=>{b.disabled=true;});}
}
// Keep existing market nodes attached: moving every card on every poll also
// drops input focus and restarts visual effects, even when the data is unchanged.
function reconcileCards(cards){
 const parent=$('#predictions');
 cards.forEach((card,index)=>{if(parent.children[index]!==card)parent.insertBefore(card,parent.children[index]??null);});
 while(parent.children.length>cards.length)parent.lastElementChild.remove();
}
function renderByte(){
 if(!byteCache||contextDirty)return;
 const {markets:byteMarkets,config,base}=byteCache;
 const channels=[...new Set([...Object.keys(state).filter(k=>k.startsWith('channel:')).map(k=>k.slice(8)),...byteMarkets.map(m=>m.notes?.channel).filter(Boolean)])].sort();
 if(!selectedChannel)selectedChannel=state.lastPoll?.channel||channels[0]||'';if(selectedChannel&&!channels.includes(selectedChannel))channels.push(selectedChannel);
 const channelOptions=channels.join('|');if($('#channel').dataset.options!==channelOptions){$('#channel').replaceChildren(...channels.map(c=>{const option=el('option',`@${c}`);option.value=c;return option;}));$('#channel').dataset.options=channelOptions;}$('#channel').value=selectedChannel;
 account=byteCache.account;
 $('#wallet').hidden=!account?.wallet;$('#login').hidden=!!account?.wallet;
 $('#points-error').hidden=!byteError;$('#points-error').textContent=byteError;
 $('#account-name').textContent=account?.wallet?`${account.wallet.slice(0,5)}…${account.wallet.slice(-5)}`:'Conectá Phantom';
 $('#own-balance').nextElementSibling.textContent='SOL devnet';
 const balance=cachedBalance(byteCache);$('#own-balance').textContent=balance===undefined?'—':new Intl.NumberFormat('es-AR',{maximumFractionDigits:9}).format(balance/1e9);
 const history=$('#history');history.replaceChildren();
 const receipts=(state.byteReceipts??[]).filter(r=>r.wallet===account?.wallet);
 if(receipts.length){history.append(el('h2','Tus apuestas en devnet'));for(const r of receipts.slice(0,8)){const row=el('div',null,'history-row'),link=el('a','Ver transacción');link.href=`https://explorer.solana.com/tx/${r.signature}?cluster=devnet`;link.target='_blank';link.rel='noopener noreferrer';row.append(el('strong',r.title),el('span',`${new Intl.NumberFormat('es-AR',{maximumFractionDigits:9}).format(Number(r.amount)/1e9)} SOL · ${{pending:'Pendiente',confirmed:'Confirmada',failed:'Falló',expired:'Expiró'}[r.status]??r.status}`),link);history.append(row);}}
 snapshot=state[`channel:${selectedChannel}`];$('#source-error').hidden=!snapshot?.sourceError;$('#source-error').textContent=snapshot?.sourceError??'';$('#connection').textContent='SOL devnet';
 const fresh=cacheAllowsBet(byteCache);$('#freshness').textContent=fresh?'Mercados actualizados · SOL devnet':byteCache.marketsAt?'Mostrando datos guardados · actualizando…':'Consultando mercados de byte…';
 const visible=reconcileBytePredictions(byteMarkets,snapshot?.predictions??[],selectedChannel);
 disposePointsViews();disposeByteViews();
 const cards=visible.markets.map(m=>byteMarketView(m,config?{...config,enabled:config.enabled&&fresh}:undefined,state.byteOperation));
 for(const item of visible.predictions){
  const card=el('article',null,'prediction');card.dataset.predictionId=item.prediction.id;card.append(el('span',`@${selectedChannel} · Twitch · Ronda ${time(item.prediction.createdAt)}`,'status'),el('h1',item.prediction.title),el('p',item.prediction.outcomes.map(o=>o.title).join(' · ')),el('p',item.market?.error||'Creando réplica en Solana devnet…','warning'));cards.push(card);
 }
 reconcileCards(cards);$('#empty').hidden=!!cards.length;$('#empty-copy').textContent='El operador crea los mercados de este canal desde el panel. Elegí una opción para firmar con Phantom.';
 $('#dashboard').href=base;$('#user-console').href='#history';$('#user-console').target='_self';$('#login p').textContent='Conectá Phantom para apostar y seguir tus transacciones desde la extensión.';$('#streamer-console').hidden=true;
}
async function refreshByte(base,scope){
 lastRefresh=Date.now();byteError='';
 byteCache??={version:1,base,scope,markets:[],marketsAt:0,configAt:0};renderByte();
 const update=async patch=>{byteCache={...byteCache,...patch};renderByte();await chrome.storage.local.set({popupCache:byteCache});};
 const query=async(path,options={})=>{const response=await fetch(`${base}${path}`,{...options,signal:AbortSignal.timeout(10000)});const data=await response.json();if(!response.ok)throw Object.assign(new Error(data.error??'No se pudo actualizar.'),{status:response.status});return data;};
 const balance=async wallet=>{if(!wallet)return;const data=await query('/api/byte/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getBalance',params:[wallet]})});if(!Number.isSafeInteger(data?.result?.value)||data.result.value<0)throw new Error('No se pudo actualizar el saldo.');await update({balance:{wallet,lamports:data.result.value,at:Date.now()}});};
 const knownWallet=byteCache.account?.wallet;
 const results=await Promise.allSettled([
  query('/api/byte/markets').then(data=>update({markets:data.markets,marketsAt:Date.now()})),
  query('/api/byte/config').then(config=>update({config,configAt:Date.now()})),
  (async()=>{
   if(!state.pointsToken){await update({account:undefined,balance:undefined});return;}
   try{const account=await query('/api/points/me',{headers:{Authorization:`Bearer ${state.pointsToken}`}});await update({account:{wallet:account.wallet},...(!account.wallet?{balance:undefined}:{})});if(account.wallet!==knownWallet)await balance(account.wallet);}
   catch(error){if([400,401,403].includes(error.status))await update({account:undefined,balance:undefined});throw error;}
  })(),
  balance(knownWallet),
 ]);
 const failed=results.filter(r=>r.status==='rejected');
 byteError=failed.length?'No se pudieron actualizar todos los datos. Conservamos la última información disponible.':'';renderByte();
}
async function load(force=false){
  if(loading){again=true;forceAgain ||= force;return;}loading=true;
  const focused=document.activeElement;const restore=focused?.matches('input[aria-label="Puntos a apostar"]')?focused.closest('[data-market-key]')?.dataset.marketKey:null;
  try{
    state=await chrome.storage.local.get(null);contextDirty=false;const base=bridgeUrl(),scope=await popupScope(base,state.pointsToken);
    const stored=matchingCache(state.popupCache,base,scope);
    if(byteCache?.scope!==scope){byteCache=stored??(byteMode?{version:1,base,scope,markets:[],marketsAt:0,configAt:0}:undefined);lastRefresh=0;byteError='';}
    if(byteCache){byteMode=true;renderByte();if(!force&&Date.now()-lastRefresh<4000)return;}
    const health=await fetch(`${base}/api/health`,{signal:AbortSignal.timeout(5000)}).then(r=>r.ok?r.json():null).catch(()=>null);if(health)byteMode=health.marketMode==='byte';
    if(byteMode){
      if(['pending','signing'].includes(state.byteOperation?.status))void chrome.runtime.sendMessage({type:'BYTE_CHECK'}).catch(()=>{});
      await refreshByte(base,scope);return;
    }
    disposeByteViews();
    $('#wallet').hidden=false;$('#own-balance').nextElementSibling.textContent='puntos internos';
    if(!client||clientBase!==base){clientBase=base;client=createPointsClient(base,{get:async()=> (await chrome.storage.local.get('pointsToken')).pointsToken,set:async token=>chrome.storage.local.set({pointsToken:token})});}
    try{[markets,account]=await Promise.all([client.request('/api/markets'),client.me()]);$('#points-error').hidden=true;}catch(e){account=undefined;markets=[];$('#points-error').hidden=false;$('#points-error').textContent=`Puntos internos sin conexión: ${e.message}`;}
    const channels=[...new Set([...Object.keys(state).filter(k=>k.startsWith('channel:')).map(k=>k.slice(8)),...markets.map(m=>m.prediction.channel)])].sort();
    if(!selectedChannel)selectedChannel=state.lastPoll?.channel||channels[0]||'';if(selectedChannel&&!channels.includes(selectedChannel))channels.push(selectedChannel);
    $('#channel').replaceChildren(...(channels.length?channels.map(c=>{const o=el('option',`@${c}`);o.value=c;return o;}):[el('option','Esperando un canal…')]));$('#channel').value=selectedChannel;snapshot=state[`channel:${selectedChannel}`];
    $('#source-error').hidden=!snapshot?.sourceError;$('#source-error').textContent=snapshot?.sourceError?`No se pudo actualizar Twitch: ${snapshot.sourceError}`:'';
    $('#login').hidden=!!account?.wallet;$('#points-error').hidden=!account?.wallet||$('#points-error').hidden;$('#dashboard').href=base;$('#user-console').href=`${base}/#history`;$('#user-console').target='_blank';$('#streamer-console').href=`${base}/#streamer`;$('#streamer-console').hidden=!account?.streamerChannels?.length;$('#connection').textContent=account?.wallet?'Conectada':'Sin conectar';render();
    if(restore)document.querySelector(`[data-market-key="${CSS.escape(restore)}"] input`)?.focus();
  }finally{loading=false;if(again){const force=forceAgain;again=false;forceAgain=false;void load(force);}}
}
async function requestPoll(force=false){
 const channel=selectedChannel;
 if(!channel||channel==='demo_streamer'){await load(force);return;}
 if(polling.has(channel)){if(force)await load(true);return;}
 polling.add(channel);if(force)$('#refresh').disabled=true;
 try{const result=await chrome.runtime.sendMessage({type:'POLL_CHANNEL',channel});if(result?.error)throw new Error(result.error);}
 catch(e){$('#source-error').hidden=false;$('#source-error').textContent=e.message;}
 finally{polling.delete(channel);if(force)$('#refresh').disabled=false;await load(force);}
}
$('#connect-phantom').onclick=async()=>{const button=$('#connect-phantom');button.disabled=true;$('#auth-message').textContent='Abriendo el acceso con Phantom…';try{const result=await chrome.runtime.sendMessage({type:'CONNECT_PHANTOM'});if(result?.error)throw new Error(result.error);}catch(e){$('#auth-message').textContent=e.message;}finally{button.disabled=false;}};
$('#channel').onchange=async()=>{selectedChannel=$('#channel').value;await load();void requestPoll();};$('#refresh').onclick=()=>void requestPoll(true);
chrome.storage.onChanged.addListener((changes,area)=>{
 if(area!=='local')return;
 if(changes.pointsToken||changes.bridgeUrl){contextDirty=true;$('#wallet').hidden=true;$('#own-balance').textContent='—';$('#history').replaceChildren();document.querySelectorAll('.points-bet').forEach(button=>{button.disabled=true;});}
 if(Object.keys(changes).some(key=>key!=='popupCache'))void load();
});
try{const [active]=await chrome.tabs.query({active:true,currentWindow:true});const url=active?.url?new URL(active.url):null;if(url?.hostname==='www.twitch.tv'&&/^\/[a-zA-Z0-9_]{1,40}\/?$/.test(url.pathname))selectedChannel=url.pathname.split('/')[1].toLowerCase();}catch{/* Use remembered channel when no Twitch tab is selected. */}
setInterval(tick,1000);await load();void requestPoll();setInterval(()=>{void load();void requestPoll();},5000);
