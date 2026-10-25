(() => {
  let running = false;
  async function poll() {
    if (running) return;
    const channel = location.pathname.split('/').filter(Boolean)[0];
    if (!channel || /^(directory|downloads|settings|videos|inventory|wallet|subscriptions|search|p|jobs|turbo)$/i.test(channel)) return;
    running = true;
    try { await chrome.runtime.sendMessage({ type: 'POLL_CHANNEL', channel }); } catch { /* Extension reloaded or bridge offline; next tick retries. */ }
    finally { running = false; }
  }
  setInterval(poll, 5000); poll();
})();
