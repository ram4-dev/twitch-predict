import { TWITCH_CLIENT_ID, TWITCH_QUERY } from './twitch.js';
import { parseTwitchPrediction, isOpen } from './model.js';
const inflight = new Map();
const defaultBridge = 'http://twitch-predict.localhost:1356';
const channelKey = channel => `channel:${channel.toLowerCase()}`;
async function saveSnapshot(channel, snapshot) { await chrome.storage.local.set({ [channelKey(channel)]: snapshot }); }
async function mirrorPrediction(prediction, previous, config) {
  if (!config.bridgeToken) return { state: 'unpaired', error: 'Conectá la extensión una vez para activar la creación automática.' };
  if (!isOpen(prediction) && !previous?.address && !previous?.key) return { state: 'closed', error: null };
  try {
    const response = await fetch(`${config.bridgeUrl || defaultBridge}/api/predictions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.bridgeToken}` },
      body: JSON.stringify(prediction), signal: AbortSignal.timeout(12000),
    });
    if (response.status === 401) return { ...previous, state: 'unpaired', error: 'Reconectá la extensión al puente.' };
    const data = await response.json(); if (!response.ok) throw new Error(data.error || `Puente HTTP ${response.status}`);
    return { state: data.phase, key: data.key, address: data.market, network: data.network, signatures: data.signatures?.length ?? 0, error: data.error ?? null, checkedAt: new Date().toISOString() };
  } catch (e) { return { ...previous, state: 'offline', error: e.name === 'TimeoutError' ? 'El puente tardó demasiado. Se reintentará la consulta.' : `Puente no disponible: ${e.message}` }; }
}
async function poll(channel, tabId) {
  const key = channelKey(channel);
  const stored = await chrome.storage.local.get([key, 'bridgeUrl', 'bridgeToken']);
  const previous = stored[key];
  let snapshot;
  try {
    const health=await fetch(`${stored.bridgeUrl||defaultBridge}/api/health`,{signal:AbortSignal.timeout(5000)}).then(r=>r.ok?r.json():null).catch(()=>null);
    if(health?.marketMode==='byte'){
      const response=await fetch(`${stored.bridgeUrl||defaultBridge}/api/byte/markets`,{signal:AbortSignal.timeout(25000)});
      const result=await response.json();if(!response.ok)throw new Error(result.error||'No se pudo consultar byte');
      const byteMarkets=result.markets.filter(m=>m.notes?.channel===channel);
      await saveSnapshot(channel,{channel,fetchedAt:new Date().toISOString(),sourceError:null,predictions:[],byteMarkets,mode:'byte'});
      await chrome.storage.local.set({lastPoll:{channel,at:new Date().toISOString(),count:byteMarkets.length},lastError:null});
      if(Number.isInteger(tabId))try{await chrome.action.setBadgeText({tabId,text:byteMarkets.filter(m=>m.bettable).length?String(byteMarkets.filter(m=>m.bettable).length):''});}catch{/* The tab may have closed. */}
      return;
    }
    const response = await fetch('https://gql.twitch.tv/gql', {
      method: 'POST', headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: TWITCH_QUERY, variables: { channel } }), signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error(`Twitch HTTP ${response.status}`);
    const json = await response.json();
    if (json.errors) throw new Error(json.errors.map(e => e.message).join('; '));
    if (!json.data?.channel || !Array.isArray(json.data.channel.activePredictionEvents)) throw new Error('Twitch no devolvió las predicciones del canal.');
    const predictions = json.data.channel.activePredictionEvents.map(p => {
      const prediction = parseTwitchPrediction(p, channel);
      return { prediction, market: previous?.predictions?.find(old => old.prediction.id === prediction.id)?.market ?? { state: stored.bridgeToken ? 'pending' : 'unpaired' } };
    });
    snapshot = { channel, fetchedAt: new Date().toISOString(), sourceError: null, predictions };
    // Show Twitch information immediately, even while the bridge is offline or creating.
    await saveSnapshot(channel, snapshot);
    await chrome.storage.local.set({ lastPoll: { channel, at: snapshot.fetchedAt, count: predictions.length }, lastError: null });
    if (Number.isInteger(tabId)) {
      const count = predictions.filter(p => isOpen(p.prediction)).length;
      try { await chrome.action.setBadgeText({ tabId, text: count ? String(count) : '' }); await chrome.action.setBadgeBackgroundColor({ tabId, color: '#a7f370' }); } catch { /* A closed tab must not invalidate its source snapshot. */ }
    }
    await Promise.all(predictions.map(async item => { item.market = await mirrorPrediction(item.prediction, item.market, stored); }));
    await saveSnapshot(channel, snapshot);
  } catch (e) {
    await saveSnapshot(channel, { ...(previous ?? { channel, predictions: [] }), sourceError: e.message, errorAt: new Date().toISOString() });
    await chrome.storage.local.set({ lastError: e.message });
    throw e;
  }
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message.type !== 'POLL_CHANNEL' || !/^[a-zA-Z0-9_]{1,40}$/.test(message.channel)) return;
  const channel = message.channel.toLowerCase();
  const task = inflight.get(channel) || poll(channel, sender.tab?.id).finally(() => inflight.delete(channel));
  inflight.set(channel, task);
  task.then(() => reply({ ok: true })).catch(error => reply({ error: error.message }));
  return true;
});
chrome.runtime.onMessageExternal.addListener((message, sender, reply) => {
  if (!sender.url || !['twitch-predict.localhost','twitch-predict-byte.localhost'].includes(new URL(sender.url).hostname) || message.type !== 'PAIR') return;
  let url; try { url = new URL(message.bridgeUrl); } catch { return; }
  if (new URL(sender.url).origin!==url.origin || !['http:','https:'].includes(url.protocol) || !['twitch-predict.localhost','twitch-predict-byte.localhost'].includes(url.hostname) || typeof message.token !== 'string' || !/^[a-f0-9]{64}$/.test(message.token)) return;
  chrome.storage.local.set({ bridgeUrl: url.origin, bridgeToken: message.token }).then(() => reply({ ok: true }));
  return true;
});

let authStart;
function appUrl(value){const u=new URL(value||defaultBridge);if(!['http:','https:'].includes(u.protocol)||!['twitch-predict.localhost','twitch-predict-byte.localhost'].includes(u.hostname))throw new Error('URL de la app inválida');return u.origin;}
async function beginSession(base){
  const state=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
  const response=await fetch(`${base}/api/auth/extension/start`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({extensionId:chrome.runtime.id,state}),signal:AbortSignal.timeout(12000)});
  const result=await response.json();if(!response.ok)throw new Error(result.error||'No se pudo iniciar la vinculación');
  await chrome.storage.local.set({pendingAuth:{flowId:result.flowId,state,base,expiresAt:result.expiresAt}});
  return {ok:true,flowId:result.flowId};
}
chrome.runtime.onMessageExternal.addListener((message,sender,reply)=>{
  if(message.type!=='LINK_SESSION')return;
  void (async()=>{
    const base=appUrl(message.bridgeUrl);if(!sender.url||new URL(sender.url).origin!==base)throw new Error('Origen de vinculación inválido');
    reply(await beginSession(base));
  })().catch(e=>reply({error:e.message}));return true;
});
async function startAuth(){
  const stored=await chrome.storage.local.get(['bridgeUrl','pointsToken','pendingAuth']);
  let base=appUrl(stored.bridgeUrl);
  const health=await fetch(`${base}/api/health`,{signal:AbortSignal.timeout(5000)}).then(r=>r.ok?r.json():null).catch(()=>null);
  if(health?.marketMode==='byte'){await chrome.tabs.create({url:`${base}/byte`});return {ok:true};}
  const config=await fetch(`${base}/api/auth/config`,{signal:AbortSignal.timeout(8000)});if(!config.ok)throw new Error('No se pudo abrir el inicio de sesión');base=appUrl((await config.json()).origin);
  const state=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
  const response=await fetch(`${base}/api/auth/extension/start`,{method:'POST',headers:{'Content-Type':'application/json',...(stored.pointsToken?{Authorization:`Bearer ${stored.pointsToken}`}:{})},body:JSON.stringify({extensionId:chrome.runtime.id,state}),signal:AbortSignal.timeout(12000)});
  const result=await response.json();if(!response.ok)throw new Error(result.error||'No se pudo abrir el acceso');
  await chrome.storage.local.set({pendingAuth:{flowId:result.flowId,state,base,expiresAt:result.expiresAt}});
  await chrome.tabs.create({url:`${base}/onboarding#flow=${result.flowId}`});return {ok:true};
}
chrome.runtime.onMessage.addListener((message,_sender,reply)=>{
  if(message.type!=='CONNECT_PHANTOM')return;
  const task=authStart??=startAuth().finally(()=>{authStart=undefined;});task.then(reply).catch(e=>reply({error:e.message}));return true;
});
chrome.runtime.onInstalled.addListener(({reason})=>{if(reason==='install')void (authStart??=startAuth().finally(()=>{authStart=undefined;})).catch(e=>chrome.storage.local.set({authError:e.message}));});
chrome.runtime.onMessageExternal.addListener((message,sender,reply)=>{
  if(message.type!=='AUTH_COMPLETE')return;
  void (async()=>{
    const stored=await chrome.storage.local.get(['pendingAuth','pointsToken','lastAuthFlow']);
    const pending=stored.pendingAuth;
    if(stored.lastAuthFlow===message.flowId&&stored.pointsToken){reply({ok:true});return;}
    if(!pending||pending.flowId!==message.flowId||Date.parse(pending.expiresAt)<=Date.now()||!sender.url||new URL(sender.url).origin!==pending.base)throw new Error('El acceso no coincide con esta extensión. Volvé a conectar Phantom.');
    if(typeof message.code!=='string'||!/^[a-f0-9]{64}$/.test(message.code))throw new Error('Código de acceso inválido');
    const response=await fetch(`${pending.base}/api/auth/extension/complete`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({flowId:pending.flowId,state:pending.state,extensionId:chrome.runtime.id,code:message.code}),signal:AbortSignal.timeout(12000)});
    const result=await response.json();if(!response.ok)throw new Error(result.error||'No se pudo vincular la extensión');
    await chrome.storage.local.set({...(stored.pointsToken?{previousPointsToken:stored.pointsToken}:{}),pointsToken:result.token,walletAddress:result.account.wallet,bridgeToken:result.bridgeToken,bridgeUrl:pending.base,pendingAuth:null,lastAuthFlow:message.flowId,authError:null});
    reply({ok:true});
  })().catch(e=>reply({error:e.message}));return true;
});

chrome.runtime.onMessageExternal.addListener((message,sender,reply)=>{
  if(message.type!=='CONNECT_PHANTOM'||!sender.url)return;
  const origin=new URL(sender.url);if(!['http:','https:'].includes(origin.protocol)||origin.hostname!=='twitch-predict.localhost')return;
  const task=authStart??=startAuth().finally(()=>{authStart=undefined;});task.then(reply).catch(e=>reply({error:e.message}));return true;
});
