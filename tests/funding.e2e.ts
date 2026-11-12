import {test,expect,chromium,type Page} from '@playwright/test';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {getAddressDecoder} from '@solana/kit';
import {ComputeBudgetProgram,Keypair,Transaction} from '@solana/web3.js';
import {createPrivateKey,sign} from 'node:crypto';
import {phantomProvider} from './fixtures/phantom.js';
async function fixture(){return (await readFile(resolve('test-results/funding-fixture-path'),'utf8')).trim();}
test.skip(process.env.MARKET_MODE==='solana'||process.env.E2E_MARKET_MODE==='byte','Points funding flow');
async function installWallet(page:Page){
  const wallet=Keypair.generate(),privateKey=createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),Buffer.from(wallet.secretKey.subarray(0,32))]),format:'der',type:'pkcs8'});
  await phantomProvider(page,{address:getAddressDecoder().decode(wallet.publicKey.toBytes()),sign:message=>Array.from(sign(null,Buffer.from(message),privateKey))});
  await page.exposeBinding('__fundingSign',(_source,raw:number[])=>{const tx=Transaction.from(Buffer.from(raw));
    // Match Phantom's documented fee injection; previous fixtures signed unchanged bytes.
    if(!tx.instructions.some(ix=>ix.programId.equals(ComputeBudgetProgram.programId)))tx.instructions.unshift(ComputeBudgetProgram.setComputeUnitLimit({units:200_000}),ComputeBudgetProgram.setComputeUnitPrice({microLamports:1000}));
    tx.sign(wallet);return Array.from(tx.serialize());});
  await page.addInitScript(()=>{
    const w=window as unknown as {phantom:{solana:{signTransaction:(tx:{serialize(options:unknown):Uint8Array;constructor:{from(raw:Uint8Array):unknown}})=>Promise<unknown>}};__fundingSign:(raw:number[])=>Promise<number[]>};
    w.phantom.solana.signTransaction=async tx=>tx.constructor.from(new Uint8Array(await w.__fundingSign(Array.from(tx.serialize({requireAllSignatures:false,verifySignatures:false})))));
  });
  return wallet;
}
async function login(page:Page){
  const wallet=await installWallet(page);
  await page.goto('/onboarding');await page.getByRole('button',{name:'Conectar Phantom',exact:true}).click();await page.waitForURL('**/app#markets');await page.goto('/wallet.html');
  await expect(page.getByRole('region',{name:'Saldo',exact:true})).toContainText('10.000');return wallet;
}
async function reset(){await writeFile(await fixture(),JSON.stringify({transactions:{},broadcasts:0,finalize:true,fail:false,height:10}));}
async function state(){return JSON.parse(await readFile(await fixture(),'utf8'));}
test.beforeEach(reset);
test('buy USDC, bet purchased points, withdraw SOL and recover the same account after reload',async({page})=>{
  await login(page);await page.getByRole('radio',{name:'5.000 puntos 5 USDC',exact:true}).check();await page.getByRole('button',{name:'Comprar con Phantom',exact:true}).click();
  await expect(page.getByRole('region',{name:'Saldo',exact:true})).toContainText('15.000');await expect(page.locator('#own-balance')).toContainText('15.000');await expect(page.getByText('Compra confirmada. Los puntos ya están en tu saldo.',{exact:true})).toBeVisible();
  await page.goto('/app');
  const market=await page.evaluate(async()=>{const {token}=await(await fetch('/api/pair')).json();return (await fetch('/api/demo',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:'{}'})).json();});
  await page.reload();await page.getByRole('combobox',{name:'Buscar streamer'}).fill('demo_streamer');await page.getByRole('option').filter({hasText:'@demo_streamer'}).click();
  await page.locator(`[data-key="${market.key}"]`).getByRole('button',{name:'Apostar a Gana',exact:true}).click();await page.getByLabel('Puntos a apostar',{exact:true}).fill('14000');await page.getByRole('button',{name:'Confirmar apuesta',exact:false}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('#own-balance')).toContainText('1.000');
  await page.getByRole('button',{name:'Mi perfil',exact:true}).click();await page.getByRole('link',{name:'Comprar y retirar puntos',exact:false}).click();await page.getByRole('button',{name:'Retirar puntos',exact:true}).click();await page.getByLabel('Moneda',{exact:true}).selectOption('SOL');await page.getByLabel('Puntos a retirar',{exact:true}).fill('1000');
  await page.getByRole('button',{name:'Ver cotización',exact:true}).click();await expect(page.getByRole('region',{name:'Cotización'})).toContainText('0.006666666 SOL');await page.getByRole('button',{name:'Confirmar retiro',exact:true}).click();
  await expect(page.getByRole('region',{name:'Saldo',exact:true})).toContainText('0 pts');await expect(page.getByText('Retiro confirmado. Los fondos llegaron a tu wallet.',{exact:true})).toBeVisible();
  await page.reload();await expect(page.getByRole('region',{name:'Saldo',exact:true})).toContainText('0 pts');await expect(page.locator('.funding-row')).toHaveCount(2);expect((await state()).broadcasts).toBe(2);
  await page.screenshot({path:'test-results/funding-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/funding-mobile.png',fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('buy SOL and withdraw USDC from the same points balance',async({page})=>{
  await login(page);await page.getByRole('radio',{name:'1.000 puntos 1 USDC',exact:true}).check();await page.getByRole('radio',{name:'SOL',exact:true}).check();await page.getByRole('button',{name:'Comprar con Phantom',exact:true}).click();await expect(page.getByRole('region',{name:'Saldo',exact:true})).toContainText('11.000');
  await page.getByRole('button',{name:'Retirar puntos',exact:true}).click();await page.getByLabel('Moneda',{exact:true}).selectOption('USDC');await page.getByLabel('Puntos a retirar',{exact:true}).fill('1000');await page.getByRole('button',{name:'Ver cotización',exact:true}).click();await expect(page.getByRole('region',{name:'Cotización'})).toContainText('1.000000 USDC');await page.getByRole('button',{name:'Confirmar retiro',exact:true}).click();await expect(page.getByRole('region',{name:'Saldo',exact:true})).toContainText('10.000');
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
      expect(await walletPage.locator('.funding-package-grid').evaluate(el=>Array.from(el.querySelectorAll('label')).every(label=>label.scrollWidth<=label.clientWidth))).toBe(true);
      await walletPage.getByRole('radio',{name:'1.000 puntos 1 USDC',exact:true}).check();
      await expect(walletPage.getByRole('radio',{name:'SOL',exact:true})).toBeVisible();
      await walletPage.screenshot({path:`test-results/funding-${width}.png`,fullPage:true});
      if(width===700){
        const html=await walletPage.evaluate(()=>{const copy=document.documentElement.cloneNode(true) as HTMLElement;copy.querySelectorAll('script').forEach(el=>el.remove());copy.querySelectorAll('link[href],img[src]').forEach(el=>{const key=el.tagName==='LINK'?'href':'src',value=el.getAttribute(key);if(value?.startsWith('/'))el.setAttribute(key,'/public'+value);});return '<!doctype html>'+copy.outerHTML;});
        await writeFile('test-results/packages-visual.html',html);
      }
    }
  }finally{await context.close();await rm(profile,{recursive:true,force:true});}
});

test('a temporary account refresh failure keeps the balance screen and entered withdrawal',async({page})=>{
  await login(page);
  await page.getByRole('button',{name:'Retirar puntos',exact:true}).click();
  await page.getByLabel('Puntos a retirar',{exact:true}).fill('1234');
  await page.route('**/api/points/me',route=>route.fulfill({status:503,json:{error:'Cuenta temporalmente no disponible'}}));
  await page.waitForResponse(response=>response.url().endsWith('/api/points/me')&&response.status()===503);
  // A parent poll used to turn any transport failure into a signed-out snapshot.
  await page.waitForResponse(response=>response.url().endsWith('/api/channels'));
  await expect(page.getByRole('button',{name:'Saldo',exact:true})).toHaveAttribute('aria-current','page');
  await expect(page.getByLabel('Puntos a retirar',{exact:true})).toHaveValue('1234');
  await expect(page.getByRole('region',{name:'Iniciar sesión',exact:true})).toHaveCount(0);
});

test('package selection survives a quote error and Phantom cancellation',async({page})=>{
  await login(page);
  await expect(page.getByRole('textbox',{name:/Importe en/})).toHaveCount(0);
  await expect(page.getByRole('group',{name:'Pagá con',exact:true})).toHaveCount(0);
  await page.getByRole('radio',{name:'1.000 puntos 1 USDC',exact:true}).check();
  await page.getByRole('radio',{name:'SOL',exact:true}).check();
  await page.route('**/api/funding/quote',route=>route.fulfill({status:503,json:{error:'No se pudo cotizar SOL. Intentá de nuevo.'}}));
  await page.getByRole('button',{name:'Comprar con Phantom',exact:true}).click();
  await expect(page.getByText('No se pudo cotizar SOL. Intentá de nuevo.',{exact:true})).toBeVisible();
  await expect(page.getByRole('radio',{name:'1.000 puntos 1 USDC',exact:true})).toBeChecked();
  await page.unroute('**/api/funding/quote');
  await page.evaluate(()=>{const w=window as unknown as {phantom:{solana:{signTransaction:()=>Promise<never>}}};w.phantom.solana.signTransaction=async()=>{throw Object.assign(new Error('Rejected'),{code:4001});};});
  await page.getByRole('button',{name:'Comprar con Phantom',exact:true}).click();
  await expect(page.getByText('Cancelaste la operación en Phantom.',{exact:true})).toBeVisible();
  await expect(page.getByRole('region',{name:'Cotización'})).toBeVisible();
  expect((await state()).broadcasts).toBe(0);
  await page.getByRole('radio',{name:'5.000 puntos 5 USDC',exact:true}).check();
  await expect(page.getByRole('region',{name:'Cotización'})).toHaveCount(0);
  await page.getByRole('radio',{name:'USDC',exact:true}).check();
  await page.getByRole('button',{name:'Comprar con Phantom',exact:true}).click();
  await expect(page.getByRole('region',{name:'Cotización'})).toContainText('5.000000 USDC');
});

test('disabled payments report the blocker without sending funds',async({page})=>{
  await login(page);const config=await(await page.request.get('/api/funding/config')).json();
  await page.route('**/api/funding/config',route=>route.fulfill({json:{...config,enabled:false,treasury:null,reason:'Compras y retiros todavía no están habilitados.'}}));
  await page.reload();await page.getByRole('radio',{name:'5.000 puntos 5 USDC',exact:true}).check();
  await page.getByRole('button',{name:'Comprar con Phantom',exact:true}).click();
  await expect(page.locator('.funding-error')).toContainText('todavía no están habilitados');
  expect((await state()).broadcasts).toBe(0);await expect(page.locator('.funding-row')).toHaveCount(0);
});

test('one purchase click opens Phantom signing directly and ignores a duplicate click',async({page})=>{
  await login(page);await page.getByRole('radio',{name:'1.000 puntos 1 USDC',exact:true}).check();
  await page.evaluate(()=>{const button=Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Comprar con Phantom')!;button.click();button.click();});
  await expect(page.locator('#own-balance')).toContainText('11.000');expect((await state()).broadcasts).toBe(1);
  await expect(page.getByRole('button',{name:'Confirmar compra en Phantom',exact:true})).toHaveCount(0);
});

test('a Twitch account links Phantom during purchase and retains its account and balance',async({page})=>{
  const {randomUUID}=await import('node:crypto');
  const id=String(Date.now()),loginName=`buyer_${randomUUID().slice(0,8)}`;
  await writeFile(resolve('.e2e-fixtures/twitch-oauth.json'),JSON.stringify({id,login:loginName,display_name:loginName}));
  await page.route('https://id.twitch.tv/oauth2/authorize?**',async route=>{const url=new URL(route.request().url()),callback=new URL(url.searchParams.get('redirect_uri')!);callback.searchParams.set('state',url.searchParams.get('state')!);callback.searchParams.set('code','e2e-code');await route.fulfill({status:302,headers:{location:callback.href}});});
  await installWallet(page);await page.goto('/onboarding');await page.getByRole('button',{name:'Continuar con Twitch',exact:true}).click();await page.waitForURL(/\/app(?:[?#]|$)/);await expect(page.getByRole('button',{name:'Saldo',exact:true})).toBeVisible();
  const before=await page.evaluate(async()=>await(await fetch('/api/points/me',{headers:{Authorization:`Bearer ${localStorage.getItem('pointsToken')}`}})).json());expect(before.wallet).toBeFalsy();
  await page.getByRole('button',{name:'Saldo',exact:true}).click();await page.getByRole('radio',{name:'1.000 puntos 1 USDC',exact:true}).check();await page.getByRole('button',{name:'Comprar con Phantom',exact:true}).click();await expect(page.locator('#own-balance')).toContainText('11.000');
  const after=await page.evaluate(async()=>await(await fetch('/api/points/me',{headers:{Authorization:`Bearer ${localStorage.getItem('pointsToken')}`}})).json());expect(after.id).toBe(before.id);expect(after.wallet).toBeTruthy();expect(after.twitch.id).toBe(id);expect((await state()).broadcasts).toBe(1);
});
