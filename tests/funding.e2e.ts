import {test,expect,chromium,type Page} from '@playwright/test';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {getAddressDecoder} from '@solana/kit';
import {Keypair,Transaction} from '@solana/web3.js';
import {createPrivateKey,sign} from 'node:crypto';
import {phantomProvider} from './fixtures/phantom.js';
async function fixture(){return (await readFile(resolve('test-results/funding-fixture-path'),'utf8')).trim();}
test.skip(process.env.MARKET_MODE==='solana'||process.env.E2E_MARKET_MODE==='byte','Points funding flow');
async function login(page:Page){
  const wallet=Keypair.generate(),privateKey=createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),Buffer.from(wallet.secretKey.subarray(0,32))]),format:'der',type:'pkcs8'});
  await phantomProvider(page,{address:getAddressDecoder().decode(wallet.publicKey.toBytes()),sign:message=>Array.from(sign(null,Buffer.from(message),privateKey))});
  await page.exposeBinding('__fundingSign',(_source,raw:number[])=>{const tx=Transaction.from(Buffer.from(raw));tx.sign(wallet);return Array.from(tx.serialize());});
  await page.addInitScript(()=>{
    const w=window as unknown as {phantom:{solana:{signTransaction:(tx:{serialize(options:unknown):Uint8Array;constructor:{from(raw:Uint8Array):unknown}})=>Promise<unknown>}};__fundingSign:(raw:number[])=>Promise<number[]>};
    w.phantom.solana.signTransaction=async tx=>tx.constructor.from(new Uint8Array(await w.__fundingSign(Array.from(tx.serialize({requireAllSignatures:false,verifySignatures:false})))));
  });
  await page.goto('/onboarding');await page.getByRole('button',{name:'Conectar Phantom',exact:true}).click();await page.waitForURL('**/app#markets');await page.goto('/wallet.html');
  await expect(page.getByRole('region',{name:'Saldo',exact:true})).toContainText('10.000');return wallet;
}
async function reset(){await writeFile(await fixture(),JSON.stringify({transactions:{},broadcasts:0,finalize:true,fail:false,height:10}));}
async function state(){return JSON.parse(await readFile(await fixture(),'utf8'));}
test.beforeEach(reset);
test('buy USDC, bet purchased points, withdraw SOL and recover the same account after reload',async({page})=>{
  await login(page);await page.getByLabel('Importe en USDC',{exact:true}).fill('2');await page.getByRole('button',{name:'Ver cotización',exact:true}).click();
  await expect(page.getByRole('region',{name:'Cotización'})).toContainText('2.000');await page.getByRole('button',{name:'Confirmar compra en Phantom',exact:true}).click();
  await expect(page.getByRole('region',{name:'Saldo',exact:true})).toContainText('12.000');await expect(page.locator('#own-balance')).toContainText('12.000');await expect(page.getByText('Compra confirmada. Los puntos ya están en tu saldo.',{exact:true})).toBeVisible();
  await page.goto('/app');
  const market=await page.evaluate(async()=>{const {token}=await(await fetch('/api/pair')).json();return (await fetch('/api/demo',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:'{}'})).json();});
  await page.reload();await page.getByRole('combobox',{name:'Buscar streamer'}).fill('demo_streamer');await page.getByRole('option').filter({hasText:'@demo_streamer'}).click();
  await page.locator(`[data-key="${market.key}"]`).getByRole('button',{name:'Apostar a Gana',exact:true}).click();await page.getByLabel('Puntos a apostar',{exact:true}).fill('11000');await page.getByRole('button',{name:'Confirmar apuesta',exact:false}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('#own-balance')).toContainText('1.000');
  await page.getByRole('button',{name:'Mi perfil',exact:true}).click();await page.getByRole('link',{name:'Comprar y retirar puntos',exact:false}).click();await page.getByRole('button',{name:'Retirar puntos',exact:true}).click();await page.getByLabel('Moneda',{exact:true}).selectOption('SOL');await page.getByLabel('Puntos a retirar',{exact:true}).fill('1000');
  await page.getByRole('button',{name:'Ver cotización',exact:true}).click();await expect(page.getByRole('region',{name:'Cotización'})).toContainText('0.006666666 SOL');await page.getByRole('button',{name:'Confirmar retiro',exact:true}).click();
  await expect(page.getByRole('region',{name:'Saldo',exact:true})).toContainText('0 pts');await expect(page.getByText('Retiro confirmado. Los fondos llegaron a tu wallet.',{exact:true})).toBeVisible();
  await page.reload();await expect(page.getByRole('region',{name:'Saldo',exact:true})).toContainText('0 pts');await expect(page.locator('.funding-row')).toHaveCount(2);expect((await state()).broadcasts).toBe(2);
  await page.screenshot({path:'test-results/funding-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/funding-mobile.png',fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('buy SOL and withdraw USDC from the same points balance',async({page})=>{
  await login(page);await page.getByLabel('Moneda',{exact:true}).selectOption('SOL');await page.getByLabel('Importe en SOL',{exact:true}).fill('0.01');await page.getByRole('button',{name:'Ver cotización',exact:true}).click();await page.getByRole('button',{name:'Confirmar compra en Phantom',exact:true}).click();await expect(page.getByRole('region',{name:'Saldo',exact:true})).toContainText('11.500');
  await page.getByRole('button',{name:'Retirar puntos',exact:true}).click();await page.getByLabel('Moneda',{exact:true}).selectOption('USDC');await page.getByLabel('Puntos a retirar',{exact:true}).fill('1500');await page.getByRole('button',{name:'Ver cotización',exact:true}).click();await expect(page.getByRole('region',{name:'Cotización'})).toContainText('1.500000 USDC');await page.getByRole('button',{name:'Confirmar retiro',exact:true}).click();await expect(page.getByRole('region',{name:'Saldo',exact:true})).toContainText('10.000');
});
test('pending withdrawal survives reload, reserves points, then returns them on a finalized failure',async({page})=>{
  await login(page);const data=await state();data.finalize=false;await writeFile(await fixture(),JSON.stringify(data));
  await page.getByRole('button',{name:'Retirar puntos',exact:true}).click();await page.getByLabel('Puntos a retirar',{exact:true}).fill('2000');await page.getByRole('button',{name:'Ver cotización',exact:true}).click();await page.getByRole('button',{name:'Confirmar retiro',exact:true}).click();await expect(page.getByRole('region',{name:'Saldo',exact:true})).toContainText('8.000');
  await page.reload();await expect(page.getByRole('region',{name:'Saldo',exact:true})).toContainText('8.000');await expect(page.locator('.funding-row')).toContainText('Confirmación pendiente');
  const pending=await state();pending.finalize=true;pending.fail=true;await writeFile(await fixture(),JSON.stringify(pending));await expect(page.getByRole('region',{name:'Saldo',exact:true})).toContainText('10.000',{timeout:15000});await expect(page.locator('.funding-row')).toContainText('Falló en Solana');
});
test('extension opens the same wallet balance and the form fits 700 and 360 pixels',async()=>{
  const profile=await mkdtemp(`${tmpdir()}/funding-extension-`),extension=resolve('extension');
  const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  try{
    const page=await context.newPage();await login(page);const base=new URL(page.url()).origin,token=await page.evaluate(()=>localStorage.getItem('pointsToken'));
    const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
    await worker.evaluate(async({base,token})=>{await (globalThis as unknown as {chrome:{storage:{local:{set(value:unknown):Promise<void>}}}}).chrome.storage.local.set({bridgeUrl:base,pointsToken:token});},{base,token});
    const popup=await context.newPage();await popup.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
    await expect(popup.getByRole('link',{name:'Buy / withdraw ↗',exact:true})).toHaveAttribute('href',`${base}/app#balance`);
    const [walletPage]=await Promise.all([context.waitForEvent('page'),popup.getByRole('link',{name:'Buy / withdraw ↗',exact:true}).click()]);
    await expect(walletPage.getByRole('button',{name:'Saldo',exact:true})).toHaveAttribute('aria-current','page');
    await expect(walletPage.getByRole('region',{name:'Saldo',exact:true})).toContainText('10.000');await expect(walletPage.locator('.phone-app')).toHaveCount(1);await expect(walletPage.locator('.funding-panel[data-slot=liquid-glass]')).toHaveCount(2);
    for(const width of [700,360]){
      await walletPage.setViewportSize({width,height:600});
      await expect(walletPage.getByRole('button',{name:'Comprar puntos',exact:true})).toBeVisible();
      await expect.poll(async()=>{const active=await walletPage.getByRole('button',{name:'Saldo',exact:true}).boundingBox(),indicator=await walletPage.locator('.phone-nav-indicator').boundingBox();return active&&indicator?Math.abs(active.x+active.width/2-indicator.x-indicator.width/2):999;}).toBeLessThan(2);
      expect(await walletPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await walletPage.screenshot({path:`test-results/funding-${width}.png`,fullPage:true});
    }
  }finally{await context.close();await rm(profile,{recursive:true,force:true});}
});
