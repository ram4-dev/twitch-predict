import {chromium,type BrowserContext,type Worker} from '@playwright/test';
import {resolve} from 'node:path';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base=process.env.APP_URL??'https://twitch-predict.localhost:1357';
const extension=resolve('extension'),profile=resolve('data/chromium');
const manifest=JSON.parse(await readFile(resolve(extension,'manifest.json'),'utf8'));
const extensionId=[...createHash('sha256').update(Buffer.from(manifest.key,'base64')).digest('hex').slice(0,32)].map(c=>String.fromCharCode(97+parseInt(c,16))).join('');
async function workerFor(context:BrowserContext,id:string):Promise<Worker>{return context.serviceWorkers().find(w=>new URL(w.url()).host===id)??context.waitForEvent('serviceworker',{predicate:w=>new URL(w.url()).host===id});}
const legacy=process.env.MIGRATE_EXTENSION_PATH;
if(legacy){
  const migration=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:false,viewport:null,args:[`--disable-extensions-except=${extension},${legacy}`,`--load-extension=${extension},${legacy}`]});
  try{
    const current=await workerFor(migration,extensionId);
    const previous=migration.serviceWorkers().find(w=>new URL(w.url()).host!==extensionId)??await migration.waitForEvent('serviceworker',{predicate:w=>new URL(w.url()).host!==extensionId});
    const data=await previous.evaluate(async()=>{const api=(globalThis as unknown as {chrome:{runtime:{getManifest():{name:string}};storage:{local:{get(keys:null):Promise<Record<string,unknown>>}}}}).chrome;if(!api.runtime.getManifest().name.startsWith('Prediction Mirror'))throw new Error('Unexpected migration source');const all=await api.storage.local.get(null);return Object.fromEntries(Object.entries(all).filter(([key])=>['pointsToken','bridgeToken','bridgeUrl','lastPoll'].includes(key)||key.startsWith('channel:')));});
    await current.evaluate(async values=>{await (globalThis as unknown as {chrome:{storage:{local:{set(data:unknown):Promise<void>}}}}).chrome.storage.local.set(values);},data);
    console.log('Datos de la extensión anterior migrados sin mostrar credenciales.');
  }finally{await migration.close();}
}
// Keep an already installed Phantom available; do not read or copy its wallet storage.
const allowed=[extension];
try{const path=resolve(profile,'Default/Extensions/bfnaelmomeimhlpmgjnjophhpkkoljpa');const versions=await readdir(path);if(versions.length)allowed.push(resolve(path,versions.sort().at(-1)!));}catch{/* Onboarding includes the official Phantom installation link. */}
const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:false,viewport:null,args:[`--disable-extensions-except=${allowed.join(',')}`,`--load-extension=${allowed.join(',')}`]});
const worker=await workerFor(context,extensionId);const dashboard=context.pages()[0]??await context.newPage();await dashboard.goto(base);
const authenticated=await worker.evaluate(async url=>{const s=await(globalThis as unknown as {chrome:{storage:{local:{get(keys:string[]):Promise<{pointsToken?:string}>}}}}).chrome.storage.local.get(['pointsToken']);if(!s.pointsToken)return false;const r=await fetch(`${url}/api/points/me`,{headers:{Authorization:`Bearer ${s.pointsToken}`}});return r.ok&&!!(await r.json()).wallet;},base);
if(!authenticated){const result=await dashboard.evaluate(async id=>(globalThis as unknown as {chrome:{runtime:{sendMessage(id:string,message:unknown):Promise<{ok?:boolean;error?:string}>}}}).chrome.runtime.sendMessage(id,{type:'CONNECT_PHANTOM'}),extensionId);if(!result?.ok)throw new Error(result?.error??'Could not open Phantom onboarding');}
else await dashboard.bringToFront();
console.log(`Chrome preparado con extensión ${manifest.version}. ${authenticated?'Cuenta conectada.':'Onboarding de Phantom abierto.'} Panel: ${base}`);
process.on('SIGINT',()=>{void context.close();});await new Promise<void>(resolve=>context.on('close',()=>resolve()));
