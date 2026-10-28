import {test,expect,chromium} from '@playwright/test';
import {mkdtemp,cp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
test.skip(process.env.E2E_MARKET_MODE!=='byte','Uses the isolated Byte and Twitch transports');

test('a real closed action popup opens once when the watched Twitch round resolves',async()=>{
 const base=process.env.APP_URL??'http://twitch-predict.localhost:1358',channel=`mirror_${randomUUID().replaceAll('-','').slice(0,10)}`;
 const native={id:randomUUID(),channel,title:'Automatic popup · Twitch result',status:'ACTIVE',createdAt:new Date().toISOString(),predictionWindowSeconds:600,winningOutcome:null as null|{id:string},outcomes:[{id:'yes',title:'Astra',totalPoints:100,totalUsers:2},{id:'no',title:'BB',totalPoints:200,totalUsers:3}]};
 const twitchFile=resolve('test-results/twitch-fixture.json'),byteFile=resolve('test-results/byte-fixture.json');
 await writeFile(twitchFile,JSON.stringify([native]));await writeFile(byteFile,JSON.stringify({markets:[],signatures:{},partnerError:429,broadcasts:0,resolutions:0,invalidations:0,syncs:0}));
 const profile=await mkdtemp(`${tmpdir()}/plot-auto-open-`),extension=resolve(profile,'extension');await cp('extension',extension,{recursive:true});
 for(const name of ['background.js','popup.js','app-config.js']){const p=resolve(extension,name);await writeFile(p,(await readFile(p,'utf8')).replaceAll('http://twitch-predict.localhost:1356',base));}
 const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:false,viewport:null,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
 try{
  const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker'),id=new URL(worker.url()).host;
  await expect.poll(()=>context.pages().some(p=>p.url().includes('/onboarding?extension=1#flow='))).toBe(true);
  const panel=await context.newPage();await panel.goto(`${base}/app?channel=${channel}`);await panel.getByRole('button',{name:'Vincular extensión',exact:true}).click();await expect(panel.getByText('Extensión vinculada.',{exact:false})).toBeVisible();
  const inspector=await context.newPage();await inspector.goto(`chrome-extension://${id}/popup.html`);
  const readView=()=>inspector.evaluate(()=>{
   const api=(globalThis as unknown as {chrome:{extension:{getViews(options:{type:string}):Window[]}}}).chrome;
   const popup=api.extension.getViews({type:'popup'})[0];if(!popup)return null;
   const card=popup.document.querySelector('.plot-resolution');return {text:card?.textContent??'',state:card?.getAttribute('data-state'),width:popup.innerWidth,animatedBackground:card?popup.getComputedStyle(card,'::before').animationName:null,money:card?.querySelectorAll('.resolution-net').length};
  });
  const view=async()=>{
   const visible=await readView();if(visible)return visible;
   // macOS can transfer focus back to the test runner between async tool steps.
   // Keep the test's own browser foreground; the production focus guard stays intact.
   const focused=await worker.evaluate(async()=> (await (globalThis as unknown as {chrome:{windows:{getLastFocused():Promise<{focused:boolean}>}}}).chrome.windows.getLastFocused()).focused);
   if(!focused){if(process.platform==='darwin')execFileSync('open',['-a',resolve(chromium.executablePath(),'../../..')]);await twitch.bringToFront();}
   return null;
  };
  await context.route(`https://www.twitch.tv/${channel}`,r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Twitch automatic popup fixture</title>'}));const twitch=await context.newPage();await twitch.goto(`https://www.twitch.tv/${channel}`);if(process.platform==='darwin')execFileSync('open',['-a',resolve(chromium.executablePath(),'../../..')]);await twitch.bringToFront();
  await worker.evaluate(async()=>{const api=(globalThis as unknown as {chrome:{windows:{getLastFocused():Promise<{id:number}>;update(id:number,value:{focused:boolean}):Promise<unknown>}}}).chrome;const window=await api.windows.getLastFocused();await api.windows.update(window.id,{focused:true});});
  await expect.poll(()=>worker.evaluate(async channel=>{const s=await (globalThis as unknown as {chrome:{storage:{local:{get(key:string):Promise<Record<string,{predictions?:{prediction:{id:string;status:string}}[]}> >}}}}).chrome.storage.local.get(`channel:${channel}`);return s[`channel:${channel}`]?.predictions?.[0]?.prediction.status;},channel),{timeout:20000}).toBe('ACTIVE');
  await expect.poll(()=>worker.evaluate(async()=> (await (globalThis as unknown as {chrome:{windows:{getLastFocused():Promise<{focused:boolean}>}}}).chrome.windows.getLastFocused()).focused)).toBe(true);
  expect(await view()).toBeNull();
  await writeFile(twitchFile,JSON.stringify([{...native,status:'RESOLVED',winningOutcome:{id:'yes'},endedAt:new Date().toISOString()}]));
  try{await expect.poll(view,{timeout:25000}).toMatchObject({state:'spectator',width:700,animatedBackground:'none',money:0});}catch(error){
   console.log('delivery diagnostics',JSON.stringify(await worker.evaluate(async channel=>{const c=(globalThis as unknown as {chrome:{storage:{local:{get(key:string):Promise<Record<string,unknown>>}};windows:{getLastFocused():Promise<unknown>};tabs:{query(o:unknown):Promise<unknown>};runtime:{getContexts(o:unknown):Promise<unknown>}}}).chrome;return {alerts:await c.storage.local.get('resolutionAlerts'),snapshot:await c.storage.local.get(`channel:${channel}`),window:await c.windows.getLastFocused(),tabs:await c.tabs.query({active:true}),contexts:await c.runtime.getContexts({})};},channel)));throw error;
  }
  expect((await view())!.text).toContain('Resultado: Astra');expect((await view())!.text).toContain('Esta ronda no tuvo mercado ni apuestas en SOL.');
  await inspector.evaluate(()=>{const api=(globalThis as unknown as {chrome:{extension:{getViews(options:{type:string}):Window[]}}}).chrome;api.extension.getViews({type:'popup'})[0]?.close();});await expect.poll(view).toBeNull();
  // Two more real content-script polls must leave the dismissed result closed.
  await expect.poll(()=>worker.evaluate(async channel=>{const s=await (globalThis as unknown as {chrome:{storage:{local:{get(key:string):Promise<Record<string,{fetchedAt?:string}>>}}}}).chrome.storage.local.get(`channel:${channel}`);return Date.parse(s[`channel:${channel}`]?.fetchedAt??'');},channel),{timeout:15000}).toBeGreaterThan(Date.now()+5000);
  expect(await view()).toBeNull();
  const saved=JSON.parse(await readFile(byteFile,'utf8'));expect(saved.broadcasts).toBe(0);expect(saved.resolutions).toBe(0);
 }finally{await context.close();await rm(profile,{recursive:true,force:true});await writeFile(twitchFile,'[]');}
});
