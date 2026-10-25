chrome.storage.local.get(['bridgeToken', 'lastPoll', 'lastError']).then(s => {
  document.querySelector('#status').textContent = s.lastError || (s.lastPoll ? `${s.lastPoll.channel} · ${s.lastPoll.count} predicciones · última consulta ${new Date(s.lastPoll.at).toLocaleTimeString()}` : s.bridgeToken ? 'Conectado. Esperando un canal de Twitch.' : 'Falta conectar con el panel local.');
});
