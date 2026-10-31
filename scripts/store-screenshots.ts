import { chromium } from '@playwright/test';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { BYTE_PROGRAM } from '../src/byte-model.js';

const out = resolve('/opt/cursor/artifacts');
const origin = 'http://twitch-predict.localhost:1356';
const wallet = '11111111111111111111111111111111';
const channel = 'fixture_stream';
const now = Date.now();
const config = { enabled: true, sol: { programId: BYTE_PROGRAM, cluster: 'devnet', maxBet: 1_000_000_000, maxPool: 50_000_000_000 } };
const chain = '11111111111111111111111111111111';

function market(patch: Record<string, unknown>) {
  return {
    id: 'pm_store_yesno', title: 'Will they win this round?', options: ['Yes', 'No'], currency: 'sol', status: 'open', bettable: true, resolvable: false,
    openMs: now - 120_000, closeMs: now + 20 * 60_000, chain: { market: chain, settled: false }, pools: [25_000_000, 15_000_000], total: 40_000_000, bettors: 6, winner: null, invalidReason: null,
    notes: { channel, rules: 'The winner is the verified Twitch result for this round.', createdAt: new Date(now - 120_000).toISOString(), twitch: { predictionId: 'pred-yesno', closesAt: now + 20 * 60_000, checkedAt: now, status: 'ACTIVE' } },
    ...patch,
  };
}

const twitchHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>fixture_stream - Twitch</title>
<style>
  html,body{margin:0;height:100%;background:#0e0e10;color:#efeff1;font:15px/1.4 Inter,system-ui,sans-serif}
  .shell{display:grid;grid-template-columns:1fr 320px;height:100%}
  .stage{display:flex;flex-direction:column;min-width:0}
  .video{flex:1;margin:16px;border-radius:8px;background:radial-gradient(circle at 30% 40%,#2a2438,#09090b 70%);display:flex;align-items:flex-end;padding:18px}
  .live{display:inline-flex;align-items:center;gap:8px;background:#eb0400;color:#fff;font-weight:700;font-size:12px;letter-spacing:.04em;padding:4px 8px;border-radius:4px}
  .live i{width:8px;height:8px;border-radius:50%;background:#fff}
  header{display:flex;gap:14px;align-items:center;padding:14px 18px;border-top:1px solid #26262c}
  .avatar{width:52px;height:52px;border-radius:50%;background:#9147ff}
  h1{margin:0;font-size:18px} p{margin:2px 0 0;color:#adadb8;font-size:13px}
  aside{background:#18181b;border-left:1px solid #26262c;display:flex;flex-direction:column}
  aside h2{margin:0;padding:14px 16px;font-size:14px;border-bottom:1px solid #26262c}
  .chat{flex:1;padding:14px 16px;color:#adadb8;font-size:13px}
  .chat div{margin:0 0 12px}
</style></head><body><div class="shell"><section class="stage"><div class="video"><span class="live"><i></i>LIVE</span></div>
<header><span class="avatar"></span><div><h1>fixture_stream</h1><p>Ranked match · 1,284 viewers</p></div></header></section>
<aside><h2>Stream chat</h2><div class="chat"><div>mod: predictions are open on this stream</div><div>viewer: watching the round</div><div>viewer: glhf</div></div></aside></div></body></html>`;

async function frame(context: Awaited<ReturnType<typeof chromium.launchPersistentContext>>, popupShot: Buffer, name: string) {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.setContent(`<!doctype html><style>html,body{margin:0;width:1280px;height:800px;overflow:hidden;background:#000}img{position:absolute;display:block}img.bg{inset:0;width:1280px;height:800px}img.pop{top:72px;right:36px;width:700px;height:600px;border-radius:12px;box-shadow:0 24px 80px rgba(0,0,0,.55)}</style><img class="bg" id="bg"><img class="pop" id="pop">`, { waitUntil: 'load' });
  const host = await (await context.pages().find(p => p.url().includes('twitch.tv')))!.screenshot({ type: 'png' });
  await page.evaluate(({ host, pop }) => {
    (document.querySelector('#bg') as HTMLImageElement).src = host;
    (document.querySelector('#pop') as HTMLImageElement).src = pop;
  }, { host: `data:image/png;base64,${host.toString('base64')}`, pop: `data:image/png;base64,${popupShot.toString('base64')}` });
  await page.locator('#pop').evaluate(el => (el as HTMLImageElement).decode());
  const file = resolve(out, name);
  await page.screenshot({ path: file, clip: { x: 0, y: 0, width: 1280, height: 800 } });
  await page.close();
  return file;
}

const profile = await mkdtemp(`${tmpdir()}/plot-store-shots-`);
await mkdir(out, { recursive: true });
const extensionPath = resolve('extension');
const context = await chromium.launchPersistentContext(profile, { headless: false, viewport: { width: 1280, height: 800 }, args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] });
let mode: 'byte' | 'offchain' = 'byte';
let markets = [market({})];
let pointsMarkets: unknown[] = [];
let account: Record<string, unknown> = { id: 'fixture', wallet, balance: 10000, bets: [], streamerChannels: [] };
try {
  await context.route(`${origin}/**`, route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/health') return route.fulfill({ json: { ok: true, marketMode: mode, network: 'devnet' } });
    if (path === '/api/byte/markets') return route.fulfill({ json: { markets, predictions: [] } });
    if (path === '/api/byte/config') return route.fulfill({ json: config });
    if (path === '/api/points/me') return route.fulfill({ json: account });
    if (path === '/api/markets') return route.fulfill({ json: pointsMarkets });
    if (path === '/api/byte/twitch/watch') return route.fulfill({ json: { channel, predictions: [] } });
    if (path === '/api/byte/rpc') return route.fulfill({ json: { jsonrpc: '2.0', id: 1, result: { context: { slot: 1 }, value: 2_000_000_000 } } });
    return route.fulfill({ status: 204, body: '' });
  });
  await context.route(`https://www.twitch.tv/${channel}`, route => route.fulfill({ contentType: 'text/html', body: twitchHtml }));
  await context.route('https://gql.twitch.tv/**', route => route.fulfill({ json: { data: { channel: { activePredictionEvents: [] } } } }));
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  const twitch = await context.newPage();
  await twitch.setViewportSize({ width: 1280, height: 800 });
  await twitch.goto(`https://www.twitch.tv/${channel}`);
  const receipt = { signature: 'sigstoreexample', marketId: 'pm_store_yesno', title: 'Will they win this round?', wallet, option: 0, amount: '25000000', status: 'confirmed', createdAt: new Date().toISOString(), lastValidBlockHeight: 1 };
  await worker.evaluate(async data => { await (globalThis as unknown as { chrome: { storage: { local: { set(value: unknown): Promise<void> } } } }).chrome.storage.local.set(data); }, { pointsToken: 'fixture', bridgeUrl: origin, lastPoll: { channel }, byteReceipts: [receipt] });
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 700, height: 600 });
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await popup.getByRole('heading', { name: 'Will they win this round?', exact: true }).waitFor();
  await popup.getByRole('button', { name: 'Stake on Yes', exact: true }).waitFor();
  const files = [await frame(context, await popup.screenshot({ type: 'png' }), 'screenshot_open_yes_no.png')];
  await popup.getByRole('button', { name: '0.05', exact: true }).click();
  await popup.getByLabel('Amount in SOL devnet').fill('0.05');
  files.push(await frame(context, await popup.screenshot({ type: 'png' }), 'screenshot_staking_flow.png'));
  await worker.evaluate(async receipt => { await (globalThis as unknown as { chrome: { storage: { local: { set(value: unknown): Promise<void> } } } }).chrome.storage.local.set({ byteOperation: { id: 'op-store', marketId: 'pm_store_yesno', status: 'confirmed', receipt } }); }, receipt);
  await popup.reload();
  await popup.getByRole('heading', { name: 'Your devnet stakes', exact: true }).waitFor();
  await popup.locator('#history').scrollIntoViewIfNeeded();
  files.push(await frame(context, await popup.screenshot({ type: 'png' }), 'screenshot_active_stake.png'));
  markets = [market({ status: 'resolved', bettable: false, winner: 0, chain: { market: chain, settled: true }, pools: [40_000_000, 15_000_000], total: 55_000_000, bettors: 8 })];
  await worker.evaluate(async () => { await (globalThis as unknown as { chrome: { storage: { local: { set(value: unknown): Promise<void> } } } }).chrome.storage.local.set({ byteOperation: { id: 'op-store', marketId: 'pm_store_yesno', status: 'confirmed', receipt: { signature: 'sigstoreexample' } } }); });
  await popup.reload();
  await popup.getByText('Result:', { exact: false }).waitFor();
  await popup.getByText('Yes', { exact: true }).first().waitFor();
  files.push(await frame(context, await popup.screenshot({ type: 'png' }), 'screenshot_resolved_sol.png'));
  mode = 'offchain';
  const prediction = { id: 'points-yesno', channel, title: 'Will they win this round?', status: 'RESOLVED', createdAt: new Date().toISOString(), predictionWindowSeconds: 600, outcomes: [{ id: 'yes', title: 'Yes' }, { id: 'no', title: 'No' }] };
  pointsMarkets = [{ key: 'points-yesno', prediction, phase: 'resolved', winnerId: 'yes', demo: false, sourceFresh: true, canBet: false, totalPoints: 1000, totalBets: 4, participants: 4, outcomes: [{ id: 'yes', title: 'Yes', points: 700, bets: 3, share: 70 }, { id: 'no', title: 'No', points: 300, bets: 1, share: 30 }], reason: 'Result confirmed by Twitch' }];
  account = { id: 'fixture', wallet, balance: 9750, bets: [{ marketKey: 'points-yesno', outcomeId: 'yes', amount: 250, payout: 530, claimed: false, title: prediction.title, outcome: 'Yes', phase: 'resolved' }], streamerChannels: [] };
  await worker.evaluate(async prediction => { await (globalThis as unknown as { chrome: { storage: { local: { set(value: unknown): Promise<void> } } } }).chrome.storage.local.set({ [`channel:${prediction.channel}`]: { fetchedAt: new Date().toISOString(), predictions: [{ prediction }] } }); }, prediction);
  await popup.reload();
  await popup.locator('.resolution-count[data-complete="true"]').waitFor();
  await popup.getByText('+280', { exact: false }).waitFor();
  await popup.getByText('Total payout', { exact: true }).waitFor();
  files.push(await frame(context, await popup.screenshot({ type: 'png' }), 'screenshot_resolved_points.png'));
  console.log(files.join('\n'));
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true });
}
