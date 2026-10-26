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
  await card.getByRole('button',{name:'Apostar a Sí',exact:true}).click();await card.getByRole('button',{name:'Confirmar en Phantom',exact:true}).click();
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
  const card=page.locator(`[data-market-id="${market.id}"]`);await card.getByRole('button',{name:'Apostar a Sí',exact:true}).click();await card.getByRole('button',{name:'Confirmar en Phantom',exact:true}).click();
  await expect(card.getByRole('alert')).toContainText('Cancelaste');expect((await readFixture()).broadcasts).toBe(0);
  await page.getByRole('button',{name:'Operador',exact:true}).click();await expect(page.getByRole('button',{name:'Resolver mercado',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Anular y reembolsar',exact:true})).toBeDisabled();
  await page.getByLabel(`Evidencia o motivo de ${market.title}`).fill('Se canceló el desafío por desconexión del streamer.');await page.getByRole('button',{name:'Anular y reembolsar',exact:true}).click();expect((await readFixture()).invalidations).toBe(0);
  await page.getByRole('button',{name:'Confirmar decisión',exact:true}).click();await expect(page.getByText('Anulado.',{exact:false})).toBeVisible();expect((await readFixture()).invalidations).toBe(1);
});
test('pending signature survives reload, blocks duplicate bets and can be confirmed later',async({page})=>{
  const market=await createMarket(page,'¿Llega al siguiente nivel?');await connectWallet(page);await changeFixture(s=>{s.pending=true;});
  const card=page.locator(`[data-market-id="${market.id}"]`);await card.getByRole('button',{name:'Apostar a Sí',exact:true}).click();await card.getByRole('button',{name:'Confirmar en Phantom',exact:true}).click();
  await expect(card.getByText('Confirmación pendiente.',{exact:false})).toBeVisible({timeout:40000});expect((await readFixture()).broadcasts).toBe(1);
  await page.reload();await page.getByRole('button',{name:'Conectar Phantom',exact:true}).click();await expect(page.getByText('Wallet conectada.',{exact:false})).toBeVisible();
  await card.getByRole('button',{name:'Apostar a Sí',exact:true}).click();await card.getByRole('button',{name:'Confirmar en Phantom',exact:true}).click();await expect(card.getByRole('alert')).toContainText('transacción pendiente');expect((await readFixture()).broadcasts).toBe(1);
  await changeFixture(s=>{s.pending=false;});await page.getByRole('button',{name:'Mis apuestas',exact:true}).click();await page.getByRole('button',{name:'Revisar transacciones',exact:true}).click();await expect(page.locator('.byte-receipt')).toContainText('Confirmada');expect((await readFixture()).broadcasts).toBe(1);
});
test('partner access errors are visible and mobile layout remains usable',async({page})=>{
  await changeFixture(s=>{s.partnerError=403;});await page.setViewportSize({width:390,height:844});await page.goto('/byte');await page.getByRole('button',{name:'Operador',exact:true}).click();
  await page.getByLabel('Canal de Twitch',{exact:true}).fill('fixture_streamer');await page.getByLabel('Pregunta',{exact:true}).fill('¿Gana esta partida?');await page.getByLabel('Reglas de resolución',{exact:true}).fill('Se usa el marcador final de victoria en la próxima partida.');
  await page.getByRole('button',{name:'Crear mercado en devnet',exact:true}).click();await expect(page.getByRole('alert')).toContainText('partner');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/byte-mobile-partner-error.png',fullPage:true});
});
test('MV3 extension pairs with the app and opens SOL markets in the Phantom web flow',async({page})=>{
  const market=await createMarket(page,'¿Gana el mercado de la extensión?');
  const base=process.env.APP_URL??'http://twitch-predict.localhost:1358';
  const profile=await mkdtemp(`${tmpdir()}/byte-extension-`),extension=resolve(profile,'extension');await cp(resolve('extension'),extension,{recursive:true});
  for(const file of ['background.js','popup.js']){const filePath=resolve(extension,file);await writeFile(filePath,(await readFile(filePath,'utf8')).replaceAll('http://twitch-predict.localhost:1356',base));}
  const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  try{
    // Only select the byte mode for this browser; the app API and pairing handlers stay real.
    await context.route('**/api/health',route=>route.fulfill({json:{ok:true,marketMode:'byte',network:'devnet'}}));
    const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');const extensionId=new URL(worker.url()).host;
    const dashboard=await context.newPage();await dashboard.goto(`${base}/byte`);await dashboard.getByRole('button',{name:'Vincular extensión',exact:true}).click();await expect(dashboard.getByText('Extensión vinculada.',{exact:false})).toBeVisible();
    const popup=await context.newPage();await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    const card=popup.locator(`[data-market-id="${market.id}"]`);
    await expect(card).toContainText(market.title);await expect(popup.locator('#wallet')).toBeHidden();await expect(card.locator('.points-bet')).toHaveCount(2);
    await expect(card.locator('.pool-split')).toBeVisible();await expect(card.getByRole('button',{name:'Apostar a No',exact:true})).toHaveAttribute('data-tone','negative');
    await card.getByLabel('Importe en SOL devnet').fill('0.025');await popup.getByRole('button',{name:'Actualizar predicción',exact:true}).click();await expect(card.getByLabel('Importe en SOL devnet')).toHaveValue('0.025');
    const [betPage]=await Promise.all([context.waitForEvent('page'),card.getByRole('button',{name:'Apostar a No',exact:true}).click()]);
    await betPage.waitForURL(`**/byte?market=${market.id}&channel=fixture_streamer&option=1&amount=0.025`);
    const webCard=betPage.locator(`[data-market-id="${market.id}"]`);await expect(webCard.getByLabel('Importe en SOL devnet')).toHaveValue('0.025');await expect(webCard.getByRole('button',{name:'Apostar a No',exact:true})).toHaveAttribute('aria-pressed','true');expect((await readFixture()).broadcasts).toBe(0);
    await connectWallet(betPage);await webCard.getByRole('button',{name:'Apostar a No',exact:true}).click();await expect(webCard.getByRole('group',{name:'Confirmar apuesta'})).toContainText('0.025 SOL devnet');await expect(webCard.getByRole('group',{name:'Confirmar apuesta'})).toContainText('No');
    await webCard.getByRole('button',{name:'Confirmar en Phantom',exact:true}).click();await expect(webCard.getByText('Apuesta confirmada en Solana.',{exact:true})).toBeVisible();expect((await readFixture()).markets[0].pools[1]).toBe(25000000);
    await popup.getByRole('button',{name:'Actualizar predicción',exact:true}).click();await expect(card.locator('.points-pool')).toContainText('0,025');await expect(card.getByLabel('Importe en SOL devnet')).toHaveValue('0.025');
    await popup.screenshot({path:'test-results/byte-extension.png',fullPage:true});
    await betPage.emulateMedia({reducedMotion:'reduce'});
    for(const width of [1440,768,390]){await betPage.setViewportSize({width,height:1000});expect(await betPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await expect(webCard.locator('.pool-split')).toBeVisible();await expect(webCard.getByRole('button',{name:'Apostar a No',exact:true})).toHaveCSS('border-radius','999px');await betPage.screenshot({path:`test-results/byte-panel-${width}.png`,fullPage:true});}

  }finally{await context.close();await rm(profile,{recursive:true,force:true});}
});

test('a non-devnet RPC is rejected before any wallet transaction is broadcast',async({page})=>{
 const market=await createMarket(page,'¿Bloquea una red incorrecta?');await connectWallet(page);await changeFixture(s=>{s.genesis='11111111111111111111111111111111';});
 const card=page.locator(`[data-market-id="${market.id}"]`);await card.getByRole('button',{name:'Apostar a Sí',exact:true}).click();await card.getByRole('button',{name:'Confirmar en Phantom',exact:true}).click();await expect(card.getByRole('alert')).toContainText(/no corresponde a (Solana )?devnet/);expect((await readFixture()).broadcasts).toBe(0);
});
