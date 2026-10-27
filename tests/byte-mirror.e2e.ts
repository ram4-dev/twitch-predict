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
 for(const name of ['background.js','popup.js','app-config.js']){const p=resolve(extension,name);await writeFile(p,(await readFile(p,'utf8')).replaceAll('http://twitch-predict.localhost:1356',base));}
 const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
 try{
  const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker'),id=new URL(worker.url()).host;
  const panel=await context.newPage();await panel.goto(base);await panel.getByRole('button',{name:'Vincular extensión',exact:true}).click();await expect(panel.getByText('Extensión vinculada.',{exact:false})).toBeVisible();
  await context.route(`https://www.twitch.tv/${channel}`,r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Twitch prediction fixture</title>'}));
  const twitch=await context.newPage();await twitch.goto(`https://www.twitch.tv/${channel}`);
  const popup=await context.newPage();await popup.goto(`chrome-extension://${id}/popup.html`);await expect(popup.getByRole('heading',{name:native.title,exact:true})).toBeVisible({timeout:20000});
  await expect(popup.locator('.points-options')).toContainText('EVENNNNZ :D');await expect(popup.locator('.points-options')).toContainText('ODDSTERR :O');await expect(popup.locator('.points-bet')).toHaveCount(2);
  const card=popup.locator('.prediction'),stake=card.getByRole('textbox',{name:'Importe en SOL devnet'});
  await expect(card).toHaveClass(/plot-glow-card/);await stake.fill('0.05');
  await card.hover({position:{x:30,y:20}});await expect.poll(()=>card.evaluate(el=>getComputedStyle(el,'::before').opacity)).toBe('1');
  await expect(stake).toHaveValue('0.05');await popup.mouse.move(0,0);await stake.focus();await expect.poll(()=>card.evaluate(el=>getComputedStyle(el,'::before').opacity)).toBe('1');
  const list=async()=>{const r=await panel.request.get(`${base}/api/byte/markets`);return (await r.json()).markets as DisplayByteMarket[];};
  const mirrored=(await list())[0];expect((await list()).length).toBe(1);expect(mirrored.notes?.channel).toBe(channel);expect(mirrored.notes?.twitch?.predictionId).toBe(native.id);expect(mirrored.closeMs).toBeLessThanOrEqual(Date.parse(native.createdAt)+600000);
  await popup.getByRole('button',{name:'Actualizar predicción',exact:true}).click();await expect(popup.getByRole('button',{name:'Actualizar predicción',exact:true})).toBeEnabled();expect((await list()).length).toBe(1);
  const points=await panel.request.get(`${base}/api/markets`);expect(await points.json()).toEqual([]);
  await popup.screenshot({path:'test-results/byte-twitch-mirrored-popup.png',fullPage:true});await popup.close();await twitch.close();
  const state=JSON.parse(await readFile(byteFile,'utf8'));state.markets[0].closeMs=Date.now()-1;state.markets[0].resolvable=true;await writeFile(byteFile+'.update',JSON.stringify(state));await rename(byteFile+'.update',byteFile);
  native.status='RESOLVED';native.winningOutcome={id:'odd'};await writeFile(twitchFile,JSON.stringify([native]));
  await expect.poll(async()=>(await list())[0].status,{timeout:20000}).toBe('resolved');expect((await list())[0].winner).toBe(1);expect(JSON.parse(await readFile(byteFile,'utf8')).resolutions).toBe(1);
  const short={...native,id:randomUUID(),status:'ACTIVE',winningOutcome:null,createdAt:new Date().toISOString(),predictionWindowSeconds:60};await writeFile(twitchFile,JSON.stringify([short]));
  await panel.getByLabel('Canal de Twitch',{exact:true}).fill(channel);await panel.getByRole('button',{name:'Seguir canal',exact:true}).click();await expect(panel.getByText('La ventana restante es demasiado corta',{exact:false})).toBeVisible();expect((await list()).length).toBe(1);
 }finally{await context.close();await rm(profile,{recursive:true,force:true});await writeFile(twitchFile,'[]');}
});
