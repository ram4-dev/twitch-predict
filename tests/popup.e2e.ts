import { test, expect, chromium } from '@playwright/test';
import { resolve } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
test('popup shows Twitch data without pairing and isolates snapshots from concurrent channels',async()=>{
  const profile=await mkdtemp(`${tmpdir()}/mirror-popup-`);const extension=resolve('extension');
  const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  try {
    const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');const id=new URL(worker.url()).host;
    let emptySecond=false;
    await context.route('https://gql.twitch.tv/gql',route=>{
      const channel=route.request().postDataJSON().variables.channel;
      const prediction={id:`native-${channel}`,title:channel==='alpha_stream'?'¿Gana Alpha?':'¿Gana Beta?',status:'ACTIVE',createdAt:new Date().toISOString(),predictionWindowSeconds:600,lockedAt:null,endedAt:null,winningOutcome:null,outcomes:[{id:'yes',title:'Sí',color:'BLUE',totalPoints:channel==='alpha_stream'?100:900,totalUsers:10},{id:'no',title:'No',color:'PINK',totalPoints:100,totalUsers:5}]};
      return route.fulfill({json:{data:{channel:{activePredictionEvents:emptySecond&&channel==='beta_stream'?[]:[prediction]}}}});
    });
    for(const channel of ['alpha_stream','beta_stream']) {
      await context.route(`https://www.twitch.tv/${channel}`,route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Twitch fixture</title>'}));
      const tab=await context.newPage();await tab.goto(`https://www.twitch.tv/${channel}`);
    }
    const popup=await context.newPage();await popup.goto(`chrome-extension://${id}/popup.html`);
    await expect(popup.locator('#channel option')).toHaveCount(2,{timeout:15000});
    await popup.getByLabel('Canal de Twitch').selectOption('alpha_stream');
    await expect(popup.getByRole('heading',{name:'¿Gana Alpha?'})).toBeVisible();
    await expect(popup.locator('.outcome').first()).toContainText('100 puntos');
    await expect(popup.locator('#setup')).toBeVisible();await expect(popup.locator('.market strong')).toHaveText('Creación pendiente de conexión');
    await popup.getByLabel('Canal de Twitch').selectOption('beta_stream');
    await expect(popup.getByRole('heading',{name:'¿Gana Beta?'})).toBeVisible();await expect(popup.locator('.outcome').first()).toContainText('900 puntos');
    emptySecond=true;await popup.getByRole('button',{name:'Actualizar predicción'}).click();await expect(popup.locator('#empty')).toBeVisible();await expect(popup.locator('.prediction')).toHaveCount(0);
    await popup.getByLabel('Canal de Twitch').selectOption('alpha_stream');await expect(popup.getByRole('heading',{name:'¿Gana Alpha?'})).toBeVisible();
    // A broken bridge must not erase fresh Twitch data.
    await worker.evaluate(async()=>{await (globalThis as unknown as {chrome:{storage:{local:{set(value:unknown):Promise<void>}}}}).chrome.storage.local.set({bridgeToken:'a'.repeat(64),bridgeUrl:'http://twitch-predict.localhost:1356'});});
    await context.route('http://twitch-predict.localhost:1356/api/predictions',route=>route.fulfill({status:503,json:{error:'Bridge maintenance'}}));
    await popup.getByRole('button',{name:'Actualizar predicción'}).click();
    await expect(popup.locator('.market strong')).toHaveText('Mercado sin conexión');
    await expect(popup.getByRole('heading',{name:'¿Gana Alpha?'})).toBeVisible();await expect(popup.locator('.outcome').first()).toContainText('100 puntos');
    await popup.screenshot({path:'test-results/popup-offline.png',fullPage:true});
  } finally {await context.close();await rm(profile,{recursive:true,force:true});}
});
