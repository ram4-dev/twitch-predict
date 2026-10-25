import {test,expect,chromium} from '@playwright/test';
import {mkdtemp,rm,cp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {phantomProvider,testWallet,signIn} from './fixtures/phantom.js';
const base=process.env.APP_URL??'http://twitch-predict.localhost:1358';
test.skip(process.env.MARKET_MODE==='solana','Offchain onboarding');
test('install → Phantom signature → automatic extension link → dashboard; same wallet keeps balance and history in another browser',async({browser})=>{
  const profile=await mkdtemp(`${tmpdir()}/phantom-install-`);const extension=resolve(profile,'extension');await cp(resolve('extension'),extension,{recursive:true});
  // Only the deployment URL changes; wallet verification and extension messaging use production code.
  for(const file of ['background.js','popup.js']){const path=resolve(extension,file);await writeFile(path,(await readFile(path,'utf8')).replaceAll('http://twitch-predict.localhost:1356',base));}
  const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  try{
    const wallet=await phantomProvider(context);const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
    await expect.poll(()=>context.pages().find(p=>p.url().includes('/onboarding#flow='))?.url(),{timeout:15000}).toBeTruthy();
    const onboarding=context.pages().find(p=>p.url().includes('/onboarding#flow='))!;await onboarding.reload();
    await onboarding.getByRole('button',{name:'Conectar Phantom',exact:true}).click();await onboarding.waitForURL(`${base}/#markets`);
    await expect(onboarding.locator('#own-balance')).toHaveText('10.000');
    const web=await onboarding.evaluate(async()=>{const r=await fetch('/api/points/me',{headers:{Authorization:`Bearer ${localStorage.getItem('pointsToken')}`}});return r.json();});
    const ext=await worker.evaluate(async url=>{const s=await (globalThis as unknown as {chrome:{storage:{local:{get(keys:string[]):Promise<{pointsToken:string;bridgeToken:string;pendingAuth:unknown}>}}}}).chrome.storage.local.get(['pointsToken','bridgeToken','pendingAuth']);const r=await fetch(`${url}/api/points/me`,{headers:{Authorization:`Bearer ${s.pointsToken}`}});return {account:await r.json(),paired:!!s.bridgeToken,pending:s.pendingAuth};},base);
    expect(ext.account.id).toBe(web.id);expect(ext.account.wallet).toBe(wallet.address);expect(ext.paired).toBe(true);expect(ext.pending).toBeNull();
    const created=await onboarding.evaluate(async()=>{const {token}=await(await fetch('/api/pair')).json();return(await fetch('/api/demo',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:'{}'})).json();});
    await onboarding.reload();const card=onboarding.locator(`[data-key="${created.key}"]`);await card.getByLabel('Puntos a apostar').fill('400');await card.getByRole('button',{name:'Apostar a Gana',exact:true}).click();await expect(onboarding.locator('#own-balance')).toHaveText('9.600');
    const id=new URL(worker.url()).host;const popup=await context.newPage();await popup.goto(`chrome-extension://${id}/popup.html`);await expect(popup.locator('#own-balance')).toHaveText('9.600');await expect(popup.locator('#login')).toBeHidden();await expect(popup.locator('#history')).toContainText('400 pts');
    const otherContext=await browser.newContext();try{const other=await otherContext.newPage();await phantomProvider(other,wallet);await other.goto(`${base}/onboarding`);await other.getByRole('button',{name:'Conectar Phantom',exact:true}).click();await other.waitForURL(`${base}/#markets`);await expect(other.locator('#own-balance')).toHaveText('9.600');await other.getByRole('link',{name:'Mis apuestas',exact:true}).click();await expect(other.locator('#history')).toContainText('400 pts');}finally{await otherContext.close();}
    await onboarding.screenshot({path:'test-results/phantom-linked-dashboard.png',fullPage:true});
  }finally{await context.close();await rm(profile,{recursive:true,force:true});}
});
test('missing Phantom and a rejected connection keep the user on onboarding without creating an account',async({page})=>{
  await page.goto('/onboarding');await expect(page.getByRole('link',{name:'Instalar Phantom',exact:true})).toBeVisible();expect(await page.evaluate(()=>localStorage.getItem('pointsToken'))).toBeNull();
  await phantomProvider(page,testWallet(),true);await page.reload();await page.getByRole('button',{name:'Conectar Phantom',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Cancelaste');expect(await page.evaluate(()=>localStorage.getItem('pointsToken'))).toBeNull();
  await page.screenshot({path:'test-results/phantom-canceled.png',fullPage:true});
});
test('login uses a server challenge; a forged signature cannot create a session or grant points',async({page})=>{
  await page.goto('/onboarding');const wallet=testWallet();
  const result=await page.evaluate(async address=>{const c=await(await fetch('/api/auth/challenge',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({address})})).json();const r=await fetch('/api/auth/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({challengeId:c.challengeId,signature:btoa(String.fromCharCode(...new Uint8Array(64)))})});return {status:r.status,body:await r.json()};},wallet.address);
  expect(result.status).toBe(400);expect(result.body.token).toBeUndefined();expect(result.body.error).toContain('firma');
  await signIn(page);await expect(page.locator('#own-balance')).toHaveText('10.000');
});
