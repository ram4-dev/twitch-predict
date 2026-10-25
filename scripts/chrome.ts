import { chromium } from '@playwright/test';
import { resolve } from 'node:path';
const base = process.env.APP_URL ?? 'http://twitch-predict.localhost:1356';
const extension = resolve('extension');
const channel = process.argv[2] ?? 'xarola_';
if (!/^[a-zA-Z0-9_]{1,40}$/.test(channel)) throw new Error('Invalid Twitch channel');
const context = await chromium.launchPersistentContext(resolve('data/chromium'), {
  channel: 'chromium', headless: false,
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
});
const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
const extensionId = new URL(worker.url()).host;
const dashboard = context.pages()[0] ?? await context.newPage();
await dashboard.goto(base);
const result = await dashboard.evaluate(async id => {
  const response = await fetch('/api/pair');
  if (!response.ok) throw new Error('Could not pair bridge');
  const { token } = await response.json();
  return (globalThis as unknown as {chrome:{runtime:{sendMessage(id:string,message:unknown):Promise<{ok:boolean}>}}}).chrome.runtime.sendMessage(id, { type: 'PAIR', bridgeUrl: location.origin, token });
}, extensionId);
if (!result?.ok) throw new Error('Extension pairing failed');
const twitch = await context.newPage(); await twitch.goto(`https://www.twitch.tv/${channel}`);
console.log(`Chromium abierto con extensión conectada. Canal: ${channel}. Panel: ${base}`);
process.on('SIGINT', () => { void context.close(); });
await new Promise<void>(resolve => context.on('close', () => resolve()));
