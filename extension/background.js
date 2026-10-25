import { TWITCH_CLIENT_ID, TWITCH_QUERY } from './twitch.js';
const inflight = new Map();
async function poll(channel) {
  const config = await chrome.storage.local.get(['bridgeUrl', 'bridgeToken']);
  if (!config.bridgeToken) throw new Error('Conectá la extensión desde el panel local.');
  const response = await fetch('https://gql.twitch.tv/gql', {
    method: 'POST', headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: TWITCH_QUERY, variables: { channel } }), signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`Twitch HTTP ${response.status}`);
  const json = await response.json();
  if (json.errors) throw new Error(json.errors.map(e => e.message).join('; '));
  if (!json.data?.channel) throw new Error('Canal no encontrado');
  const predictions = json.data.channel.activePredictionEvents;
  for (const p of predictions) {
    if (p.status !== 'ACTIVE') continue;
    const result = await fetch(`${config.bridgeUrl || 'http://twitch-predict.localhost:1356'}/api/predictions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.bridgeToken}` },
      body: JSON.stringify({ ...p, channel, winningOutcomeId: p.winningOutcome?.id ?? null }), signal: AbortSignal.timeout(15000),
    });
    if (!result.ok) throw new Error((await result.json()).error || `Bridge HTTP ${result.status}`);
  }
  await chrome.storage.local.set({ lastPoll: { channel, at: new Date().toISOString(), count: predictions.length }, lastError: null });
}
chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  if (message.type !== 'POLL_CHANNEL' || !/^[a-zA-Z0-9_]{1,40}$/.test(message.channel)) return;
  const task = inflight.get(message.channel) || poll(message.channel).finally(() => inflight.delete(message.channel));
  inflight.set(message.channel, task);
  task.then(() => reply({ ok: true })).catch(async error => { await chrome.storage.local.set({ lastError: error.message }); reply({ error: error.message }); });
  return true;
});
chrome.runtime.onMessageExternal.addListener((message, sender, reply) => {
  if (!sender.url || new URL(sender.url).hostname !== 'twitch-predict.localhost' || message.type !== 'PAIR') return;
  const url = new URL(message.bridgeUrl);
  if (url.hostname !== 'twitch-predict.localhost' || typeof message.token !== 'string' || message.token.length !== 64) return;
  chrome.storage.local.set({ bridgeUrl: url.origin, bridgeToken: message.token }).then(() => reply({ ok: true }));
  return true;
});
