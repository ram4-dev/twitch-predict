import { test, expect, chromium } from '@playwright/test';
import { resolve } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { address, createSolanaRpc } from '@solana/kit';
import { predictionMarkets } from '@whetstone-research/doppler-sdk/solana';
import { Connection, PublicKey } from '@solana/web3.js';
const url = process.env.APP_URL ?? 'http://twitch-predict.localhost:1356';
test.skip(process.env.MARKET_MODE !== 'solana', 'Legacy Solana checks require MARKET_MODE=solana');
test('dashboard creates a confirmed Doppler market with two actual SPL mints', async ({ page }) => {
  await page.goto('/'); await expect(page.getByRole('heading',{name:'Del stream al mercado.'})).toBeVisible();
  const health = await page.request.get('/api/health'); expect(health.ok()).toBeTruthy();
  const unauthorized = await page.request.post('/api/predictions',{data:{}}); expect(unauthorized.status()).toBe(401);
  const createdResponse = page.waitForResponse(r => r.url().endsWith('/api/demo') && r.request().method() === 'POST');
  await page.getByRole('button',{name:'Probar una predicción'}).click();
  const created = await (await createdResponse).json();
  // Select the exact new record; a previous successful card can still be visible
  // while the asynchronous POST and dashboard refresh are in flight.
  await expect(page.locator(`[data-key="${created.key}"] .pill`)).toHaveText('Creado en cadena', {timeout:90000});
  const markets = await page.request.get('/api/markets').then(r=>r.json());
  expect(markets.filter((m:{key:string}) => m.key === created.key)).toHaveLength(1);
  const record = markets.find((m:{key:string}) => m.key === created.key); expect(record.network).toBe('localnet'); expect(record.outcomes).toHaveLength(2);
  const rpc = new Connection(process.env.SOLANA_RPC_URL ?? 'http://127.0.0.1:8899','confirmed');
  const account = await rpc.getAccountInfo(new PublicKey(record.market)); expect(account?.owner.toBase58()).toBe('HYHdyy7QZg8Ucky9Z97xNtSCvrZxVNkeoney8xEPXjiZ');
  const view = await predictionMarkets.fetchPredictionMarket(createSolanaRpc(process.env.SOLANA_RPC_URL ?? 'http://127.0.0.1:8899'), address(record.market));
  expect(view.status.canBuy).toBe(true); expect(view.entries).toHaveLength(2);
  for (const outcome of record.outcomes) { const mint = await rpc.getParsedAccountInfo(new PublicKey(outcome.mint)); expect(mint.value?.owner.toBase58()).toBe('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'); }
  for (const signature of record.signatures) { const status = await rpc.getSignatureStatus(signature,{searchTransactionHistory:true}); expect(status.value?.err).toBeNull(); }
  await page.screenshot({path:'test-results/dashboard.png',fullPage:true});
});
test('real MV3 extension polls Twitch fixture and automatically creates exactly one on-chain market', async () => {
  const profile = await mkdtemp(`${tmpdir()}/mirror-chrome-`); const extension = resolve('extension');
  const context = await chromium.launchPersistentContext(profile, { channel:'chromium', headless:true, args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`] });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).host;
    const dashboard = await context.newPage(); await dashboard.goto(url);
    const paired = await dashboard.evaluate(async extensionId => {
      const {token} = await fetch('/api/pair').then(r=>r.json());
      return (globalThis as unknown as {chrome:{runtime:{sendMessage(id:string,message:unknown):Promise<{ok:boolean}>}}}).chrome.runtime.sendMessage(extensionId,{type:'PAIR',token,bridgeUrl:location.origin});
    },id); expect(paired.ok).toBe(true);
    const predictionId = `e2e-${crypto.randomUUID()}`;
    const prediction = {id:predictionId,title:'¿Replica automáticamente esta predicción?',status:'ACTIVE',createdAt:new Date().toISOString(),predictionWindowSeconds:1800,outcomes:[{id:'a',title:'Funciona',color:'BLUE',totalPoints:1200,totalUsers:12},{id:'b',title:'Falla',color:'PINK',totalPoints:800,totalUsers:8}],lockedAt:null as string|null,endedAt:null,winningOutcome:null};
    await context.route('https://gql.twitch.tv/gql', route => route.fulfill({json:{data:{channel:{activePredictionEvents:[prediction]}}}}));
    await context.route('https://www.twitch.tv/mirror_e2e',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Twitch fixture</title><h1>Twitch prediction fixture</h1>'}));
    const twitch = await context.newPage(); await twitch.goto('https://www.twitch.tv/mirror_e2e');
    await expect.poll(async()=> { const markets = await dashboard.request.get(`${url}/api/markets`).then(r=>r.json()); return markets.find((m:{prediction:{id:string}})=>m.prediction.id===predictionId)?.phase; },{timeout:90000}).toBe('open');
    const popup = await context.newPage(); await popup.goto(`chrome-extension://${id}/popup.html`);
    await expect(popup.getByRole('heading',{name:prediction.title})).toBeVisible();
    await expect(popup.locator('.outcome').first()).toContainText('1,200 points');
    await expect(popup.locator('.outcome').first()).toContainText('60%');
    await expect(popup.locator('.market strong')).toHaveText('Mercado creado automáticamente',{timeout:15000});
    await expect(popup.locator('.network')).toHaveText('PRUEBA LOCAL');
    prediction.outcomes[0].totalPoints=2400;prediction.outcomes[0].totalUsers=24;
    await popup.getByRole('button',{name:'Refresh prediction'}).click();
    await expect(popup.locator('.outcome').first()).toContainText('2,400 points');
    prediction.status='LOCKED';prediction.lockedAt=new Date().toISOString();
    await popup.getByRole('button',{name:'Refresh prediction'}).click();
    await expect(popup.locator('.countdown')).toHaveText('Staking closed');
    await popup.screenshot({path:'test-results/extension-popup.png',fullPage:true});
    await twitch.reload();
    await expect.poll(async()=> { const last = await worker.evaluate(async()=> (globalThis as unknown as {chrome:{storage:{local:{get(keys:string[]):Promise<{lastPoll?:{channel:string}}>}}}}).chrome.storage.local.get(['lastPoll'])); return last.lastPoll?.channel; }).toBe('mirror_e2e');
    const markets = await dashboard.request.get(`${url}/api/markets`).then(r=>r.json()); expect(markets.filter((m:{prediction:{id:string}})=>m.prediction.id===predictionId)).toHaveLength(1);
    const replicated = markets.find((m:{prediction:{id:string}})=>m.prediction.id===predictionId); expect(replicated.prediction.outcomes[0].totalPoints).toBe(2400); expect(replicated.prediction.status).toBe('LOCKED');
  } finally { await context.close(); await rm(profile,{recursive:true,force:true}); }
});
