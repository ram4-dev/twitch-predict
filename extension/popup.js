import { countdown, isOpen, pointShare, formatNumber, totalMetric, statusLabel } from './model.js';
import {disposePointsViews,createPointsClient,bettingView,performPointsAction,number} from './points-ui.js';
import './surfaces.js';
import {byteMarketView,disposeByteViews} from './byte-ui.js';
const $=s=>document.querySelector(s);
const el=(tag,value,className)=>{const node=document.createElement(tag);if(value!=null)node.textContent=value;if(className)node.className=className;return node;};
const defaultBridge='http://twitch-predict.localhost:1356';
let selectedChannel='',state={},snapshot,markets=[],account,client,clientBase,byteMode=false;
const forms=new Map();let loading=false,again=false;
function bridgeUrl(){try{const u=new URL(state.bridgeUrl||defaultBridge);return ['http:','https:'].includes(u.protocol)&&['twitch-predict.localhost','twitch-predict-byte.localhost'].includes(u.hostname)?u.origin:defaultBridge;}catch{return defaultBridge;}}
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
  const card=el('article',null,'prediction');card.dataset.predictionId=p.id;
  const line=el('div',null,'topline');line.append(el('span',`@${p.channel}`,'status'));const timer=el('span',countdown(p),'countdown');timer.dataset.timer=p.id;line.append(timer);card.append(line,el('h1',p.title));
  if(market)card.append(bettingView(market,account?.wallet?account:undefined,action=>performPointsAction(action,client,load),forms));
  else{const pending=el('section',null,'market');const labels={unpaired:'Conectá la extensión para crear la copia',offline:'Mercado sin conexión',closed:'La predicción ya está cerrada',failed:'No se pudo crear el mercado'};pending.append(el('strong',labels[item?.market?.state]||'Creando la copia automáticamente…'));if(item?.market?.error)pending.append(el('p',item.market.error,'market-error'));card.append(pending);}
  card.append(sourceView(p));return card;
}
function render(){
  disposePointsViews();
  const current=snapshot?.predictions??[];const visible=markets.filter(m=>m.prediction.channel===selectedChannel&&(current.some(p=>p.prediction.id===m.prediction.id)||['open','locked'].includes(m.phase)||account?.bets.some(b=>b.marketKey===m.key)));
  const cards=current.map(item=>predictionCard(item.prediction,markets.find(m=>m.prediction.id===item.prediction.id&&m.prediction.channel===selectedChannel),item));
  for(const m of visible)if(!current.some(p=>p.prediction.id===m.prediction.id))cards.push(predictionCard(m.prediction,m));
  $('#predictions').replaceChildren(...cards);$('#empty').hidden=!!cards.length;
  $('#empty-copy').textContent=selectedChannel?`No hay apuestas disponibles en @${selectedChannel}. La próxima aparecerá automáticamente.`:'Abrí un canal de Twitch. La próxima apuesta se copiará automáticamente.';
  $('#account-name').textContent=account?.wallet?`${account.wallet.slice(0,4)}…${account.wallet.slice(-4)}`:'Conectá Phantom';$('#own-balance').textContent=account?number(account.balance):'—';
  const history=$('#history');history.replaceChildren();const bets=account?.bets??[];
  if(bets.length){history.append(el('h2','Tus apuestas recientes'));for(const bet of bets.slice(-8).reverse()){const row=el('div',null,'history-row');row.append(el('strong',bet.title),el('span',`${bet.outcome} · ${number(bet.amount)} pts · ${bet.claimed?'Cobrado':bet.payout?`${number(bet.payout)} pts para cobrar`:['resolved','void'].includes(bet.phase)?'Finalizada':'En juego'}`));if(bet.payout&&!bet.claimed){const market=markets.find(m=>m.key===bet.marketKey);const button=el('button','Ver cobro');button.onclick=()=>{selectedChannel=market.prediction.channel;void load();};row.append(button);}history.append(row);}}
  tick();
}
function tick(){
  if(byteMode)return;
  const age=snapshot?.fetchedAt?Math.max(0,Math.floor((Date.now()-Date.parse(snapshot.fetchedAt))/1000)):null;
  $('#freshness').textContent=age==null?'Esperando consulta de Twitch…':`Twitch actualizado hace ${age} s`;
  for(const p of [...(snapshot?.predictions??[]).map(i=>i.prediction),...markets.map(m=>m.prediction)]){const timer=document.querySelector(`[data-timer="${CSS.escape(p.id)}"]`);if(timer)timer.textContent=countdown(p);}
  // Deadlines disable betting immediately, without waiting for the next network poll.
  for(const m of markets){if(!isOpen(m.prediction)||(!m.demo&&Date.now()-Date.parse(m.sourceCheckedAt)>=30000))document.querySelectorAll(`[data-market-key="${CSS.escape(m.key)}"] .points-bet`).forEach(b=>{b.disabled=true;});}
}
async function load(){
  if(loading){again=true;return;}loading=true;
  const focused=document.activeElement;const restore=focused?.matches('input[aria-label="Puntos a apostar"]')?focused.closest('[data-market-key]')?.dataset.marketKey:null;
  try{
    state=await chrome.storage.local.get(null);const base=bridgeUrl();
    const health=await fetch(`${base}/api/health`,{signal:AbortSignal.timeout(5000)}).then(r=>r.ok?r.json():null).catch(()=>null);byteMode=health?.marketMode==='byte';
    if(byteMode){
      const response=await fetch(`${base}/api/byte/markets`,{signal:AbortSignal.timeout(25000)});const data=await response.json();
      const byteMarkets=response.ok?data.markets:[];
      const config=await fetch(`${base}/api/byte/config`,{signal:AbortSignal.timeout(10000)}).then(r=>r.ok?r.json():undefined).catch(()=>undefined);
      const channels=[...new Set([...Object.keys(state).filter(k=>k.startsWith('channel:')).map(k=>k.slice(8)),...byteMarkets.map(m=>m.notes?.channel).filter(Boolean)])].sort();
      if(!selectedChannel)selectedChannel=state.lastPoll?.channel||channels[0]||'';if(selectedChannel&&!channels.includes(selectedChannel))channels.push(selectedChannel);
      $('#channel').replaceChildren(...channels.map(c=>{const option=el('option',`@${c}`);option.value=c;return option;}));$('#channel').value=selectedChannel;
      account=undefined;
      if(state.pointsToken)account=await fetch(`${base}/api/points/me`,{headers:{Authorization:`Bearer ${state.pointsToken}`},signal:AbortSignal.timeout(10000)}).then(r=>r.ok?r.json():undefined).catch(()=>undefined);
      $('#wallet').hidden=!account?.wallet;$('#login').hidden=!!account?.wallet;$('#history').replaceChildren();$('#points-error').hidden=response.ok&&!!config;$('#points-error').textContent=!response.ok?data.error:!config?'No se pudo consultar la configuración de Byte.':'';
      if(account?.wallet){
        $('#account-name').textContent=`${account.wallet.slice(0,5)}…${account.wallet.slice(-5)}`;$('#own-balance').nextElementSibling.textContent='SOL devnet';$('#own-balance').textContent='—';
        const balance=await fetch(`${base}/api/byte/rpc`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getBalance',params:[account.wallet]}),signal:AbortSignal.timeout(10000)}).then(r=>r.ok?r.json():undefined).catch(()=>undefined);
        if(Number.isSafeInteger(balance?.result?.value))$('#own-balance').textContent=new Intl.NumberFormat('es-AR',{maximumFractionDigits:9}).format(balance.result.value/1e9);
      }

      $('#source-error').hidden=true;$('#connection').textContent='SOL devnet';$('#freshness').textContent='Mercados de byte · sin dinero real';
      const visible=byteMarkets.filter(m=>!selectedChannel||m.notes?.channel===selectedChannel);
      disposePointsViews();disposeByteViews();
      const cards=visible.map(m=>byteMarketView(m,config,base));
      $('#predictions').replaceChildren(...cards);$('#empty').hidden=!!cards.length;$('#empty-copy').textContent='El operador crea los mercados de este canal desde el panel. Las apuestas se firman en la web con Phantom.';
      $('#dashboard').href=base;$('#user-console').href=`${base}/byte?view=history`;$('#streamer-console').hidden=true;
      return;
    }
    disposeByteViews();
    $('#wallet').hidden=false;$('#own-balance').nextElementSibling.textContent='puntos internos';
    if(!client||clientBase!==base){clientBase=base;client=createPointsClient(base,{get:async()=> (await chrome.storage.local.get('pointsToken')).pointsToken,set:async token=>chrome.storage.local.set({pointsToken:token})});}
    try{[markets,account]=await Promise.all([client.request('/api/markets'),client.me()]);$('#points-error').hidden=true;}catch(e){account=undefined;markets=[];$('#points-error').hidden=false;$('#points-error').textContent=`Puntos internos sin conexión: ${e.message}`;}
    const channels=[...new Set([...Object.keys(state).filter(k=>k.startsWith('channel:')).map(k=>k.slice(8)),...markets.map(m=>m.prediction.channel)])].sort();
    if(!selectedChannel)selectedChannel=state.lastPoll?.channel||channels[0]||'';if(selectedChannel&&!channels.includes(selectedChannel))channels.push(selectedChannel);
    $('#channel').replaceChildren(...(channels.length?channels.map(c=>{const o=el('option',`@${c}`);o.value=c;return o;}):[el('option','Esperando un canal…')]));$('#channel').value=selectedChannel;snapshot=state[`channel:${selectedChannel}`];
    $('#source-error').hidden=!snapshot?.sourceError;$('#source-error').textContent=snapshot?.sourceError?`No se pudo actualizar Twitch: ${snapshot.sourceError}`:'';
    $('#login').hidden=!!account?.wallet;$('#points-error').hidden=!account?.wallet||$('#points-error').hidden;$('#dashboard').href=base;$('#user-console').href=`${base}/#history`;$('#streamer-console').href=`${base}/#streamer`;$('#streamer-console').hidden=!account?.streamerChannels?.length;$('#connection').textContent=account?.wallet?'Conectada':'Sin conectar';render();
    if(restore)document.querySelector(`[data-market-key="${CSS.escape(restore)}"] input`)?.focus();
  }finally{loading=false;if(again){again=false;void load();}}
}
async function requestPoll(){if(!selectedChannel||selectedChannel==='demo_streamer'){await load();return;}$('#refresh').disabled=true;try{await chrome.runtime.sendMessage({type:'POLL_CHANNEL',channel:selectedChannel});await load();}catch(e){$('#source-error').hidden=false;$('#source-error').textContent=e.message;}finally{$('#refresh').disabled=false;}}
$('#connect-phantom').onclick=async()=>{const button=$('#connect-phantom');button.disabled=true;$('#auth-message').textContent='Abriendo el acceso con Phantom…';try{const result=await chrome.runtime.sendMessage({type:'CONNECT_PHANTOM'});if(result?.error)throw new Error(result.error);}catch(e){$('#auth-message').textContent=e.message;}finally{button.disabled=false;}};
$('#channel').onchange=async()=>{selectedChannel=$('#channel').value;await load();void requestPoll();};$('#refresh').onclick=requestPoll;
chrome.storage.onChanged.addListener((_changes,area)=>{if(area==='local')void load();});
try{const [active]=await chrome.tabs.query({active:true,currentWindow:true});const url=active?.url?new URL(active.url):null;if(url?.hostname==='www.twitch.tv'&&/^\/[a-zA-Z0-9_]{1,40}\/?$/.test(url.pathname))selectedChannel=url.pathname.split('/')[1].toLowerCase();}catch{/* Use remembered channel when no Twitch tab is selected. */}
await load();void requestPoll();setInterval(tick,1000);setInterval(requestPoll,5000);
