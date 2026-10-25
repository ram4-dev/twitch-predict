const $ = selector => document.querySelector(selector);
let token;
async function authorize() { if (!token) { const r = await fetch('/api/pair'); if (!r.ok) throw new Error('No se pudo conectar al puente'); token = (await r.json()).token; } return token; }
async function refresh() {
  try {
    const [health, markets] = await Promise.all([fetch('/api/health').then(r => r.json()), fetch('/api/markets').then(r => r.json())]);
    $('#network').textContent = health.network === 'localnet' ? 'Localnet · contratos Doppler' : 'Solana devnet';
    $('#wallet').textContent = health.wallet ? `${health.wallet.slice(0,6)}…${health.wallet.slice(-6)}` : 'RPC no disponible';
    $('#wallet').title = health.wallet ?? '';
    $('#balance').textContent = health.balance !== undefined ? `${health.balance.toFixed(3)} SOL` : '—';
    $('#count').textContent = markets.filter(m => m.phase === 'open').length;
    $('#total').textContent = String(markets.length).padStart(2, '0');
    $('#notice').textContent = health.error || (health.balance < .1 ? 'La wallet necesita SOL de prueba para crear mercados. La dirección completa aparece al pasar sobre la wallet.' : '');
    if (!markets.length) return;
    $('#markets').replaceChildren(...markets.map(m => {
      const article = document.createElement('article'); article.className = 'market-card'; article.dataset.key = m.key;
      const head = document.createElement('div'); head.className = 'market-head';
      const channel = document.createElement('span'); channel.className = 'channel'; channel.textContent = `${m.prediction.id.startsWith('demo-') ? 'DEMO · ' : ''}@${m.prediction.channel}`;
      const status = document.createElement('span'); status.className = `pill ${m.phase === 'failed' ? 'error' : ''}`; status.textContent = ({creating:'Creando en cadena',open:'Creado en cadena',failed:'Error de creación'})[m.phase];
      head.append(channel, status); article.append(head);
      const title = document.createElement('h3'); title.textContent = m.prediction.title; article.append(title);
      const options = document.createElement('div'); options.className = 'outcomes';
      m.outcomes.forEach(o => { const option = document.createElement('div'); option.className = 'outcome'; option.textContent = o.title; option.title = o.mint ?? 'Token pendiente'; options.append(option); }); article.append(options);
      const details = document.createElement('p'); details.className = 'details';
      details.textContent = `${m.network} · ${m.signatures.length} transacciones · ${new Date(m.createdAt).toLocaleTimeString()} · `;
      if (m.market) { const a = document.createElement('a'); a.textContent = `Mercado ${m.market.slice(0,8)}… ↗`; a.href = `https://explorer.solana.com/address/${m.market}?cluster=${m.network === 'localnet' ? 'custom&customUrl=http%3A%2F%2F127.0.0.1%3A8899' : 'devnet'}`; a.target = '_blank'; a.rel = 'noopener'; details.append(a); } article.append(details);
      if (m.error) { const error = document.createElement('p'); error.className = 'error details'; error.textContent = m.error; article.append(error); }
      return article;
    }));
  } catch (e) { $('#notice').textContent = e.message; }
}
$('#demo').onclick = async () => {
  $('#demo').disabled = true;
  try { const response = await fetch('/api/demo', {method:'POST',headers:{Authorization:`Bearer ${await authorize()}`}}); const data = await response.json(); if (!response.ok) throw new Error(data.error); await refresh(); }
  catch (e) { $('#notice').textContent = e.message; }
  finally { $('#demo').disabled = false; }
};
$('#pair').onsubmit = async event => {
  event.preventDefault();
  try {
    if (!globalThis.chrome?.runtime?.sendMessage) throw new Error('Abrí este panel en Chrome después de cargar la extensión.');
    const result = await chrome.runtime.sendMessage($('#extensionId').value.trim(), { type:'PAIR', bridgeUrl:location.origin, token:await authorize() });
    if (!result?.ok) throw new Error('La extensión no respondió. Revisá el ID.');
    $('#paired').textContent = 'Conectada. Abrí Twitch y mantené el canal abierto.';
  } catch (e) { $('#paired').textContent = e.message; }
};
refresh(); setInterval(refresh, 2500);
