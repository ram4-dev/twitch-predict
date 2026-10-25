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
  if (!sender.url || new URL(sender.url).hostname !== 'twitch-predict.localhost' || message.type !== 'PAIR') return;
  let url; try { url = new URL(message.bridgeUrl); } catch { return; }
  if (url.protocol !== 'http:' || url.hostname !== 'twitch-predict.localhost' || typeof message.token !== 'string' || !/^[a-f0-9]{64}$/.test(message.token)) return;
  chrome.storage.local.set({ bridgeUrl: url.origin, bridgeToken: message.token }).then(() => reply({ ok: true }));
  return true;
});
