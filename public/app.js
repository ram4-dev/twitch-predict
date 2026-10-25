const $ = selector => document.querySelector(selector);
let token;
let busy = false;
let selectedKey;
let selectedOutcome;
let pendingQuote;
let lastFingerprint = '';
async function authorize() { if (!token) { const r = await fetch('/api/pair'); if (!r.ok) throw new Error('No se pudo conectar al puente'); token = (await r.json()).token; } return token; }
async function api(path, body) {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await authorize()}` }, body: JSON.stringify(body) });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Falló la operación'); return result;
}
function text(tag, value, className) { const node = document.createElement(tag); node.textContent = value; if (className) node.className = className; return node; }
async function refresh() {
  try {
    const [health, markets] = await Promise.all([fetch('/api/health').then(r => r.json()), fetch('/api/markets').then(r => r.json())]);
    $('#network').textContent = health.network === 'localnet' ? 'Solana local · fondos de prueba' : 'Solana devnet';
    $('#wallet').textContent = health.wallet ? `${health.wallet.slice(0,6)}…${health.wallet.slice(-6)}` : 'RPC no disponible'; $('#wallet').title = health.wallet ?? '';
    $('#balance').textContent = health.balance !== undefined ? `${health.balance.toFixed(3)} SOL` : '—';
    $('#count').textContent = markets.filter(m => ['open', 'resolved', 'void', 'resolving'].includes(m.phase)).length;
    $('#total').textContent = String(markets.length).padStart(2, '0');
    if (health.error) $('#notice').textContent = health.error;
    const fingerprint = JSON.stringify(markets);
    if (fingerprint !== lastFingerprint && markets.length) {
      lastFingerprint = fingerprint;
      $('#markets').replaceChildren(...markets.map(m => {
        const article = text('article', '', 'market-card'); article.dataset.key = m.key;
        const head = text('div', '', 'market-head');
        head.append(text('span', `${m.prediction.id.startsWith('demo-') ? 'DEMO · ' : ''}@${m.prediction.channel}`, 'channel'), text('span', ({creating:'Creando en cadena',open:'Creado en cadena',resolving:'Liquidando',resolved:'Resuelto',void:'Reembolso',failed:'Error de creación'})[m.phase], `pill ${m.phase === 'failed' ? 'error' : ''}`));
        article.append(head, text('h3', m.prediction.title));
        const options = text('div', '', 'outcomes'); m.outcomes.forEach(o => { const node = text('div', `${m.winnerId === o.id ? '✓ ' : ''}${o.title}`, 'outcome'); node.title = o.mint ?? 'Token pendiente'; options.append(node); }); article.append(options);
        const details = text('p', `${m.network} · ${m.signatures.length} transacciones de creación · `, 'details');
        if (m.market) { const a = text('a', `Mercado ${m.market.slice(0,8)}… ↗`); a.href = `https://explorer.solana.com/address/${m.market}?cluster=${m.network === 'localnet' ? 'custom&customUrl=http%3A%2F%2F127.0.0.1%3A8899' : 'devnet'}`; a.target = '_blank'; a.rel = 'noopener'; details.append(a); } article.append(details);
        if (m.error) article.append(text('p', m.error, 'error details'));
        if (m.tradingError) article.append(text('p', m.tradingError, 'error details'));
        if (['open', 'resolved', 'void', 'resolving'].includes(m.phase)) {
          const button = text('button', 'Apostar / resolver / cobrar ↗', 'trade-open'); button.onclick = () => openTrade(m); article.append(button);
          const actions = m.actions ?? []; const recent = actions.at(-1);
          if (recent) article.append(text('p', `${({buy:'Apuesta',resolve:'Resolución',claim:'Cobro',refund:'Reembolso'})[recent.kind]}: ${recent.status === 'done' ? 'confirmada' : recent.status === 'pending' ? 'pendiente' : 'fallida'}${recent.paidLamports ? ` · ${(Number(recent.paidLamports)/1e9).toFixed(6)} SOL` : ''}`, 'details'));
        }
        return article;
      }));
    }
  } catch (e) { $('#notice').textContent = e.message; }
}
async function operation(fn) {
  if (busy) return; busy = true;
  document.querySelectorAll('#trade-dialog button:not([data-close]), #trade-dialog input, #trade-dialog select').forEach(b => b.disabled = true);
  $('#trade-message').textContent = 'Esperando confirmación en Solana…';
  try { await fn(); await loadPosition(); await refresh(); }
  catch (e) { $('#trade-message').textContent = e.message; }
  finally { busy = false; document.querySelectorAll('#trade-dialog button:not([data-close]), #trade-dialog input, #trade-dialog select').forEach(b => b.disabled = false); }
}
async function openTrade(m) {
  if (busy) return;
  selectedKey = m.key; pendingQuote = null; selectedOutcome = m.outcomes[0].id;
  $('#trade-title').textContent = m.prediction.title; $('#trade-channel').textContent = `@${m.prediction.channel} · ${m.network}`;
  $('#trade-options').replaceChildren(...m.outcomes.map(o => {
    const button = text('button', o.title, 'pick-outcome'); button.dataset.outcomeId = o.id; button.setAttribute('aria-pressed', String(o.id === selectedOutcome));
    button.onclick = () => { selectedOutcome = o.id; pendingQuote = null; $('#quote-result').textContent = ''; $('#confirm-bet').hidden = true; document.querySelectorAll('.pick-outcome').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.outcomeId === selectedOutcome))); }; return button;
  }));
  $('#resolve-confirm').checked = false;
  $('#resolve-winner').replaceChildren(...m.outcomes.map(o => { const option = text('option', o.title); option.value = o.id; return option; }));
  $('#quote-result').textContent = ''; $('#confirm-bet').hidden = true; $('#trade-message').textContent = ''; $('#claim-result').textContent = '';
  $('#trade-dialog').showModal(); await loadPosition();
}
async function loadPosition() {
  const p = await api('/api/trade/position', {key:selectedKey});
  $('#participant-address').textContent = `${p.wallet.address.slice(0,8)}…${p.wallet.address.slice(-8)}`;
  $('#participant-balance').textContent = `${p.wallet.balance.toFixed(6)} SOL de prueba`;
  $('#position-tokens').textContent = p.balances.map(b => { const button = document.querySelector(`[data-outcome-id="${b.id}"]`); return `${button?.textContent}: ${(Number(b.tokens)/1e6).toFixed(4)} tokens`; }).join(' · ');
  $('#claimable').textContent = `${(Number(p.claimableLamports)/1e9).toFixed(6)} SOL`;
  $('#pot').textContent = `${(Number(p.potLamports)/1e9).toFixed(6)} SOL`;
  $('#trade-phase').textContent = ({trading:p.canBet ? 'Apuestas abiertas' : 'Apuestas cerradas',claimable:'Resuelto · listo para cobrar',void:'Mercado sin ganador con tokens · reembolsos',settling:'Liquidando',registering:'Registrando'})[p.protocol.phase];
  $('#quote-bet').hidden = !p.canBet; $('#resolve-submit').hidden = p.protocol.phase !== 'trading';
  $('#claim-submit').hidden = !p.protocol.canClaim && !p.protocol.canRefund;
  $('#fund-participant').hidden = $('#network').textContent.includes('devnet');
}
$('#demo').onclick = async () => { $('#demo').disabled = true; try { await api('/api/demo',{}); await refresh(); } catch(e){$('#notice').textContent=e.message;} finally{$('#demo').disabled=false;} };
$('#pair').onsubmit = async event => { event.preventDefault(); try { if (!globalThis.chrome?.runtime?.sendMessage) throw new Error('Abrí este panel en Chrome después de cargar la extensión.'); const result=await chrome.runtime.sendMessage($('#extensionId').value.trim(),{type:'PAIR',bridgeUrl:location.origin,token:await authorize()}); if(!result?.ok)throw new Error('La extensión no respondió. Revisá el ID.'); $('#paired').textContent='Conectada. Abrí Twitch y mantené el canal abierto.'; }catch(e){$('#paired').textContent=e.message;} };
$('#trade-close').onclick = () => { if(!busy)$('#trade-dialog').close(); };
$('#trade-dialog').addEventListener('cancel', e => {if(busy)e.preventDefault();});
$('#fund-participant').onclick = () => operation(async()=>{await api('/api/faucet',{});$('#trade-message').textContent='Recibiste 2 SOL de prueba del faucet local.';});
$('#quote-bet').onclick = () => operation(async()=>{
  pendingQuote=await api('/api/trade/quote',{key:selectedKey,outcomeId:selectedOutcome,amount:$('#stake').value});
  $('#quote-result').textContent=`Por ${Number(pendingQuote.amount)/1e9} SOL recibís aproximadamente ${(Number(pendingQuote.expectedTokens)/1e6).toFixed(4)} tokens; mínimo ${(Number(pendingQuote.minTokens)/1e6).toFixed(4)}. Tolerancia: 0.5%. Cotización válida por 30 segundos.`;
  $('#confirm-bet').hidden=false;$('#trade-message').textContent='Revisá el importe y confirmá la apuesta.';
});
$('#stake').oninput=()=>{pendingQuote=null;$('#confirm-bet').hidden=true;};
$('#confirm-bet').onclick = () => operation(async()=>{if(!pendingQuote)throw new Error('Primero cotizá la apuesta');const result=await api('/api/trade/buy',{key:selectedKey,quoteId:pendingQuote.id,requestId:crypto.randomUUID()});if(result.status!=='done')throw new Error(result.error||'Operación pendiente');pendingQuote=null;$('#confirm-bet').hidden=true;$('#trade-message').textContent='Apuesta confirmada en Solana.';});
$('#resolve-submit').onclick = () => operation(async()=>{if(!$('#resolve-confirm').checked)throw new Error('Confirmá que vas a fijar el ganador manualmente.');await api('/api/trade/resolve',{key:selectedKey,outcomeId:$('#resolve-winner').value,requestId:crypto.randomUUID()});$('#trade-message').textContent='Ganador fijado y fondo liquidado en Solana.';});
$('#claim-submit').onclick = () => operation(async()=>{const result=await api('/api/trade/claim',{key:selectedKey,requestId:crypto.randomUUID()});$('#claim-result').textContent=`Cobro confirmado: ${(Number(result.paidLamports)/1e9).toFixed(6)} SOL.`;$('#trade-message').textContent='Los fondos volvieron a la wallet de participante.';});
refresh();setInterval(refresh,2500);
