import { countdown, isOpen, pointShare, formatNumber, totalMetric, statusLabel } from './model.js';
const $ = selector => document.querySelector(selector);
const el = (tag, value, className) => { const node = document.createElement(tag); if (value != null) node.textContent = value; if (className) node.className = className; return node; };
let selectedChannel = '';
let state = {};
let snapshot;
const defaultBridge = 'http://twitch-predict.localhost:1356';
function bridgeUrl() { try { const u = new URL(state.bridgeUrl || defaultBridge); return u.protocol === 'http:' && u.hostname === 'twitch-predict.localhost' ? u.origin : defaultBridge; } catch { return defaultBridge; } }
function time(value) { return value ? new Date(value).toLocaleString('es-AR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit' }) : 'Sin informar'; }
function fact(list, title, value) { list.append(el('dt', title), el('dd', value ?? 'Sin informar')); }
function marketView(market, prediction) {
  const box = el('section', null, 'market');
  const head = el('div', null, 'market-head');
  const labels = { open:'Mercado creado automáticamente', creating:'Creando el mercado…', pending:'Preparando creación automática…', unpaired:'Creación pendiente de conexión', offline:'Mercado sin conexión', failed:'No se pudo crear el mercado', closed:'Ventana de creación cerrada', resolved:'Mercado resuelto', void:'Mercado con reembolsos', resolving:'Liquidando mercado…' };
  head.append(el('strong', labels[market?.state] || 'Esperando al puente'));
  if (market?.network) head.append(el('span', market.network === 'localnet' ? 'PRUEBA LOCAL' : market.network.toUpperCase(), 'network'));
  box.append(head);
  if (market?.address) {
    box.append(el('p', `${market.signatures ?? 0} transacciones de creación · mismo título y resultados`, 'market-summary'));
    const link = el('a', 'Ver mercado ↗'); link.href = `${bridgeUrl()}/#markets`; link.target = '_blank'; link.rel = 'noopener'; box.append(link);
  } else if (market?.state === 'closed') box.append(el('p', 'Esta apuesta ya no acepta puntos. La creación automática se activa mientras está abierta.'));
  else box.append(el('p', isOpen(prediction) ? 'Se crea una sola vez por apuesta, sin confirmación manual.' : 'La apuesta de Twitch está cerrada.'));
  if (market?.error) box.append(el('p', market.error, 'market-error'));
  return box;
}
function predictionCard(item) {
  const p = item.prediction;
  const card = el('article', null, 'prediction'); card.dataset.predictionId = p.id;
  const line = el('div', null, 'topline');
  const open = isOpen(p);
  const status = el('span', `● ${open ? 'Abierta en Twitch' : p.status === 'ACTIVE' ? 'Cerrada por tiempo' : statusLabel(p.status)}`, `status ${open ? '' : 'closed'}`); status.dataset.state = p.id; line.append(status);
  const timer = el('span', countdown(p), 'countdown'); timer.dataset.timer = p.id; line.append(timer);
  card.append(line, el('h1', p.title));
  for (const [index, outcome] of p.outcomes.entries()) {
    const color = outcome.color === 'PINK' || (!outcome.color && index % 2 === 1) ? 'pink' : 'blue';
    const option = el('section', null, `outcome ${color}`); option.dataset.outcomeId = outcome.id;
    const title = el('div', null, 'outcome-head'); const share = pointShare(outcome, p.outcomes);
    title.append(el('strong', outcome.title), el('span', share == null ? '—' : `${share.toLocaleString('es-AR')}%`, 'percentage'));
    option.append(title, el('p', `${formatNumber(outcome.totalPoints)} puntos · ${formatNumber(outcome.totalUsers)} participantes`));
    const track = el('div', null, 'track'); const fill = el('div', null, 'fill'); fill.style.width = `${share ?? 0}%`; track.append(fill); option.append(track); card.append(option);
  }
  card.append(el('p', 'Los porcentajes muestran la distribución de puntos en Twitch.', 'distribution-note'));
  const totals = el('div', null, 'totals');
  for (const [label, metric] of [['Puntos en juego','totalPoints'],['Participaciones','totalUsers']]) { const cell = el('div'); cell.append(el('b', formatNumber(totalMetric(p.outcomes, metric))), el('span', label)); totals.append(cell); }
  card.append(totals);
  if (p.winningOutcomeId) { const winner = p.outcomes.find(o => o.id === p.winningOutcomeId); card.append(el('p', `Ganador en Twitch: ${winner?.title ?? p.winningOutcomeId}`, 'winner')); }
  card.append(el('p', 'MERCADO AUTOMÁTICO', 'section-label'), marketView(item.market, p));
  const details = el('details'); details.append(el('summary', 'Horarios e identificadores'));
  const list = el('dl'); fact(list, 'Canal', `@${p.channel}`); fact(list, 'Predicción de Twitch', p.id);
  fact(list, 'Inicio', time(p.createdAt)); fact(list, 'Cierre previsto', time(new Date(Date.parse(p.createdAt) + p.predictionWindowSeconds * 1000).toISOString()));
  fact(list, 'Ventana de apuestas', `${p.predictionWindowSeconds} segundos`); fact(list, 'Bloqueada en Twitch', p.lockedAt ? time(p.lockedAt) : 'Todavía no'); fact(list, 'Finalizada en Twitch', p.endedAt ? time(p.endedAt) : 'Todavía no');
  for (const o of p.outcomes) fact(list, `ID · ${o.title}`, o.id);
  if (item.market?.address) fact(list, 'Dirección del mercado', item.market.address);
  details.append(list); card.append(details); return card;
}
function tick() {
  const age = snapshot?.fetchedAt ? Math.max(0, Math.floor((Date.now() - Date.parse(snapshot.fetchedAt)) / 1000)) : null;
  $('#freshness').textContent = age == null ? 'Esperando la primera consulta…' : age < 15 ? `Actualizado ${age < 2 ? 'ahora' : `hace ${age} s`}` : `Datos de hace ${age} s · esperando actualización`;
  for (const item of snapshot?.predictions ?? []) { const timer = document.querySelector(`[data-timer="${CSS.escape(item.prediction.id)}"]`); if (timer) timer.textContent = countdown(item.prediction); const status = document.querySelector(`[data-state="${CSS.escape(item.prediction.id)}"]`); if (status) { const open = isOpen(item.prediction); status.textContent = `● ${open ? 'Abierta en Twitch' : item.prediction.status === 'ACTIVE' ? 'Cerrada por tiempo' : statusLabel(item.prediction.status)}`; status.classList.toggle('closed', !open); } }
}
async function load() {
  state = await chrome.storage.local.get(null);
  const channels = Object.keys(state).filter(k => k.startsWith('channel:')).map(k => k.slice(8)).sort();
  if (!selectedChannel) selectedChannel = state.lastPoll?.channel || channels[0] || '';
  if (selectedChannel && !channels.includes(selectedChannel)) channels.push(selectedChannel);
  if (channels.join('|') !== [...$('#channel').options].map(o => o.value).filter(Boolean).join('|')) {
    $('#channel').replaceChildren(...(channels.length ? channels.map(channel => { const option = el('option', `@${channel}`); option.value = channel; return option; }) : [el('option', 'Esperando un canal…')]));
  }
  $('#channel').value = selectedChannel;
  snapshot = state[`channel:${selectedChannel}`];
  $('#predictions').replaceChildren(...(snapshot?.predictions ?? []).map(predictionCard));
  $('#empty').hidden = !!snapshot?.predictions?.length;
  $('#empty-copy').textContent = selectedChannel ? `No hay apuestas disponibles en @${selectedChannel}. La próxima aparecerá acá automáticamente mientras el canal esté abierto.` : 'Abrí un canal de Twitch. Cuando empiece una apuesta por puntos, aparecerá acá y se creará su mercado automáticamente.';
  $('#source-error').hidden = !snapshot?.sourceError;
  $('#source-error').textContent = snapshot?.sourceError ? `No se pudo actualizar Twitch: ${snapshot.sourceError}. Los datos visibles son de la última consulta correcta.` : '';
  const unpaired = !state.bridgeToken || snapshot?.predictions?.some(p => p.market?.state === 'unpaired');
  $('#setup').hidden = !unpaired;
  $('#extension-id').textContent = chrome.runtime.id;
  $('#connect').href = `${bridgeUrl()}/#connect`; $('#dashboard').href = bridgeUrl();
  $('#connection').textContent = unpaired ? 'Sin conectar' : 'Auto';
  tick();
}
async function requestPoll() {
  if (!selectedChannel) return;
  $('#refresh').disabled = true;
  try { await chrome.runtime.sendMessage({ type:'POLL_CHANNEL', channel:selectedChannel }); await load(); }
  catch (e) { $('#source-error').hidden = false; $('#source-error').textContent = e.message; }
  finally { $('#refresh').disabled = false; }
}
$('#channel').onchange = async () => { selectedChannel = $('#channel').value; await load(); void requestPoll(); };
$('#refresh').onclick = requestPoll;
chrome.storage.onChanged.addListener((_changes, area) => { if (area === 'local') void load(); });
try {
  const [active] = await chrome.tabs.query({ active:true, currentWindow:true });
  const url = active?.url ? new URL(active.url) : null;
  if (url?.hostname === 'www.twitch.tv' && /^\/[a-zA-Z0-9_]{1,40}\/?$/.test(url.pathname)) selectedChannel = url.pathname.split('/')[1].toLowerCase();
} catch { /* A popup opened as a full tab uses the last selected channel. */ }
await load(); void requestPoll(); setInterval(tick, 1000); setInterval(requestPoll, 5000);
