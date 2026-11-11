import {test,expect,chromium,type Page,type BrowserContext} from '@playwright/test';
import {mkdtemp,rm,cp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {signIn} from './fixtures/phantom.js';
const base=process.env.APP_URL??'http://twitch-predict.localhost:1358';
async function twitch(target:Page|BrowserContext){
 const id=String(Date.now()),login=`viewer_${randomUUID().replaceAll('-','').slice(0,9)}`;
 await writeFile(resolve('.e2e-fixtures/twitch-oauth.json'),JSON.stringify({id,login,display_name:login}));
 await target.route('https://id.twitch.tv/oauth2/authorize?**',async route=>{
  const url=new URL(route.request().url()),callback=new URL(url.searchParams.get('redirect_uri')!);
  callback.searchParams.set('state',url.searchParams.get('state')!);callback.searchParams.set('code','e2e-code');
  await route.fulfill({status:302,headers:{location:callback.href}});
 });
 return {id,login};
}
async function api(page:Page,path:string,body?:object){
 return page.evaluate(async({path,body})=>{
  const r=await fetch(path,{method:body?'POST':'GET',headers:{'content-type':'application/json',Authorization:`Bearer ${localStorage.getItem('pointsToken')??''}`},...(body?{body:JSON.stringify(body)}:{})});
  return {status:r.status,body:await r.json()};
 },{path,body});
}
async function demo(page:Page){return page.evaluate(async()=>{
 const {token}=await(await fetch('/api/pair')).json();
 return (await fetch('/api/demo',{method:'POST',headers:{Authorization:`Bearer ${token}`}})).json();
});}

test('anonymous, expired and providerless sessions show a login card without profile or active bets',async({page})=>{
 await page.goto('/app#profile');
 const login=page.getByRole('region',{name:'Iniciar sesión'});
 await expect(login.getByRole('link',{name:'Continuar con Twitch'})).toBeVisible();
 await expect(login.getByRole('link',{name:'Conectar Phantom'})).toBeVisible();
 await expect(page.locator('.phone-profile,.phone-market')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Mi perfil',exact:true})).toBeHidden();
 await expect(page.locator('#own-balance')).toBeHidden();
 for(const width of [700,360]){
  await page.setViewportSize({width,height:600});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`test-results/points-sign-in-${width}.png`});
 }
 await page.evaluate(()=>localStorage.setItem('pointsToken','expired-session'));
 await page.reload();await expect(login).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>localStorage.getItem('pointsToken'))).toBeNull();
 await twitch(page);await login.getByRole('link',{name:'Continuar con Twitch'}).click();
 await expect(page.locator('.phone-profile')).toBeVisible({timeout:20000});
 const me=await api(page,'/api/points/me');expect(me.body.wallet).toBeNull();expect(me.body.balance).toBe(10000);
 const market=await demo(page);
 await page.getByRole('button',{name:'Desconectar',exact:true}).click();
 await expect(login).toBeVisible();
 await page.goto('/app#history');await expect(login).toBeVisible();await expect(page.locator('#own-balance')).toBeHidden();
 await expect(page.locator('.phone-profile,.phone-market,.phone-position')).toHaveCount(0);
 const denied=await api(page,'/api/points/bet',{key:market.key,outcomeId:'victory',amount:100,requestId:randomUUID()});
 expect(denied.status).toBe(400);expect(denied.body.error).toContain('Twitch o Phantom');
 await login.getByRole('link',{name:'Continuar con Twitch'}).click();await expect(page.locator('.phone-profile')).toBeVisible({timeout:20000});
 const restored=await api(page,'/api/points/me');expect(restored.body.id).toBe(me.body.id);expect(restored.body.balance).toBe(10000);
 expect(restored.body.ledger.filter((l:{kind:string})=>l.kind==='welcome')).toHaveLength(1);
});

test('Twitch alone can spend existing points in the app and public page without a Phantom provider',async({page,browser})=>{
 await twitch(page);await page.goto('/app');await page.getByRole('link',{name:'Continuar con Twitch'}).click();
 await expect(page.locator('.phone-profile')).toBeVisible({timeout:20000});
 expect(await page.evaluate(()=>!!(window as unknown as {phantom?:unknown}).phantom)).toBe(false);
 const owner=await browser.newPage();let market:{key:string},login:string;
 try{
  const identity=await twitch(owner);login=identity.login;
  await signIn(owner);
  const start=await api(owner,'/api/twitch/start',{});await owner.goto(start.body.url);
  await expect(owner.locator('.phone-profile')).toBeVisible({timeout:20000});
  const created=await api(owner,'/api/streamer/markets',{channelLogin:login,title:'¿Gana el equipo?',options:['Gana','Pierde'],durationSeconds:1800,intentId:randomUUID()});
  expect(created.status).toBe(201);market=created.body;
 }finally{await owner.close();}
 for(const path of [`/app?channel=${login!}`,`/s/twitch/${login!}`]){
  await page.goto(path);
  const card=page.locator(`[data-key="${market!.key}"]`);
  await card.getByRole('button',{name:'Apostar a Gana',exact:true}).click();
  const dialog=page.getByRole('dialog');await expect(dialog.getByLabel('Puntos a apostar',{exact:true})).toBeVisible();
  await expect(dialog.getByRole('link',{name:/Phantom/})).toHaveCount(0);
  await dialog.getByRole('button',{name:'Confirmar apuesta',exact:false}).click();await expect(dialog).toHaveCount(0);
 }
 const me=await api(page,'/api/points/me');expect(me.body.wallet).toBeNull();expect(me.body.balance).toBe(9800);expect(me.body.bets.filter((b:{marketKey:string})=>b.marketKey===market!.key)).toHaveLength(2);
 await page.goto('/app#profile');await expect(page.locator('.phone-profile')).toBeVisible({timeout:20000});await expect(page.locator('#own-balance')).toContainText('9.800');
});

test('extension signs in with Twitch and spends internal points without connecting Phantom',async()=>{
 test.setTimeout(120000);
 const profile=await mkdtemp(`${tmpdir()}/twitch-extension-`),extension=resolve(profile,'extension');await cp(resolve('extension'),extension,{recursive:true});
 for(const file of ['background.js','popup.js','app-config.js']){const path=resolve(extension,file);await writeFile(path,(await readFile(path,'utf8')).replaceAll('http://twitch-predict.localhost:1356',base));}
 const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
 try{
  const identity=await twitch(context),worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
  await expect.poll(()=>context.pages().find(p=>p.url().includes('/onboarding#flow='))?.url(),{timeout:15000}).toBeTruthy();
  const page=context.pages().find(p=>p.url().includes('/onboarding#flow='))!;
  await page.getByRole('button',{name:'Continuar con Twitch'}).click();
  await page.waitForURL(`${base}/app#markets`);await expect(page.locator('#own-balance')).toContainText('10.000');
  const stored=await worker.evaluate(async()=>{
   const chrome=(globalThis as unknown as {chrome:{storage:{local:{get(keys:string[]):Promise<{pointsToken:string;walletAddress:unknown;pendingAuth:unknown}>}}}}).chrome;
   const state=await chrome.storage.local.get(['pointsToken','walletAddress','pendingAuth']);return {linked:!!state.pointsToken,wallet:state.walletAddress,pending:state.pendingAuth};
  });
  expect(stored).toEqual({linked:true,wallet:null,pending:null});
  const market=await demo(page);const popup=await context.newPage();await popup.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
  await expect(popup.locator('#login')).toBeHidden();await expect(popup.locator('#account-name')).toContainText(`@${identity.login}`);
  const card=popup.locator(`[data-market-key="${market.key}"]`);
  await card.getByRole('button',{name:'Stake on Gana',exact:true}).click();
  await expect(popup.locator('#own-balance')).toHaveText('9,900');
  expect((await api(page,'/api/points/me')).body.wallet).toBeNull();
 }finally{await context.close();await rm(profile,{recursive:true,force:true});}
});
