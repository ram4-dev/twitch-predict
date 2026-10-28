import {test,expect,chromium} from '@playwright/test';
import {mkdtemp,cp,readFile,writeFile,rm,rename} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import type {DisplayByteMarket} from '../src/byte-model.js';
test.skip(process.env.E2E_MARKET_MODE!=='byte','Run separately with E2E_MARKET_MODE=byte for a real Byte-mode server');
test('429 renders a Twitch preview in web and MV3, then replaces it with one real market',async()=>{
 const base=process.env.APP_URL??'http://twitch-predict.localhost:1358',channel=`mirror_${randomUUID().replaceAll('-','').slice(0,10)}`;
 const native={id:randomUUID(),channel,title:'EVEN OR ODD KILLS',status:'ACTIVE',createdAt:new Date().toISOString(),predictionWindowSeconds:600,winningOutcome:null as null|{id:string},outcomes:[{id:'even',title:'EVENNNNZ :D',color:'BLUE',totalPoints:100,totalUsers:2},{id:'odd',title:'ODDSTERR :O',color:'PINK',totalPoints:200,totalUsers:3}]};
 const twitchFile=resolve('test-results/twitch-fixture.json'),byteFile=resolve('test-results/byte-fixture.json');
 await writeFile(twitchFile,JSON.stringify([native]));await writeFile(byteFile,JSON.stringify({markets:[],signatures:{},partnerError:429,broadcasts:0,resolutions:0,invalidations:0,syncs:0}));
 const profile=await mkdtemp(`${tmpdir()}/byte-twitch-extension-`),extension=resolve(profile,'extension');await cp('extension',extension,{recursive:true});
 for(const name of ['background.js','popup.js','app-config.js']){const p=resolve(extension,name);await writeFile(p,(await readFile(p,'utf8')).replaceAll('http://twitch-predict.localhost:1356',base));}

 const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
 try{
  const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker'),id=new URL(worker.url()).host;
  const panel=await context.newPage();await panel.goto(`${base}/app?channel=${channel}`);await panel.getByRole('button',{name:'Vincular extensión',exact:true}).click();await expect(panel.getByText('Extensión vinculada.',{exact:false})).toBeVisible();
  await context.route(`https://www.twitch.tv/${channel}`,r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Twitch preview fixture</title>'}));const twitch=await context.newPage();await twitch.goto(`https://www.twitch.tv/${channel}`);
  const popup=await context.newPage();await popup.setViewportSize({width:700,height:600});await popup.goto(`chrome-extension://${id}/popup.html`);
  for(const page of [popup,panel]){
   if(page===panel)await page.getByRole('button',{name:'Actualizar mercados',exact:true}).click();
   const card=page.locator('.byte-preview');await expect(card).toContainText(native.title,{timeout:20000});await expect(card).toContainText('300');await expect(card).toContainText('puntos de Twitch');await expect(card.getByRole('button',{name:'Apostar a EVENNNNZ :D',exact:true})).toBeDisabled();await expect(card.getByRole('button',{name:'Apostar a ODDSTERR :O',exact:true})).toBeDisabled();await expect(card.getByRole('textbox')).toHaveCount(0);await expect(card.getByText('Byte alcanzó su límite.',{exact:false})).toBeVisible();await expect(card.getByRole('link',{name:/Solana/})).toHaveCount(0);
  }
  await popup.reload();await expect(popup.locator('.byte-preview')).toBeVisible();await popup.screenshot({path:'test-results/byte-rate-limit-popup.png',fullPage:true});await panel.screenshot({path:'test-results/byte-rate-limit-web.png',fullPage:true});
  const preview=panel.locator('.byte-preview');const layout=await preview.evaluate(el=>{const parent=el.parentElement!,style=getComputedStyle(parent);return {width:el.getBoundingClientRect().width,available:parent.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)};});expect(layout.width).toBeCloseTo(layout.available,0);
  await panel.setViewportSize({width:390,height:844});const mobile=(await preview.boundingBox())!;expect(mobile.x).toBeGreaterThanOrEqual(0);expect(mobile.x+mobile.width).toBeLessThanOrEqual(390);await panel.screenshot({path:'test-results/byte-rate-limit-mobile-web.png',fullPage:true});await panel.setViewportSize({width:1280,height:720});
  const rejected=JSON.parse(await readFile(byteFile,'utf8'));expect(rejected.markets).toHaveLength(0);expect(rejected.broadcasts).toBe(0);delete rejected.partnerError;await writeFile(byteFile+'.update',JSON.stringify(rejected));await rename(byteFile+'.update',byteFile);
  await expect.poll(async()=>{const response=await panel.request.get(`${base}/api/byte/markets`);return ((await response.json()).markets as DisplayByteMarket[]).length;},{timeout:45000}).toBe(1);
  for(const page of [popup,panel]){await expect(page.locator('.byte-preview')).toHaveCount(0,{timeout:15000});await expect(page.getByRole('heading',{name:native.title,exact:true})).toHaveCount(1);await expect(page.getByRole('button',{name:'Apostar a EVENNNNZ :D',exact:true})).toBeEnabled();}
  expect(JSON.parse(await readFile(byteFile,'utf8')).broadcasts).toBe(0);
 }finally{await context.close();await rm(profile,{recursive:true,force:true});await writeFile(twitchFile,'[]');}
});

test('429 preview follows a verified Twitch lock and winner without creating or settling a Byte market',async()=>{
 const base=process.env.APP_URL??'http://twitch-predict.localhost:1358',channel=`mirror_${randomUUID().replaceAll('-','').slice(0,10)}`;
 const native={id:randomUUID(),channel,title:'EVEN OR ODD KILLS',status:'ACTIVE',createdAt:new Date().toISOString(),predictionWindowSeconds:600,winningOutcome:null as null|{id:string},outcomes:[{id:'even',title:'EVENNNNZ :D',color:'BLUE',totalPoints:100,totalUsers:2},{id:'odd',title:'ODDSTERR :O',color:'PINK',totalPoints:200,totalUsers:3}]};
 const twitchFile=resolve('test-results/twitch-fixture.json'),byteFile=resolve('test-results/byte-fixture.json');
 await writeFile(twitchFile,JSON.stringify([native]));await writeFile(byteFile,JSON.stringify({markets:[],signatures:{},partnerError:429,broadcasts:0,resolutions:0,invalidations:0,syncs:0}));
 const profile=await mkdtemp(`${tmpdir()}/byte-twitch-extension-`),extension=resolve(profile,'extension');await cp('extension',extension,{recursive:true});
 for(const name of ['background.js','popup.js','app-config.js']){const p=resolve(extension,name);await writeFile(p,(await readFile(p,'utf8')).replaceAll('http://twitch-predict.localhost:1356',base));}


 const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
 try{
  const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker'),id=new URL(worker.url()).host;
  const panel=await context.newPage();await panel.goto(`${base}/app?channel=${channel}`);await panel.getByRole('button',{name:'Vincular extensión',exact:true}).click();await expect(panel.getByText('Extensión vinculada.',{exact:false})).toBeVisible();
  await context.route(`https://www.twitch.tv/${channel}`,r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Twitch lifecycle fixture</title>'}));const twitch=await context.newPage();await twitch.goto(`https://www.twitch.tv/${channel}`);
  const popup=await context.newPage();await popup.setViewportSize({width:700,height:600});await popup.goto(`chrome-extension://${id}/popup.html`);await expect(popup.locator('.byte-preview')).toContainText(native.title,{timeout:20000});await panel.getByRole('button',{name:'Actualizar mercados',exact:true}).click();await expect(panel.locator('.byte-preview')).toBeVisible();
  await writeFile(twitchFile,JSON.stringify([{...native,status:'LOCKED',lockedAt:new Date().toISOString()}]));
  for(const page of [popup,panel]){await expect(page.locator('.byte-preview')).toContainText('Esperando resultado de Twitch',{timeout:15000});await expect(page.locator('.byte-preview .points-winner')).toHaveCount(0);}
  await writeFile(twitchFile,JSON.stringify([{...native,status:'RESOLVED',winningOutcome:{id:'odd'},endedAt:new Date().toISOString(),outcomes:[...native.outcomes].reverse()}]));
  for(const page of [popup,panel]){
   const card=page.locator('.byte-preview .plot-resolution.count');await expect(card).toBeVisible({timeout:15000});await expect(card).toHaveAttribute('data-state','spectator');await expect(card.locator('.resolution-result')).toContainText('ODDSTERR :O');await expect(card.locator('.resolution-outcomes')).toHaveCount(0);await expect(page.getByRole('heading',{name:native.title,exact:true})).toHaveCount(1);await expect(page.locator('.byte-preview .points-bet,.byte-preview .stake-row,.byte-preview .pool-summary')).toHaveCount(0);await expect(card.locator('.resolution-net,.resolution-receipt')).toHaveCount(0);await expect(card).toContainText('Esta ronda no tuvo mercado ni apuestas en SOL.');await expect(card.getByRole('link',{name:/Solana/})).toHaveCount(0);await card.getByRole('button',{name:'Ver detalle'}).click();await expect(card.locator('.resolution-detail')).toContainText('Resultado: ODDSTERR :O');await page.reload();await expect(card.locator('.resolution-result')).toContainText('ODDSTERR :O');
  }
  const saved=JSON.parse(await readFile(byteFile,'utf8'));expect(saved.markets).toHaveLength(0);expect(saved.broadcasts).toBe(0);expect(saved.resolutions).toBe(0);expect(saved.invalidations).toBe(0);await panel.screenshot({path:'test-results/twitch-preview-winner.png',fullPage:true});
 }finally{await context.close();await rm(profile,{recursive:true,force:true});await writeFile(twitchFile,'[]');}
});

test('canceled Twitch preview switches to the existing neutral resolution card',async()=>{
 const base=process.env.APP_URL??'http://twitch-predict.localhost:1358',channel=`mirror_${randomUUID().replaceAll('-','').slice(0,10)}`;
 const native={id:randomUUID(),channel,title:'EVEN OR ODD KILLS',status:'ACTIVE',createdAt:new Date().toISOString(),predictionWindowSeconds:600,winningOutcome:null as null|{id:string},outcomes:[{id:'even',title:'EVENNNNZ :D',color:'BLUE',totalPoints:100,totalUsers:2},{id:'odd',title:'ODDSTERR :O',color:'PINK',totalPoints:200,totalUsers:3}]};
 const twitchFile=resolve('test-results/twitch-fixture.json'),byteFile=resolve('test-results/byte-fixture.json');
 await writeFile(twitchFile,JSON.stringify([native]));await writeFile(byteFile,JSON.stringify({markets:[],signatures:{},partnerError:429,broadcasts:0,resolutions:0,invalidations:0,syncs:0}));
 const profile=await mkdtemp(`${tmpdir()}/byte-twitch-extension-`),extension=resolve(profile,'extension');await cp('extension',extension,{recursive:true});
 for(const name of ['background.js','popup.js','app-config.js']){const p=resolve(extension,name);await writeFile(p,(await readFile(p,'utf8')).replaceAll('http://twitch-predict.localhost:1356',base));}


 const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
 try{
  const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker'),id=new URL(worker.url()).host;
  const panel=await context.newPage();await panel.goto(`${base}/app?channel=${channel}`);await panel.getByRole('button',{name:'Vincular extensión',exact:true}).click();await expect(panel.getByText('Extensión vinculada.',{exact:false})).toBeVisible();
  await context.route(`https://www.twitch.tv/${channel}`,r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Twitch lifecycle fixture</title>'}));const twitch=await context.newPage();await twitch.goto(`https://www.twitch.tv/${channel}`);
  const popup=await context.newPage();await popup.setViewportSize({width:700,height:600});await popup.goto(`chrome-extension://${id}/popup.html`);await expect(popup.locator('.byte-preview')).toContainText(native.title,{timeout:20000});await panel.getByRole('button',{name:'Actualizar mercados',exact:true}).click();await expect(panel.locator('.byte-preview')).toBeVisible();
  await writeFile(twitchFile,JSON.stringify([{...native,status:'LOCKED',lockedAt:new Date().toISOString()}]));
  for(const page of [popup,panel]){await expect(page.locator('.byte-preview')).toContainText('Esperando resultado de Twitch',{timeout:15000});await expect(page.locator('.byte-preview .points-winner')).toHaveCount(0);}
  await writeFile(twitchFile,JSON.stringify([{...native,status:'CANCELED',endedAt:new Date().toISOString()}]));
  for(const page of [popup,panel]){const card=page.locator('.byte-preview .plot-resolution.count');await expect(card).toBeVisible({timeout:15000});await expect(card.locator('.resolution-meta')).toContainText('Anulada');await expect(card.locator('.winner,.loser,.resolution-net,.resolution-receipt')).toHaveCount(0);await expect(page.locator('.byte-preview .points-bet')).toHaveCount(0);await expect(card).toContainText('Twitch canceló esta ronda.');await page.reload();await expect(card).toBeVisible();}
  const saved=JSON.parse(await readFile(byteFile,'utf8'));expect(saved.markets).toHaveLength(0);expect(saved.broadcasts).toBe(0);expect(saved.resolutions).toBe(0);expect(saved.invalidations).toBe(0);await panel.screenshot({path:'test-results/twitch-preview-canceled.png',fullPage:true});
 }finally{await context.close();await rm(profile,{recursive:true,force:true});await writeFile(twitchFile,'[]');}
});
