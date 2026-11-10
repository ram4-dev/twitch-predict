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
test('consumer UI: two accounts bet, winner claims, loser cannot claim, refund persists',async({page,browser})=>{
 await signIn(page);const market=await operator(page,'/api/demo',{});
 const stake=async(target:typeof page,key:string,outcome:string,amount:number)=>{await target.reload();await target.getByRole('button',{name:'Mis apuestas',exact:true}).click();await target.getByRole('combobox',{name:'Buscar streamer'}).fill('demo_streamer');await target.getByRole('option').filter({hasText:'@demo_streamer'}).click();await target.locator(`[data-key="${key}"]`).getByRole('button',{name:`Apostar a ${outcome}`,exact:true}).click();await target.getByLabel('Puntos a apostar',{exact:true}).fill(String(amount));await target.getByRole('button',{name:'Confirmar apuesta',exact:false}).click();await expect(target.getByRole('dialog')).toHaveCount(0);};
 await stake(page,market.key,'Gana',300);await expect(page.locator('#own-balance')).toContainText('9.700');
 const second=await browser.newContext();try{const other=await second.newPage();await phantomProvider(other);await other.goto(`${base}/onboarding`);await other.getByRole('button',{name:'Conectar Phantom',exact:true}).click();await other.waitForURL('**/app#markets');await stake(other,market.key,'Pierde',700);await expect(other.locator('#own-balance')).toContainText('9.300');
 await operator(page,'/api/demo/resolve',{key:market.key,winnerId:'victory'});await page.getByRole('button',{name:'Mis jugadas',exact:true}).click();await page.reload();const receipt=page.locator(`[data-position-key="${market.key}"]`);await receipt.getByRole('button',{name:'Cobrar 1.000 pts',exact:true}).click();await expect(page.locator('#own-balance')).toContainText('10.700');expect((await ownRequest(page,'/api/points/claim',{key:market.key,requestId:randomUUID()})).status).toBe(400);
 await other.getByRole('button',{name:'Mis jugadas',exact:true}).click();await other.reload();const loss=other.locator(`[data-position-key="${market.key}"]`);await expect(loss).toContainText('Neto-700 pts');await expect(loss.getByRole('button')).toHaveCount(0);
 const refund=await operator(page,'/api/demo',{});await stake(page,refund.key,'Gana',200);await expect(page.locator('#own-balance')).toContainText('10.500');await operator(page,'/api/demo/resolve',{key:refund.key,winnerId:null});await page.getByRole('button',{name:'Mis jugadas',exact:true}).click();await page.reload();const refunded=page.locator(`[data-position-key="${refund.key}"]`);// Automatic refund: credited inside the cancellation itself, no claim button, never double-credited.
await expect(page.locator('#own-balance')).toContainText('10.700');await expect(refunded).toContainText('Reembolso');await expect(refunded).toContainText('Neto0 pts');await expect(refunded.getByRole('button',{name:/Cobrar/})).toHaveCount(0);expect((await ownRequest(page,'/api/points/claim',{key:refund.key,requestId:randomUUID()})).status).toBe(400);
 }finally{await second.close();}
});
test('MV3 detects a prediction, automatically creates one mirror, bets own points and claims after server tracks Twitch result without extension polling',async()=>{
  const profile=await mkdtemp(`${tmpdir()}/points-extension-`);const extension=resolve(profile,'extension');await cp(resolve('extension'),extension,{recursive:true});
  for(const file of ['background.js','popup.js','app-config.js']){const path=resolve(extension,file);await writeFile(path,(await readFile(path,'utf8')).replaceAll('http://twitch-predict.localhost:1356',base));}
  const prediction={id:randomUUID(),channel:`fixture_${randomUUID().replaceAll('-','').slice(0,12)}`,title:'¿Gana el equipo azul?',status:'ACTIVE',createdAt:new Date().toISOString(),predictionWindowSeconds:600,lockedAt:null,endedAt:null,winningOutcome:null as null|{id:string},outcomes:[{id:'blue',title:'Azul',color:'BLUE',totalPoints:9_000_000,totalUsers:500},{id:'red',title:'Rojo',color:'PINK',totalPoints:1_000_000,totalUsers:200}]};
  await writeFile(fixture,JSON.stringify([prediction]));
  const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  try{
    await context.route('http://twitch-predict.localhost:1356/**',async route=>{const url=new URL(route.request().url());const response=await route.fetch({url:`${base}${url.pathname}${url.search}`});await route.fulfill({response});});
    await context.route('https://gql.twitch.tv/gql',route=>route.fulfill({json:{data:{channel:{activePredictionEvents:prediction.status==='ACTIVE'?[prediction]:[]}}}}));
    await context.route(`https://www.twitch.tv/${prediction.channel}`,route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Twitch fixture</title>'}));
    const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');const id=new URL(worker.url()).host;
    const dashboard=await context.newPage();await dashboard.goto(`${base}/app`);
    await phantomProvider(context);
    await expect.poll(()=>context.pages().find(p=>p.url().includes('/onboarding#flow='))?.url(),{timeout:15000}).toBeTruthy();
    // This install tab may have been created while exposeBinding was being registered.
    // Continue the same real auth flow in a new document created after fixture installation.
    const installedTab=context.pages().find(p=>p.url().includes('/onboarding#flow='))!;
    const onboarding=await context.newPage();await onboarding.goto(installedTab.url());await installedTab.close();
    await onboarding.getByRole('button',{name:'Conectar Phantom',exact:true}).click();await onboarding.waitForURL('**/app#markets');
    const twitch=await context.newPage();await twitch.goto(`https://www.twitch.tv/${prediction.channel}`);
    const popup=await context.newPage();await popup.goto(`chrome-extension://${id}/popup.html`);await expect(popup.getByRole('heading',{name:prediction.title})).toBeVisible();await expect(popup.locator('.points-pool')).toContainText('0 pts');await expect(popup.locator('#own-balance')).toHaveText('10,000');
    await popup.getByLabel('Points to stake').fill('250');await popup.getByRole('button',{name:'Refresh prediction',exact:true}).click();await expect(popup.getByRole('button',{name:'Refresh prediction',exact:true})).toBeEnabled();await expect(popup.getByLabel('Points to stake')).toHaveValue('250');await popup.getByRole('button',{name:'Stake on Azul',exact:true}).click();await expect(popup.locator('#own-balance')).toHaveText('9,750');await expect(popup.locator('.points-pool')).toContainText('250 pts');
    await popup.screenshot({path:'test-results/offchain-extension.png',fullPage:true});
    const [userConsole]=await Promise.all([context.waitForEvent('page'),popup.getByRole('link',{name:'My stakes ↗',exact:true}).click()]);await userConsole.waitForURL('**/app#history');await expect(userConsole.locator('h1')).toHaveText('Mis apuestas');await expect(userConsole.locator('#own-balance')).toContainText('9.750');await userConsole.close();
    await popup.close();await twitch.close();
    prediction.status='RESOLVED';prediction.winningOutcome={id:'blue'};await writeFile(fixture,JSON.stringify([prediction]));
    await expect.poll(async()=>{const r=await dashboard.request.get(`${base}/api/markets`);return (await r.json()).find((m:{prediction:{id:string}})=>m.prediction.id===prediction.id)?.phase;},{timeout:20000}).toBe('resolved');
    const reopened=await context.newPage();await reopened.goto(`chrome-extension://${id}/popup.html`);await expect(reopened.locator('#own-balance')).toHaveText('9,750');const resolution=reopened.locator('.plot-resolution.count');await expect(resolution).toHaveAttribute('data-state','won');await expect(resolution.locator('.resolution-result')).toContainText('Azul');await expect(resolution.locator('.resolution-outcomes')).toHaveCount(0);await expect(resolution.locator('.resolution-net')).toHaveText('0 pts');await expect(resolution.locator('.resolution-receipt')).toContainText('250 pts');
    expect(await resolution.evaluate(el=>getComputedStyle(el,'::before').animationName)).toBe('none');
    const claim=reopened.getByRole('button',{name:'Claim 250 pts',exact:true});
    const claimPosition=await claim.boundingBox();expect(claimPosition!.y+claimPosition!.height).toBeLessThan(560);
    await claim.click();await expect(reopened.locator('#own-balance')).toHaveText('10,000');await expect(resolution.locator('.resolution-credited')).toContainText('Payout credited');await expect(resolution.locator('.resolution-net')).toHaveText('0 pts');await expect(resolution.locator('.points-claim')).toHaveCount(0);
    await expect(resolution.locator('.resolution-count')).toHaveAttribute('data-complete','true');const amountNode=await resolution.locator('.resolution-count').elementHandle();
    await reopened.getByRole('button',{name:'Refresh prediction',exact:true}).click();await expect(reopened.getByRole('button',{name:'Refresh prediction',exact:true})).toBeEnabled();
    expect(await resolution.locator('.resolution-count').evaluate((el,previous)=>el===previous,amountNode)).toBe(true);await expect(resolution.locator('.resolution-count')).toHaveAttribute('data-complete','true');
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
    await page.goto('/app');await operator(page,'/api/channels',{channel:source.channel});await page.reload();const card=page.locator(`[data-key="offchain:${source.channel}:${source.id}"]`);await expect(card).toBeVisible();await expect(card.locator('.phone-market-meta')).toContainText('0 pts');
    const response=await page.request.get('/api/markets');const markets=await response.json();expect(markets.some((m:{prediction:{id:string}})=>m.prediction.id===expired.id)).toBe(false);
    const mirrored=await operator(page,'/api/predictions',{...source,title:'Untrusted title'});expect(mirrored.prediction.title).toBe(source.title);expect(mirrored.totalPoints).toBe(0);
  }finally{await writeFile(fixture,'[]');}
});
