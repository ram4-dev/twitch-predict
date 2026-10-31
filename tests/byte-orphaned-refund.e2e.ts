import {test,expect,chromium} from '@playwright/test';
import {mkdtemp,cp,readFile,writeFile,rename,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
test.skip(process.env.E2E_MARKET_MODE!=='byte','Uses the isolated Byte and Twitch transports');
test('a confirmed orphaned lock voids Byte once and displays a refund without profit',async()=>{
 const base=process.env.APP_URL??'http://twitch-predict.localhost:1358',channel=`orphan_${randomUUID().replaceAll('-','').slice(0,10)}`;
 const native={id:randomUUID(),channel,title:'Orphaned locked round',status:'ACTIVE',createdAt:new Date().toISOString(),predictionWindowSeconds:600,winningOutcome:null,lockedAt:null as string|null,outcomes:[{id:'yes',title:'Legion'},{id:'no',title:'BB'}],inactive:false};
 const twitchFile=resolve('test-results/twitch-fixture.json'),byteFile=resolve('test-results/byte-fixture.json');
 await writeFile(twitchFile,JSON.stringify([native]));await writeFile(byteFile,JSON.stringify({markets:[],signatures:{},broadcasts:0,resolutions:0,invalidations:0,syncs:0}));
 const profile=await mkdtemp(`${tmpdir()}/plot-orphan-`),extension=resolve(profile,'extension');await cp('extension',extension,{recursive:true});
 for(const name of ['background.js','popup.js','app-config.js']){const p=resolve(extension,name);await writeFile(p,(await readFile(p,'utf8')).replaceAll('http://twitch-predict.localhost:1356',base));}
 const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
 try{
  const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker'),id=new URL(worker.url()).host;
  const panel=await context.newPage();await panel.goto(`${base}/app`);await panel.getByRole('button',{name:'Vincular extensión',exact:true}).click();await expect(panel.getByText('Extensión vinculada.',{exact:false})).toBeVisible();
  await context.route(`https://www.twitch.tv/${channel}`,r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Orphan fixture</title>'}));const twitch=await context.newPage();await twitch.goto(`https://www.twitch.tv/${channel}`);
  const popup=await context.newPage();await popup.setViewportSize({width:700,height:600});await popup.goto(`chrome-extension://${id}/popup.html`);await expect(popup.getByRole('heading',{name:native.title,exact:true})).toBeVisible({timeout:20000});
  const state=JSON.parse(await readFile(byteFile,'utf8'));Object.assign(state.markets[0],{closeMs:Date.now()-1000,bettable:false,resolvable:true,pools:[20000000,10000000],total:30000000,bettors:2});await writeFile(byteFile+'.update',JSON.stringify(state));await rename(byteFile+'.update',byteFile);
  native.status='LOCKED';native.lockedAt=new Date().toISOString();await writeFile(twitchFile,JSON.stringify([native]));
  await expect(popup.getByText('Waiting for the result',{exact:true})).toBeVisible();expect(JSON.parse(await readFile(byteFile,'utf8')).invalidations).toBe(0);
  // The ID endpoint still returns LOCKED while the successful channel listing omits it.
  native.inactive=true;await writeFile(twitchFile,JSON.stringify([native]));
  await expect.poll(async()=>JSON.parse(await readFile(byteFile,'utf8')).invalidations,{timeout:20000}).toBe(1);
  await expect(popup.locator('.plot-resolution .resolution-result')).toHaveText('Round voided',{timeout:15000});await expect(popup.locator('.resolution-net')).toHaveCount(0);await expect(popup.getByText('Waiting for the result',{exact:true})).toHaveCount(0);
  const response=await panel.request.get(`${base}/api/byte/markets`),market=(await response.json()).markets.find((m:{id:string})=>m.id===state.markets[0].id);
  expect(market.status).toBe('invalid');expect(market.winner).toBeNull();expect(market.notes.resolution.winner).toBeNull();expect(market.invalidReason).toContain('sin ganancias');expect(market.total).toBe(30000000);
  const final=JSON.parse(await readFile(byteFile,'utf8'));expect(final.resolutions).toBe(0);expect(final.broadcasts).toBe(0);
  await popup.reload();await expect(popup.locator('.plot-resolution .resolution-result')).toHaveText('Round voided');await popup.getByRole('button',{name:'Refresh prediction',exact:true}).click();await expect(popup.getByRole('button',{name:'Refresh prediction',exact:true})).toBeEnabled();expect(JSON.parse(await readFile(byteFile,'utf8')).invalidations).toBe(1);
 }finally{await context.close();await rm(profile,{recursive:true,force:true});await writeFile(twitchFile,'[]');}
});
