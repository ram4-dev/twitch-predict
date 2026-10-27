import {chooseChannel} from './fixtures/extension-search.js';
import {test,expect,chromium,type Page} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {signIn} from './fixtures/phantom.js';
async function demo(page:Page){return page.evaluate(async()=>{const {token}=await(await fetch('/api/pair')).json();const response=await fetch('/api/demo',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:'{}'});if(!response.ok)throw new Error(await response.text());return response.json();});}
test.skip(process.env.MARKET_MODE==='solana','Offchain Dia UX');
test('dashboard uses Dia materials with real forms, keyboard controls, responsive layout and reduced motion',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await signIn(page);const market=await demo(page);await page.reload();
  await expect(page.getByRole('img',{name:'plot',exact:true})).toBeVisible();await page.evaluate(()=>document.fonts.ready);expect(await page.evaluate(()=>document.fonts.check('700 30px Fraunces'))).toBe(true);
  expect(await page.locator('body').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(8, 8, 8)');await expect(page.locator('#plot-scene .plot-dither-field canvas')).toHaveCount(1);await expect(page.locator('#plot-scene .plot-image-wordmark img')).toBeVisible();
  await expect(page.locator('#plot-scene .plot-halftone')).toHaveCount(0);await expect.poll(()=>page.locator('#plot-scene .plot-image-wordmark img').evaluate(el=>(el as HTMLImageElement).naturalWidth)).toBe(1792);
  const card=page.locator(`[data-key="${market.key}"]`),yes=card.getByRole('button',{name:'Apostar a Gana',exact:true}),no=card.getByRole('button',{name:'Apostar a Pierde',exact:true});
  await expect(yes).toHaveAttribute('data-tone','positive');await expect(no).toHaveAttribute('data-tone','negative');expect(await yes.evaluate(el=>getComputedStyle(el).borderTopColor)).toBe('rgb(66, 201, 138)');expect(await no.evaluate(el=>getComputedStyle(el).borderTopColor)).toBe('rgb(255, 100, 111)');expect(await yes.evaluate(el=>getComputedStyle(el).borderRadius)).toBe('999px');
  await yes.focus();await expect(yes.locator('canvas')).toHaveCount(1);await no.focus();await expect(yes.locator('canvas')).toHaveCount(0);
  await expect(page.getByRole('button',{name:/Pausar animación|Reanudar animación/})).toHaveCount(0);await expect(page.locator('#plot-scene .plot-image-wordmark img')).toBeVisible();
  for(const width of [320,360,768,1440]){await page.setViewportSize({width,height:1000});await page.locator('#plot-scene').scrollIntoViewIfNeeded();await expect(page.locator('#plot-scene .plot-image-wordmark img')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`test-results/dia-dashboard-${width}.png`,fullPage:true});}
  await page.emulateMedia({reducedMotion:'reduce'});await yes.focus();await expect(yes.locator('canvas')).toHaveCount(0);expect(await yes.locator('.liquid-metal-surface').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
  await card.getByLabel('Puntos a apostar').fill('250');await yes.focus();await page.keyboard.press('Enter');await expect(page.locator('#own-balance')).toHaveText('9.750');await expect(card).toContainText('Apostaste 250 pts');expect(errors).toEqual([]);
});
test('extension uses the same Dia materials and preserves amount through refresh before placing a bet',async({page})=>{
  await signIn(page);const market=await demo(page);const token=await page.evaluate(()=>localStorage.getItem('pointsToken'));
  const base=new URL(page.url()).origin,profile=await mkdtemp(`${tmpdir()}/plot-dia-popup-`),extension=resolve('extension');
  const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  try{
    const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');const id=new URL(worker.url()).host;
    await worker.evaluate(async({base,token})=>{await (globalThis as unknown as {chrome:{storage:{local:{set(data:unknown):Promise<void>}}}}).chrome.storage.local.set({bridgeUrl:base,pointsToken:token});},{base,token});
    const popup=await context.newPage(),errors:string[]=[];await popup.setViewportSize({width:700,height:600});popup.on('pageerror',e=>errors.push(e.message));await popup.goto(`chrome-extension://${id}/popup.html`);await chooseChannel(popup,'demo_streamer');
    const card=popup.locator(`[data-prediction-id="${market.prediction.id}"]`),yes=card.getByRole('button',{name:'Apostar a Gana',exact:true});await expect(yes).toBeEnabled();
    expect(await popup.locator('body').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(8, 8, 8)');await expect(popup.getByRole('img',{name:'Plot!',exact:true})).toBeVisible();await expect(popup.locator('body > .popup-atmosphere .plot-dither-field canvas')).toHaveCount(1);const background=popup.locator('body > .popup-atmosphere');expect(await background.evaluate(el=>{const b=el.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height,pointer:getComputedStyle(el).pointerEvents};})).toEqual({x:0,y:0,width:700,height:600,pointer:'none'});await expect(yes).toHaveAttribute('data-tone','positive');expect(await popup.locator('body').evaluate(el=>el.getBoundingClientRect().width)).toBe(700);await expect(popup.getByRole('button',{name:/Pausar animación|Reanudar animación/})).toHaveCount(0);
    await card.getByLabel('Puntos a apostar').fill('250');await popup.getByRole('button',{name:'Actualizar predicción',exact:true}).click();await expect(popup.getByRole('button',{name:'Actualizar predicción',exact:true})).toBeEnabled();await expect(card.getByLabel('Puntos a apostar')).toHaveValue('250');
    await yes.focus();await expect(yes.locator('canvas')).toHaveCount(1);await yes.scrollIntoViewIfNeeded();await expect(yes).toBeInViewport({ratio:.99});await expect(popup.locator('.plot-balloon-wordmark')).toHaveAttribute('data-renderer','balloon');await expect(popup.locator('.plot-image-wordmark img')).toBeVisible();await expect.poll(()=>popup.locator('.plot-image-wordmark img').evaluate(el=>(el as HTMLImageElement).naturalWidth)).toBe(1792);await expect(popup.locator('.plot-halftone')).toHaveCount(0);await popup.screenshot({path:'test-results/dia-extension.png',fullPage:true});await yes.click();await expect(popup.locator('#own-balance')).toHaveText('9.750');await expect(card).toContainText('Apostaste 250 pts');
    await popup.emulateMedia({reducedMotion:'reduce'});await expect(popup.locator('.plot-balloon-wordmark')).toHaveAttribute('data-renderer','image');await yes.focus();await expect(yes.locator('canvas')).toHaveCount(0);expect(errors).toEqual([]);
  }finally{await context.close();await rm(profile,{recursive:true,force:true});}
});
