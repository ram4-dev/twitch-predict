import {test,expect,chromium,type BrowserContext} from '@playwright/test';
import {mkdtemp,rm,writeFile,mkdir,readFile} from 'node:fs/promises';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {phantomProvider,testWallet} from './fixtures/phantom.js';
import {Documents} from '../src/cloud/documents.js';
const origin=process.env.PLOT_CLOUD_URL;
test.skip(!origin,'Cloud deployment validation is opt-in');
test('public HTTPS → signed wallet login → MV3 scoped session; no bridge or operator grant',async({request})=>{
 const directory=await mkdtemp(join(tmpdir(),'plot-cloud-e2e-')),extension=join(directory,'extension');await mkdir(extension);
 const response=await request.get(`${origin}/downloads/plot-extension.zip`);expect(response.ok()).toBeTruthy();
 await writeFile(join(directory,'extension.zip'),await response.body());await promisify(execFile)('unzip',['-q',join(directory,'extension.zip'),'-d',extension]);
 let updatedContext:BrowserContext|undefined;
 const wallet=testWallet();await mkdir('artifacts/cloud',{recursive:true});await writeFile(join('artifacts/cloud','test-wallet-'+wallet.address+'.json'),JSON.stringify({wallet:wallet.address,scenario:'cloud E2E',createdAt:new Date().toISOString()}));const context=await chromium.launchPersistentContext(join(directory,'profile'),{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
 try{
  await phantomProvider(context,wallet);const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
  await expect.poll(()=>context.pages().find(p=>p.url().startsWith(`${origin}/onboarding`))?.url(),{timeout:20000}).toBeTruthy();
  const onboarding=context.pages().find(p=>p.url().startsWith(`${origin}/onboarding`))!;
  if(!await onboarding.evaluate(()=>!!(window as unknown as {phantom?:{solana?:unknown}}).phantom?.solana))await onboarding.reload();await expect.poll(async()=>worker.evaluate(async()=>{const s=await (globalThis as unknown as {chrome:{storage:{local:{get(keys:string[]):Promise<{pointsToken?:string;bridgeToken?:string;walletAddress?:string}>}}}}).chrome.storage.local.get(['pointsToken','bridgeToken','walletAddress']);return {linked:!!s.pointsToken,bridge:!!s.bridgeToken,wallet:s.walletAddress};}),{timeout:30000}).toEqual({linked:true,bridge:false,wallet:wallet.address});
  const popup=await context.newPage();await popup.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
  const web=await context.newPage();await web.goto(`${origin}/onboarding`);await web.getByRole('button',{name:'Conectar Phantom',exact:true}).click();await web.waitForURL(`${origin}/#markets`);
  const state=await web.evaluate(async()=>{const r=await fetch('/api/points/me',{headers:{authorization:`Bearer ${localStorage.getItem('pointsToken')}`}});return r.json();});expect(state.wallet).toBe(wallet.address);await expect(web.getByRole('button',{name:'Operador',exact:true})).toHaveCount(0);
  await web.getByRole('button',{name:'Vincular extensión',exact:true}).click();await expect(web.getByText(/Extensión vinculada\./)).toBeVisible();
  expect((await request.get(`${origin}/api/pair`)).status()).toBe(404);
  expect((await request.post(`${origin}/api/byte/markets`,{headers:{origin:origin!,'sec-fetch-site':'same-origin'},data:{}})).status()).toBe(403);
  await web.screenshot({path:'test-results/cloud-linked-web.png',fullPage:true});
  await worker.evaluate(async()=>{await (globalThis as unknown as {chrome:{storage:{local:{set(v:unknown):Promise<void>}}}}).chrome.storage.local.set({bridgeUrl:'http://twitch-predict.localhost:1356',bridgeToken:'a'.repeat(64)});});
  await context.close();
  const manifestPath=join(extension,'manifest.json'),manifest=JSON.parse(await readFile(manifestPath,'utf8'));manifest.version='0.10.1';await writeFile(manifestPath,JSON.stringify(manifest));
  updatedContext=await chromium.launchPersistentContext(join(directory,'profile'),{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  const updated=updatedContext.serviceWorkers()[0]??await updatedContext.waitForEvent('serviceworker');
  await expect.poll(()=>updated.evaluate(async()=>{const s=await (globalThis as unknown as {chrome:{storage:{local:{get(k:string[]):Promise<{bridgeUrl?:string;bridgeToken?:string;pointsToken?:string}>}}}}).chrome.storage.local.get(['bridgeUrl','bridgeToken','pointsToken']);return {base:s.bridgeUrl,bridge:!!s.bridgeToken,session:!!s.pointsToken};}),{timeout:15000}).toEqual({base:origin,bridge:false,session:true});

 }finally{
  await updatedContext?.close();await context.close();await rm(directory,{recursive:true,force:true});
  if(process.env.PLOT_STAGING_DATABASE_URL){const docs=new Documents(process.env.PLOT_STAGING_DATABASE_URL,'plot-staging');try{
   await docs.update('points',()=>({}),raw=>{const s=raw as {accounts:Record<string,{wallet?:string}>;bets:{accountId:string}[];sessions:Record<string,string>;ledger:{accountId:string}[]};for(const [id,a] of Object.entries(s.accounts??{}))if(a.wallet===wallet.address){if(s.bets.some(b=>b.accountId===id))throw new Error('Cannot clean a test account with bets');delete s.accounts[id];s.sessions=Object.fromEntries(Object.entries(s.sessions).filter(([,v])=>v!==id));s.ledger=s.ledger.filter(l=>l.accountId!==id);}});
  }finally{await docs.close();}}
 }
});
