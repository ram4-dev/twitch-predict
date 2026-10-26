import {test,expect,chromium} from '@playwright/test';
import {mkdtemp,cp,readFile,writeFile,rm,rename} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import type {DisplayByteMarket} from '../src/byte-model.js';
test.skip(process.env.E2E_MARKET_MODE!=='byte','Run separately with E2E_MARKET_MODE=byte for a real Byte-mode server');
test('MV3 detects a Twitch prediction, creates exactly one Byte mirror and tracks resolution without Twitch tabs',async()=>{
 const base=process.env.APP_URL??'http://twitch-predict.localhost:1358',channel=`mirror_${randomUUID().replaceAll('-','').slice(0,10)}`;
 const native={id:randomUUID(),channel,title:'EVEN OR ODD KILLS',status:'ACTIVE',createdAt:new Date().toISOString(),predictionWindowSeconds:600,winningOutcome:null as null|{id:string},outcomes:[{id:'even',title:'EVENNNNZ :D',color:'BLUE',totalPoints:100,totalUsers:2},{id:'odd',title:'ODDSTERR :O',color:'PINK',totalPoints:200,totalUsers:3}]};
 const twitchFile=resolve('test-results/twitch-fixture.json'),byteFile=resolve('test-results/byte-fixture.json');
 await writeFile(twitchFile,JSON.stringify([native]));await writeFile(byteFile,JSON.stringify({markets:[],signatures:{},broadcasts:0,resolutions:0,invalidations:0,syncs:0}));
 const profile=await mkdtemp(`${tmpdir()}/byte-twitch-extension-`),extension=resolve(profile,'extension');await cp('extension',extension,{recursive:true});
 for(const name of ['background.js','popup.js']){const p=resolve(extension,name);await writeFile(p,(await readFile(p,'utf8')).replaceAll('http://twitch-predict.localhost:1356',base));}
 let releaseWatch:(()=>void)|undefined;
 const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
 try{
  const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker'),id=new URL(worker.url()).host;
  const panel=await context.newPage();await panel.goto(base);await panel.getByRole('button',{name:'Vincular extensión',exact:true}).click();await expect(panel.getByText('Extensión vinculada.',{exact:false})).toBeVisible();
  await context.route(`https://www.twitch.tv/${channel}`,r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Twitch prediction fixture</title>'}));
  const twitch=await context.newPage();await twitch.goto(`https://www.twitch.tv/${channel}`);
  const popup=await context.newPage();await popup.goto(`chrome-extension://${id}/popup.html`);await expect(popup.getByRole('heading',{name:native.title,exact:true})).toBeVisible({timeout:20000});
  await expect(popup.locator('.points-options')).toContainText('EVENNNNZ :D');await expect(popup.locator('.points-options')).toContainText('ODDSTERR :O');await expect(popup.locator('.points-bet')).toHaveCount(2);
  const list=async()=>{const r=await panel.request.get(`${base}/api/byte/markets`);return (await r.json()).markets as DisplayByteMarket[];};
  const mirrored=(await list())[0];expect((await list()).length).toBe(1);expect(mirrored.notes?.channel).toBe(channel);expect(mirrored.notes?.twitch?.predictionId).toBe(native.id);expect(mirrored.closeMs).toBeLessThanOrEqual(Date.parse(native.createdAt)+600000);
  await popup.getByRole('button',{name:'Actualizar predicción',exact:true}).click();await expect(popup.getByRole('button',{name:'Actualizar predicción',exact:true})).toBeEnabled();expect((await list()).length).toBe(1);
  const points=await panel.request.get(`${base}/api/markets`);expect(await points.json()).toEqual([]);
  // Simulate a legacy/disconnected Twitch snapshot whose Byte ID is missing.
  // The source event is the same, so it must remain a single market card.
  let watchWaiting=false;
  const watchGate=new Promise<void>(resolve=>{releaseWatch=resolve;});
  await context.route('**/api/byte/twitch/watch',async route=>{watchWaiting=true;await watchGate;await route.continue();});
  await expect.poll(()=>watchWaiting,{timeout:10000}).toBe(true);
  await worker.evaluate(async({channel,native})=>{
   const storage=(globalThis as unknown as {chrome:{storage:{local:{set(value:unknown):Promise<void>}}}}).chrome.storage.local;
   await storage.set({[`channel:${channel}`]:{channel,mode:'byte',fetchedAt:new Date().toISOString(),predictions:[{prediction:native,market:{state:'closed'}}]}});
  },{channel,native});
  await expect(popup.locator('.prediction')).toHaveCount(1);
  await expect(popup.getByRole('heading',{name:native.title,exact:true})).toHaveCount(1);
  await popup.evaluate(()=>{(window as unknown as {originalMarket:Element|null}).originalMarket=document.querySelector('[data-market-id]');});
  await twitch.close();
  const state=JSON.parse(await readFile(byteFile,'utf8'));state.markets[0].closeMs=Date.now()-1;state.markets[0].resolvable=true;state.markets[0].pools=[10000000,20000000];state.markets[0].total=30000000;state.markets[0].bettors=2;await writeFile(byteFile+'.update',JSON.stringify(state));await rename(byteFile+'.update',byteFile);
  native.status='LOCKED';await writeFile(twitchFile,JSON.stringify([native]));
  await expect.poll(async()=>(await list())[0].notes?.twitch?.status,{timeout:20000}).toBe('LOCKED');
  await expect(popup.getByText('Esperando resultado',{exact:true})).toBeVisible();
  await expect(popup.locator('.points-pool')).toContainText('0,03');await expect(popup.locator('.points-bet')).toHaveCount(0);await expect(popup.locator('.prediction')).toHaveCount(1);
  expect((await list()).length).toBe(1);expect(JSON.parse(await readFile(byteFile,'utf8')).resolutions).toBe(0);
  // The watched stream request is still blocked: resolving must update through
  // the independent market refresh, with no click or popup reload.
  native.status='RESOLVED';native.winningOutcome={id:'odd'};await writeFile(twitchFile,JSON.stringify([native]));
  await expect.poll(async()=>(await list())[0].status,{timeout:20000}).toBe('resolved');
  await expect(popup.getByText('Resultado confirmado',{exact:true})).toBeVisible({timeout:15000});
  await expect(popup.locator('.points-option').last().locator('.points-winner')).toBeVisible();
  await expect(popup.locator('.points-pool')).toContainText('0,03');await expect(popup.locator('.prediction')).toHaveCount(1);
  expect(await popup.evaluate(()=>(window as unknown as {originalMarket:Element}).originalMarket.isConnected)).toBe(true);
  await popup.reload();await expect(popup.getByText('Resultado confirmado',{exact:true})).toBeVisible();await expect(popup.locator('.prediction')).toHaveCount(1);
  expect((await list())[0].winner).toBe(1);expect(JSON.parse(await readFile(byteFile,'utf8')).resolutions).toBe(1);
  await popup.screenshot({path:'test-results/byte-twitch-mirrored-popup.png',fullPage:true});await popup.close();releaseWatch?.();
  const short={...native,id:randomUUID(),status:'ACTIVE',winningOutcome:null,createdAt:new Date().toISOString(),predictionWindowSeconds:60};await writeFile(twitchFile,JSON.stringify([short]));
  await panel.getByLabel('Canal de Twitch',{exact:true}).fill(channel);await panel.getByRole('button',{name:'Seguir canal',exact:true}).click();await expect(panel.getByText('La ventana restante es demasiado corta',{exact:false})).toBeVisible();expect((await list()).length).toBe(1);
 }finally{releaseWatch?.();await context.close();await rm(profile,{recursive:true,force:true});await writeFile(twitchFile,'[]');}
});
