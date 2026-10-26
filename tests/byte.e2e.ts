import {test,expect,chromium,type Page} from '@playwright/test';
import {readFile,writeFile,rename,mkdtemp,cp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {phantomProvider,testWallet} from './fixtures/phantom.js';
import type {Transaction} from '@solana/web3.js';
import type {DisplayByteMarket} from '../src/byte-model.js';

test.skip(process.env.MARKET_MODE==='solana','byte integration uses the points authentication server');
type Fixture={markets:DisplayByteMarket[];signatures:Record<string,unknown>;broadcasts:number;resolutions:number;invalidations:number;syncs:number;pending?:boolean;partnerError?:number;genesis?:string};
const path=resolve('test-results/byte-fixture.json');
async function readFixture():Promise<Fixture>{return JSON.parse(await readFile(path,'utf8'));}
async function changeFixture(change:(state:Fixture)=>void){const state=await readFixture();change(state);await writeFile(path+'.test',JSON.stringify(state));await rename(path+'.test',path);}
test.beforeEach(async()=>{await writeFile(path+'.test',JSON.stringify({markets:[],signatures:{},broadcasts:0,resolutions:0,invalidations:0,syncs:0}));await rename(path+'.test',path);});
async function createMarket(page:Page,title='¿Gana la próxima partida?'){
  await page.goto('/byte');await page.getByRole('button',{name:'Operador',exact:true}).click();
  await page.getByLabel('Canal de Twitch',{exact:true}).fill('fixture_streamer');await page.getByLabel('Pregunta',{exact:true}).fill(title);
  await page.getByLabel('Reglas de resolución',{exact:true}).fill('Gana si el marcador final de la próxima partida muestra victoria. Evidencia: VOD del canal.');
  await page.getByRole('button',{name:'Crear mercado en devnet',exact:true}).click();await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();
  return (await readFixture()).markets.at(-1)!;
}
async function connectWallet(page:Page,rejectTransaction=false){
  const wallet=testWallet();await phantomProvider(page,wallet);
  await page.exposeBinding('__byteSign',(_source,message:number[])=>wallet.sign(message));
  await page.addInitScript(({rejectTransaction})=>{
    type Provider={signTransaction(tx:Transaction):Promise<Transaction>};
    const w=window as unknown as {phantom:{solana:Provider};__byteSign(message:number[]):Promise<number[]>};
    w.phantom.solana.signTransaction=async(tx:Transaction)=>{
      if(rejectTransaction)throw Object.assign(new Error('Rejected'),{code:4001});
      const signature=new Uint8Array(await w.__byteSign(Array.from(tx.serializeMessage())));
      tx.addSignature(tx.feePayer!,signature as never);return tx;
    };
  },{rejectTransaction});
  await page.reload();await page.getByRole('button',{name:'Conectar Phantom',exact:true}).click();await expect(page.getByText('Wallet conectada.',{exact:false})).toBeVisible();return wallet;
}
test('create → real wallet signatures → byte instruction → sync → close → resolve → observe automatic payout',async({page})=>{
  const market=await createMarket(page);await connectWallet(page);
  const card=page.locator(`[data-market-id="${market.id}"]`);await card.getByLabel('Importe en SOL devnet').fill('0.012345678');
  await card.getByRole('button',{name:'Apostar a Sí',exact:true}).click();
  await expect(card.getByText('Apuesta confirmada en Solana.',{exact:true})).toBeVisible();
  const state=await readFixture();expect(state.broadcasts).toBe(1);expect(state.markets[0].pools[0]).toBe(12345678);expect(state.syncs).toBeGreaterThan(0);
  await page.getByRole('button',{name:'Mis apuestas',exact:true}).click();await expect(page.locator('.byte-receipt')).toContainText('Confirmada');await expect(page.locator('.byte-receipt a')).toHaveAttribute('href',/cluster=devnet/);
  await changeFixture(s=>{s.markets[0].closeMs=Date.now()-1;s.markets[0].bettable=false;s.markets[0].resolvable=true;});
  await page.getByRole('button',{name:'Mercados',exact:true}).click();await page.getByRole('button',{name:'Actualizar mercados',exact:true}).click();await expect(card.getByText('Esperando resultado',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Operador',exact:true}).click();await page.getByLabel(`Evidencia o motivo de ${market.title}`).fill('https://twitch.tv/videos/123 · minuto 12:31, marcador final de victoria.');
  await page.getByRole('button',{name:'Resolver mercado',exact:true}).click();await page.getByRole('button',{name:'Confirmar decisión',exact:true}).click();
  await expect(page.getByText('Esperando distribución automática de byte.',{exact:false})).toBeVisible();expect((await readFixture()).resolutions).toBe(1);
  await changeFixture(s=>{s.markets[0].chain.settled=true;});await page.getByRole('button',{name:'Mercados',exact:true}).click();await page.getByRole('button',{name:'Actualizar mercados',exact:true}).click();await expect(card.getByText('Pagos o reembolsos completados en cadena.',{exact:true})).toBeVisible();
  await page.screenshot({path:'test-results/byte-market-settled.png',fullPage:true});
});
test('wallet rejection broadcasts nothing; invalidation requires evidence and explicit confirmation',async({page})=>{
  const market=await createMarket(page,'¿Se completa el desafío?');await connectWallet(page,true);
  const card=page.locator(`[data-market-id="${market.id}"]`);await card.getByRole('button',{name:'Apostar a Sí',exact:true}).click();
  await expect(card.getByRole('alert')).toContainText('Cancelaste');expect((await readFixture()).broadcasts).toBe(0);
  await page.getByRole('button',{name:'Operador',exact:true}).click();await expect(page.getByRole('button',{name:'Resolver mercado',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Anular y reembolsar',exact:true})).toBeDisabled();
  await page.getByLabel(`Evidencia o motivo de ${market.title}`).fill('Se canceló el desafío por desconexión del streamer.');await page.getByRole('button',{name:'Anular y reembolsar',exact:true}).click();expect((await readFixture()).invalidations).toBe(0);
  await page.getByRole('button',{name:'Confirmar decisión',exact:true}).click();await expect(page.getByText('Anulado.',{exact:false})).toBeVisible();expect((await readFixture()).invalidations).toBe(1);
});
test('pending signature survives reload, blocks duplicate bets and can be confirmed later',async({page})=>{
  const market=await createMarket(page,'¿Llega al siguiente nivel?');await connectWallet(page);await changeFixture(s=>{s.pending=true;});
  const card=page.locator(`[data-market-id="${market.id}"]`);await card.getByRole('button',{name:'Apostar a Sí',exact:true}).click();
  await expect(card.getByText('Confirmación pendiente.',{exact:false})).toBeVisible({timeout:40000});expect((await readFixture()).broadcasts).toBe(1);
  await page.reload();await expect(page.getByRole('button',{name:'Reconectar wallet',exact:true})).toBeVisible();
  await card.getByRole('button',{name:'Apostar a Sí',exact:true}).click();await expect(card.getByRole('alert')).toContainText('transacción pendiente');expect((await readFixture()).broadcasts).toBe(1);
  await changeFixture(s=>{s.pending=false;});await page.getByRole('button',{name:'Mis apuestas',exact:true}).click();await page.getByRole('button',{name:'Revisar transacciones',exact:true}).click();await expect(page.locator('.byte-receipt')).toContainText('Confirmada');expect((await readFixture()).broadcasts).toBe(1);
});
test('partner access errors are visible and mobile layout remains usable',async({page})=>{
  await changeFixture(s=>{s.partnerError=403;});await page.setViewportSize({width:390,height:844});await page.goto('/byte');await page.getByRole('button',{name:'Operador',exact:true}).click();
  await page.getByLabel('Canal de Twitch',{exact:true}).fill('fixture_streamer');await page.getByLabel('Pregunta',{exact:true}).fill('¿Gana esta partida?');await page.getByLabel('Reglas de resolución',{exact:true}).fill('Se usa el marcador final de victoria en la próxima partida.');
  await page.getByRole('button',{name:'Crear mercado en devnet',exact:true}).click();await expect(page.getByRole('alert')).toContainText('partner');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/byte-mobile-partner-error.png',fullPage:true});
});
test('MV3 popup signs through an existing Twitch tab and retains receipts and cached balance',async({page})=>{
 const market=await createMarket(page,'¿Gana el mercado de la extensión?');
 const base=process.env.APP_URL??'http://twitch-predict.localhost:1358';
 const profile=await mkdtemp(`${tmpdir()}/byte-extension-`),extension=resolve(profile,'extension');await cp(resolve('extension'),extension,{recursive:true});
 for(const file of ['background.js','popup.js','app-config.js']){const p=resolve(extension,file);await writeFile(p,(await readFile(p,'utf8')).replaceAll('http://twitch-predict.localhost:1356',base));}
 const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
 let releaseSignature:(()=>void)|undefined;
 try{
  const wallet=await phantomProvider(context);
  let signatureGate=Promise.resolve();
  await context.exposeBinding('__byteSign',async(_source,message:number[])=>{await signatureGate;return wallet.sign(message);});
  await context.addInitScript(()=>{
   const w=window as unknown as {phantom:{solana:{signTransaction(tx:Transaction):Promise<Transaction>}};__byteSign(message:number[]):Promise<number[]>;__rejectPlot?:boolean;__tamperPlot?:boolean;__plotSignRequested?:boolean};
   if(w.phantom)w.phantom.solana.signTransaction=async tx=>{w.__plotSignRequested=true;if(w.__rejectPlot)throw Object.assign(new Error('Rejected'),{code:4001});if(w.__tamperPlot)tx.instructions[0].data[8]=0;tx.addSignature(tx.feePayer!,new Uint8Array(await w.__byteSign(Array.from(tx.serializeMessage()))) as never);return tx;};
  });
  await context.route('**/api/health',route=>route.fulfill({json:{ok:true,marketMode:'byte',network:'devnet'}}));
  const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');const extensionId=new URL(worker.url()).host;
  // Authenticate before the betting test. Reuse the original browser tab so
  // install-time onboarding cannot race creation of a tab in a closing window.
  const dashboard=context.pages().find(p=>p.url()==='about:blank')??await context.newPage();
  await dashboard.goto(`${base}/byte`);
  await dashboard.getByRole('button',{name:'Conectar Phantom',exact:true}).click();
  await expect(dashboard.getByText('Wallet conectada.',{exact:false})).toBeVisible();
  await dashboard.getByRole('button',{name:'Vincular extensión',exact:true}).click();
  await expect(dashboard.getByText('Extensión vinculada.',{exact:false})).toBeVisible();
  for(const auth of context.pages().filter(p=>p.url().includes('/onboarding')))await auth.close();
  await dashboard.bringToFront();
  await dashboard.reload();await expect(dashboard.getByRole('button',{name:'Reconectar wallet',exact:true})).toBeVisible();
  let popup=await context.newPage();await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  const walletLabel=`${wallet.address.slice(0,5)}…${wallet.address.slice(-5)}`;
  await expect(popup.locator('#account-name')).toHaveText(walletLabel);
  let card=popup.locator(`[data-market-id="${market.id}"]`);await expect(card).toBeVisible();await expect(popup.locator('#wallet')).toBeVisible();
  await card.getByLabel('Importe en SOL devnet').fill('0.025');
  await changeFixture(s=>{s.pending=true;});
  await context.route('https://www.twitch.tv/fixture_streamer',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Twitch fixture</title>'}));
  const twitch=await context.newPage();await twitch.goto('https://www.twitch.tv/fixture_streamer');
  await twitch.evaluate(()=>{(window as unknown as {__rejectPlot:boolean}).__rejectPlot=true;});
  await card.getByRole('button',{name:'Apostar a No',exact:true}).click();
  await expect(card.getByRole('alert')).toContainText('Cancelaste');expect((await readFixture()).broadcasts).toBe(0);
  await twitch.evaluate(()=>{const w=window as unknown as {__rejectPlot:boolean;__tamperPlot:boolean};w.__rejectPlot=false;w.__tamperPlot=true;});
  await card.getByRole('button',{name:'Apostar a No',exact:true}).click();
  await expect(card.getByRole('alert')).toContainText('no coincide');expect((await readFixture()).broadcasts).toBe(0);
  await twitch.evaluate(()=>{const w=window as unknown as {__tamperPlot:boolean;__plotSignRequested:boolean};w.__tamperPlot=false;w.__plotSignRequested=false;});
  signatureGate=new Promise<void>(resolve=>{releaseSignature=resolve;});
  const pagesBefore=context.pages().length;
  const windowsBefore=await worker.evaluate(async()=> (await (globalThis as unknown as {chrome:{windows:{getAll():Promise<unknown[]>}}}).chrome.windows.getAll()).length);
  await card.getByRole('button',{name:'Apostar a No',exact:true}).click();
  await expect.poll(()=>twitch.evaluate(()=>(window as unknown as {__plotSignRequested:boolean}).__plotSignRequested)).toBe(true);
  await popup.close();releaseSignature?.();
  await expect.poll(async()=>(await readFixture()).broadcasts).toBe(1);
  expect(context.pages().length).toBe(pagesBefore-1);
  expect(await worker.evaluate(async()=> (await (globalThis as unknown as {chrome:{windows:{getAll():Promise<unknown[]>}}}).chrome.windows.getAll()).length)).toBe(windowsBefore);
  popup=await context.newPage();await popup.goto(`chrome-extension://${extensionId}/popup.html`);card=popup.locator(`[data-market-id="${market.id}"]`);
  await expect(card.getByText('Transacción enviada.',{exact:false})).toBeVisible();
  await expect(card.getByRole('button',{name:'Apostar a No',exact:true})).toBeDisabled();
  await changeFixture(s=>{s.pending=false;});await popup.getByRole('button',{name:'Actualizar predicción',exact:true}).click();
  await expect(popup.getByText('Apuesta confirmada en Solana.',{exact:false})).toBeVisible();
  await expect(popup.locator('#history')).toContainText('Confirmada');
  expect((await readFixture()).broadcasts).toBe(1);
  expect((await readFixture()).markets[0].pools[1]).toBe(25000000);
  await expect(popup.getByRole('button',{name:'Confirmar en Phantom'})).toHaveCount(0);
  // Close and reopen with health and balance requests held. Cached content must
  // render before either request finishes, and revalidation must not blank it.
  await expect.poll(()=>popup.locator('#own-balance').textContent()).toBe('2');
  await popup.close();
  let releaseHealth!:()=>void,releaseBalance!:()=>void;
  const healthGate=new Promise<void>(resolve=>{releaseHealth=resolve;}),balanceGate=new Promise<void>(resolve=>{releaseBalance=resolve;});
  let healthWaiting=false,balanceWaiting=false;
  await context.route('**/api/health',async route=>{healthWaiting=true;await healthGate;await route.fulfill({json:{ok:true,marketMode:'byte',network:'devnet'}});});
  await context.route('**/api/byte/rpc',async route=>{if(route.request().postDataJSON()?.method!=='getBalance'){await route.fallback();return;}balanceWaiting=true;await balanceGate;await route.fulfill({json:{jsonrpc:'2.0',id:1,result:{context:{slot:101},value:3000000000}}});});
  const cached=await context.newPage();await cached.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(cached.getByRole('heading',{name:market.title,exact:true})).toBeVisible();
  await expect(cached.locator('#own-balance')).toHaveText('2');expect(healthWaiting).toBe(true);
  await cached.evaluate(()=>{
   const balance=document.querySelector('#own-balance')!,cards=document.querySelector('#predictions')!;
   const state={balances:[] as string[],detached:false,card:cards.firstElementChild};
   (window as unknown as {cacheObservation:typeof state}).cacheObservation=state;
   new MutationObserver(()=>{state.balances.push(balance.textContent??'');if(!state.card?.isConnected)state.detached=true;}).observe(document.body,{childList:true,subtree:true});
  });
  const input=cached.getByLabel('Importe en SOL devnet');await input.fill('0.037');
  releaseHealth();await expect.poll(()=>balanceWaiting).toBe(true);
  await expect(cached.locator('#own-balance')).toHaveText('2');await expect(input).toBeFocused();await expect(input).toHaveValue('0.037');
  releaseBalance();await expect(cached.locator('#own-balance')).toHaveText('3');
  const observation=await cached.evaluate(()=>{const state=(window as unknown as {cacheObservation:{balances:string[];detached:boolean}}).cacheObservation;return {blank:state.balances.some(v=>v==='—'||!v),detached:state.detached};});
  expect(observation).toEqual({blank:false,detached:false});
  // Losing the bridge must preserve the cache and still expire betting controls.
  await context.route('**/api/**',route=>route.abort('internetdisconnected'));
  await worker.evaluate(async()=>{
   const storage=(globalThis as unknown as {chrome:{storage:{local:{get(key:string):Promise<{popupCache:Record<string,unknown>}>;set(value:unknown):Promise<void>}}}}).chrome.storage.local;
   const {popupCache}=await storage.get('popupCache');await storage.set({popupCache:{...popupCache,marketsAt:Date.now()-60000}});
  });
  await cached.reload();await expect(cached.getByRole('heading',{name:market.title,exact:true})).toBeVisible();await expect(cached.locator('#own-balance')).toHaveText('3');
  await expect(cached.getByRole('button',{name:'Apostar a No',exact:true})).toBeDisabled();await expect(cached.locator('#freshness')).toContainText('datos guardados');
  await cached.screenshot({path:'test-results/byte-extension-cached-offline.png',fullPage:true});
  await worker.evaluate(async()=>{await (globalThis as unknown as {chrome:{storage:{local:{set(value:unknown):Promise<void>}}}}).chrome.storage.local.set({pointsToken:'different-session'});});
  await cached.reload();await expect(cached.locator('#own-balance')).not.toHaveText('3');await expect(cached.getByRole('heading',{name:market.title,exact:true})).toHaveCount(0);

 }finally{releaseSignature?.();await context.close();await rm(profile,{recursive:true,force:true});}
});

test('a non-devnet RPC is rejected before any wallet transaction is broadcast',async({page})=>{
 const market=await createMarket(page,'¿Bloquea una red incorrecta?');await connectWallet(page);await changeFixture(s=>{s.genesis='11111111111111111111111111111111';});
 const card=page.locator(`[data-market-id="${market.id}"]`);await card.getByRole('button',{name:'Apostar a Sí',exact:true}).click();await expect(card.getByRole('alert')).toContainText(/no corresponde a (Solana )?devnet/);expect((await readFixture()).broadcasts).toBe(0);
});

test('legacy Phantom provider can authenticate without the namespaced provider',async({page})=>{
 await phantomProvider(page);await page.addInitScript(()=>{const w=window as unknown as {phantom?:{solana:unknown};solana?:unknown};w.solana=w.phantom?.solana;delete w.phantom;});
 await page.goto('/byte');await page.getByRole('button',{name:'Conectar Phantom',exact:true}).click();await expect(page.getByText('Wallet conectada.',{exact:false})).toBeVisible();expect((await readFixture()).broadcasts).toBe(0);
});
test('HTTP named host explains the HTTPS requirement without attempting wallet authentication',async({page})=>{
 const authRequests:string[]=[];page.on('request',r=>{if(r.url().includes('/api/auth/')&&r.method()==='POST')authRequests.push(r.url());});
 await page.goto('/byte');await page.getByRole('button',{name:'Conectar Phantom',exact:true}).click();await expect(page.getByRole('alert')).toContainText('HTTPS');expect(authRequests).toEqual([]);expect((await readFixture()).broadcasts).toBe(0);
});
