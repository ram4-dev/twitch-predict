import {test,expect,chromium,type Page} from '@playwright/test';
import {mkdtemp,rm,writeFile,cp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {signIn,phantomProvider} from './fixtures/phantom.js';
const fixture=resolve('test-results/twitch-fixture.json');
const base=process.env.APP_URL??'http://twitch-predict.localhost:1358';
async function operator(page:Page,path:string,body:unknown){return page.evaluate(async({path,body})=>{const {token}=await(await fetch('/api/pair')).json();const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(body)});if(!r.ok)throw new Error((await r.json()).error);return r.json();},{path,body});}
async function ownRequest(page:Page,path:string,body:unknown){return page.evaluate(async({path,body})=>{const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${localStorage.getItem('pointsToken')}`},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};},{path,body});}
test.skip(process.env.MARKET_MODE==='solana','Offchain flow');
test('consumer UI: two separate accounts bet, winner claims, loser cannot claim; refund and reload retain points',async({page,browser})=>{
  await signIn(page);await page.goto('/');await expect(page.locator('#own-balance')).toHaveText('10.000');
  const market=await operator(page,'/api/demo',{});await page.reload();const card=page.locator(`[data-key="${market.key}"]`);
  await card.getByLabel('Puntos a apostar').fill('300');await card.getByRole('button',{name:'Apostar a Gana',exact:true}).click();await expect(page.locator('#own-balance')).toHaveText('9.700');
  const second=await browser.newContext();const other=await second.newPage();await phantomProvider(other);await other.goto(`${base}/onboarding`);await other.getByRole('button',{name:'Conectar Phantom',exact:true}).click();await other.waitForURL('**/#markets');await other.goto(base);await expect(other.locator('#own-balance')).toHaveText('10.000');const otherCard=other.locator(`[data-key="${market.key}"]`);
  await otherCard.getByLabel('Puntos a apostar').fill('700');await otherCard.getByRole('button',{name:'Apostar a Pierde',exact:true}).click();await expect(other.locator('#own-balance')).toHaveText('9.300');
  await page.reload();await expect(card.locator('.points-pool')).toContainText('1.000 pts');
  await card.getByText('Resolver este ejemplo').click();await card.getByRole('button',{name:'Dar ganador: Gana',exact:true}).click();
  await card.getByRole('button',{name:'Cobrar 1.000 pts',exact:true}).click();await expect(page.locator('#own-balance')).toHaveText('10.700');
  const duplicate=await ownRequest(page,'/api/points/claim',{key:market.key,requestId:randomUUID()});expect(duplicate.status).toBe(400);
  await other.reload();await expect(otherCard).toContainText('Tu opción no ganó');await expect(otherCard.locator('.points-claim')).toHaveCount(0);
  const refund=await operator(page,'/api/demo',{});await page.reload();const refundCard=page.locator(`[data-key="${refund.key}"]`);await refundCard.getByLabel('Puntos a apostar').fill('200');await refundCard.getByRole('button',{name:'Apostar a Gana',exact:true}).click();await expect(page.locator('#own-balance')).toHaveText('10.500');
  await refundCard.getByText('Resolver este ejemplo').click();await refundCard.getByRole('button',{name:'Cancelar y reembolsar',exact:true}).click();await refundCard.getByRole('button',{name:'Recuperar 200 pts',exact:true}).click();await expect(page.locator('#own-balance')).toHaveText('10.700');await page.reload();await expect(page.locator('#own-balance')).toHaveText('10.700');
  await page.screenshot({path:'test-results/offchain-dashboard.png',fullPage:true});await second.close();
});
test('MV3 detects a prediction, automatically creates one mirror, bets own points and claims after server tracks Twitch result without extension polling',async()=>{
  const profile=await mkdtemp(`${tmpdir()}/points-extension-`);const extension=resolve(profile,'extension');await cp(resolve('extension'),extension,{recursive:true});
  for(const file of ['background.js','popup.js']){const path=resolve(extension,file);await writeFile(path,(await readFile(path,'utf8')).replaceAll('http://twitch-predict.localhost:1356',base));}
  const prediction={id:randomUUID(),channel:`fixture_${randomUUID().replaceAll('-','').slice(0,12)}`,title:'¿Gana el equipo azul?',status:'ACTIVE',createdAt:new Date().toISOString(),predictionWindowSeconds:600,lockedAt:null,endedAt:null,winningOutcome:null as null|{id:string},outcomes:[{id:'blue',title:'Azul',color:'BLUE',totalPoints:9_000_000,totalUsers:500},{id:'red',title:'Rojo',color:'PINK',totalPoints:1_000_000,totalUsers:200}]};
  await writeFile(fixture,JSON.stringify([prediction]));
  const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  try{
    await context.route('http://twitch-predict.localhost:1356/**',async route=>{const url=new URL(route.request().url());const response=await route.fetch({url:`${base}${url.pathname}${url.search}`});await route.fulfill({response});});
    await context.route('https://gql.twitch.tv/gql',route=>route.fulfill({json:{data:{channel:{activePredictionEvents:prediction.status==='ACTIVE'?[prediction]:[]}}}}));
    await context.route(`https://www.twitch.tv/${prediction.channel}`,route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Twitch fixture</title>'}));
    const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');const id=new URL(worker.url()).host;
    const dashboard=await context.newPage();await dashboard.goto(base);
    await phantomProvider(context);
    await expect.poll(()=>context.pages().find(p=>p.url().includes('/onboarding#flow='))?.url(),{timeout:15000}).toBeTruthy();
    // This install tab may have been created while exposeBinding was being registered.
    // Continue the same real auth flow in a new document created after fixture installation.
    const installedTab=context.pages().find(p=>p.url().includes('/onboarding#flow='))!;
    const onboarding=await context.newPage();await onboarding.goto(installedTab.url());await installedTab.close();
    await onboarding.getByRole('button',{name:'Conectar Phantom',exact:true}).click();await onboarding.waitForURL('**/#markets');
    const twitch=await context.newPage();await twitch.goto(`https://www.twitch.tv/${prediction.channel}`);
    const popup=await context.newPage();await popup.goto(`chrome-extension://${id}/popup.html`);await expect(popup.getByRole('heading',{name:prediction.title})).toBeVisible();await expect(popup.locator('.points-pool')).toContainText('0 pts');await expect(popup.locator('#own-balance')).toHaveText('10.000');
    await popup.getByLabel('Puntos a apostar').fill('250');await popup.getByRole('button',{name:'Actualizar predicción',exact:true}).click();await expect(popup.getByRole('button',{name:'Actualizar predicción',exact:true})).toBeEnabled();await expect(popup.getByLabel('Puntos a apostar')).toHaveValue('250');await popup.getByRole('button',{name:'Apostar a Azul',exact:true}).click();await expect(popup.locator('#own-balance')).toHaveText('9.750');await expect(popup.locator('.points-pool')).toContainText('250 pts');
    await popup.screenshot({path:'test-results/offchain-extension.png',fullPage:true});
    const [userConsole]=await Promise.all([context.waitForEvent('page'),popup.getByRole('link',{name:'Mis apuestas ↗',exact:true}).click()]);await userConsole.waitForURL('**/#history');await expect(userConsole.locator('h1')).toHaveText('Mis apuestas');await expect(userConsole.locator('#own-balance')).toHaveText('9.750');await userConsole.close();
    await popup.close();await twitch.close();
    prediction.status='RESOLVED';prediction.winningOutcome={id:'blue'};await writeFile(fixture,JSON.stringify([prediction]));
    await expect.poll(async()=>{const r=await dashboard.request.get(`${base}/api/markets`);return (await r.json()).find((m:{prediction:{id:string}})=>m.prediction.id===prediction.id)?.phase;},{timeout:20000}).toBe('resolved');
    const reopened=await context.newPage();await reopened.goto(`chrome-extension://${id}/popup.html`);await expect(reopened.locator('#own-balance')).toHaveText('9.750');const resolution=reopened.locator('.plot-resolution.liquid');await expect(resolution).toHaveAttribute('data-state','won');await expect(resolution.locator('.winner')).toContainText('Azul');await expect(resolution.locator('.loser')).toContainText('Rojo');await expect(resolution.locator('.resolution-net')).toHaveText('0 pts');await expect(resolution.locator('.resolution-receipt')).toContainText('250 pts');
    expect(await resolution.evaluate(el=>getComputedStyle(el,'::before').animationName)).toBe('liquid-reflection');
    const claim=reopened.getByRole('button',{name:'Cobrar 250 pts',exact:true});
    const claimPosition=await claim.boundingBox();expect(claimPosition!.y+claimPosition!.height).toBeLessThan(560);
    await claim.click();await expect(reopened.locator('#own-balance')).toHaveText('10.000');await expect(resolution.locator('.resolution-credited')).toContainText('Cobro acreditado');await expect(resolution.locator('.resolution-net')).toHaveText('0 pts');await expect(resolution.locator('.points-claim')).toHaveCount(0);
    const timeline=await resolution.evaluate(el=>el.getAnimations({subtree:true}).find(a=>(a as CSSAnimation).animationName==='liquid-reflection')?.currentTime);
    await reopened.getByRole('button',{name:'Actualizar predicción',exact:true}).click();await expect(reopened.getByRole('button',{name:'Actualizar predicción',exact:true})).toBeEnabled();
    expect(await resolution.evaluate(el=>Number(el.getAnimations({subtree:true}).find(a=>(a as CSSAnimation).animationName==='liquid-reflection')?.currentTime??0))).toBeGreaterThanOrEqual(Number(timeline??0));
    await reopened.screenshot({path:'test-results/liquid-extension-settled.png',fullPage:true});
    await reopened.emulateMedia({reducedMotion:'reduce'});expect(await resolution.evaluate(el=>getComputedStyle(el,'::before').animationName)).toBe('none');
    const all=await(await dashboard.request.get(`${base}/api/markets`)).json();expect(all.filter((m:{prediction:{id:string}})=>m.prediction.id===prediction.id)).toHaveLength(1);
    const live=all.find((m:{prediction:{id:string}})=>m.prediction.id===prediction.id);
    await expect(operator(dashboard,'/api/demo/resolve',{key:live.key,winnerId:'red'})).rejects.toThrow(/Solo/);
  }finally{await context.close();await rm(profile,{recursive:true,force:true});await writeFile(fixture,'[]');}
});

test('following a channel creates a fresh mirror automatically and skips an expired ACTIVE entry',async({page})=>{
  const source={id:randomUUID(),channel:'watched_fixture',title:'Predicción del canal seguido',status:'ACTIVE',createdAt:new Date().toISOString(),predictionWindowSeconds:600,outcomes:[{id:'yes',title:'Sí',totalPoints:999999,totalUsers:100},{id:'no',title:'No',totalPoints:111111,totalUsers:20}]};
  const expired={...source,id:randomUUID(),createdAt:new Date(Date.now()-3600_000).toISOString()};
  await writeFile(fixture,JSON.stringify([expired,source]));
  try {
    await page.goto('/#channels');await page.getByLabel('Canal de Twitch',{exact:true}).fill(source.channel);await page.getByRole('button',{name:'Agregar streamer',exact:true}).click();
    await page.getByRole('link',{name:'Mercados',exact:true}).click();const card=page.locator(`[data-key="offchain:${source.channel}:${source.id}"]`);await expect(card).toBeVisible();await expect(card.locator('.points-pool')).toContainText('0 pts');
    const response=await page.request.get('/api/markets');const markets=await response.json();expect(markets.some((m:{prediction:{id:string}})=>m.prediction.id===expired.id)).toBe(false);
    const mirrored=await operator(page,'/api/predictions',{...source,title:'Untrusted title'});expect(mirrored.prediction.title).toBe(source.title);expect(mirrored.totalPoints).toBe(0);
  }finally{await writeFile(fixture,'[]');}
});
