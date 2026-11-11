import {test,expect,type Page} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {signIn} from './fixtures/phantom.js';

async function api(page:Page,path:string,body?:Record<string,unknown>){return page.evaluate(async({path,body})=>{const r=await fetch(path,{method:body?'POST':'GET',headers:{'content-type':'application/json',Authorization:`Bearer ${localStorage.getItem('pointsToken')??''}`},...(body?{body:JSON.stringify(body)}:{})});if(!r.ok)throw new Error(await r.text());return r.json();},{path,body});}
async function owner(page:Page){
 const login=`manager_${randomUUID().slice(0,8)}`,id=String(Date.now());await writeFile(resolve('test-results/twitch-oauth.json'),JSON.stringify({id,login,display_name:'Rami'}));
 await signIn(page);await page.route('https://id.twitch.tv/oauth2/authorize?**',async route=>{const u=new URL(route.request().url()),callback=new URL(u.searchParams.get('redirect_uri')!);callback.searchParams.set('state',u.searchParams.get('state')!);callback.searchParams.set('code','e2e-code');await route.fulfill({status:302,headers:{location:callback.href}});});
 const start=await api(page,'/api/twitch/start',{});await page.goto(start.url);await expect(page).toHaveURL(/\/app#profile$/);await expect(page.getByRole('navigation',{name:'Secciones'}).getByRole('button')).toHaveCount(2);return login;
}
async function create(page:Page,title:string,retryLostResponse=false){
 let interrupted=false;const intents:string[]=[];if(retryLostResponse)await page.route('**/api/streamer/markets',async route=>{intents.push(route.request().postDataJSON().intentId);if(!interrupted){interrupted=true;const target=new URL(route.request().url());await route.fetch({url:target.href.replace(target.hostname,'127.0.0.1'),headers:{...route.request().headers(),host:target.host}});await route.abort('failed');}else await route.continue();});
 await page.getByRole('button',{name:'Mis apuestas',exact:true}).click();
 await page.getByRole('button',{name:'Crear mercado',exact:true}).click();
 const form=page.getByRole('form',{name:'Crear mercado'});await form.getByLabel('Pregunta', {exact:true}).fill(title);await form.getByLabel('Opción 1',{exact:true}).fill('Equipo Rojo');await form.getByLabel('Opción 2',{exact:true}).fill('Equipo Azul');await form.getByLabel('Duración de apuestas (segundos)',{exact:true}).fill('1200');await form.getByRole('button',{name:'Crear mercado',exact:true}).click();if(retryLostResponse){await expect(form.getByRole('alert')).toBeVisible();await form.getByRole('button',{name:'Crear mercado',exact:true}).click();}await expect(form.getByRole('status')).toContainText('Mercado publicado');if(retryLostResponse){expect(intents).toHaveLength(2);expect(new Set(intents).size).toBe(1);const consoleData=await api(page,'/api/streamer/console');expect(consoleData.markets.filter((m:{prediction:{title:string}})=>m.prediction.title===title)).toHaveLength(1);await page.unroute('**/api/streamer/markets');}
 await page.getByRole('button',{name:'Cerrar formulario',exact:true}).click();
 const card=page.locator('[data-streamer-key]').filter({hasText:title});await expect(card).toBeVisible();return card;
}

test('streamer workspace replaces betting tabs, creates a real market and confirms a winner',async({page,browser})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width:700,height:600});await owner(page);
 await expect(page.locator('.phone-profile')).toBeVisible();await expect(page.getByRole('form',{name:'Crear mercado'})).toHaveCount(0);await expect(page.locator('[data-streamer-key]')).toHaveCount(0);
 const card=await create(page,'¿Quién gana la final?',true);await expect(card.locator('.phone-market')).toHaveCount(1);await expect(card.getByRole('status',{name:'Estado del mercado'})).toContainText('Apuestas abiertas');await expect(card.getByRole('button',{name:'Elegir ganador: Equipo Rojo',exact:true})).toBeDisabled();
 const key=await card.getAttribute('data-streamer-key');
 await expect(page.getByRole('group',{name:'Ver apuestas'})).toHaveCount(0);await expect(page.getByRole('combobox',{name:'Buscar streamer'})).toHaveCount(0);await expect(page.getByRole('button',{name:/^Apostar a/})).toHaveCount(0);
 const denied=await page.evaluate(async key=>{const r=await fetch('/api/points/bet',{method:'POST',headers:{'content-type':'application/json',Authorization:`Bearer ${localStorage.getItem('pointsToken')}`},body:JSON.stringify({key,outcomeId:'1',amount:120,requestId:crypto.randomUUID()})});return {status:r.status,body:await r.json()};},key);expect(denied.status).toBe(400);expect(denied.body.error).toContain('streamer');
 const viewer=await browser.newPage();await signIn(viewer);await api(viewer,'/api/points/bet',{key,outcomeId:'1',amount:120,requestId:randomUUID()});await viewer.close();
 await card.getByRole('button',{name:'Cerrar apuestas',exact:true}).click();await expect(card).toHaveAttribute('data-phase','locked');await expect(card.getByRole('status',{name:'Estado del mercado'})).toContainText('Elegí al ganador');await expect(card.getByRole('button',{name:'Revisar resultado',exact:true})).toBeDisabled();
 await card.getByRole('button',{name:'Elegir ganador: Equipo Rojo',exact:true}).click();await expect(card.getByRole('button',{name:'Elegir ganador: Equipo Rojo',exact:true})).toHaveAttribute('aria-pressed','true');await expect(card.getByRole('status',{name:'Estado del mercado'})).toContainText('Ganador seleccionadoEquipo RojoPendiente de confirmar.');await card.getByRole('button',{name:'Revisar resultado',exact:true}).click();
 const preview=card.getByRole('region',{name:'Confirmar liquidación'});await expect(preview.locator('[data-settlement-share=streamer]')).toHaveText('Para el streamer2pts');await expect(preview.locator('[data-settlement-share=winners]')).toHaveText('Para ganadores116pts');await expect(preview.locator('dt')).toHaveCount(2);for(const text of ['Ganador:','El resultado será definitivo.','Cobro total','Los ganadores podrán cobrar su premio.','Pozo total','Plot ·'])await expect(preview).not.toContainText(text);
 for(const [width,height] of [[700,600],[360,800],[320,740]]){await page.setViewportSize({width,height});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);for(const button of await page.getByRole('navigation',{name:'Secciones'}).getByRole('button').all()){expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);}for(const value of await preview.locator('dd strong').all())expect(await value.evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(36);await expect(preview.locator('dt').first()).toHaveCSS('font-size','16px');await preview.screenshot({path:`test-results/manager-preview-${width}.png`,animations:'disabled'});}
 await page.emulateMedia({reducedMotion:'reduce'});await expect(page.locator('.phone-nav-indicator')).toHaveCSS('transition-duration','0s');await preview.getByRole('button',{name:'Confirmar ganador',exact:true}).click();await expect(card).toHaveAttribute('data-phase','resolved');await expect(card.locator('.phone-result')).toHaveCount(0);await expect(card.locator('.manager-state-title')).toHaveText('Ganó Equipo Rojo');await expect(card.locator('.manager-state-loser')).toContainText('Perdió Equipo Azul');await expect(card.locator('.plot-resolution.count')).toHaveAttribute('data-state','spectator');await expect(card.getByRole('status',{name:'Estado del mercado'})).toHaveAttribute('data-state','resolved');await expect(card.getByRole('region',{name:'Ganancia del streamer'})).toHaveCount(0);await expect(card).not.toContainText('No participaste');await expect(card.locator('.phone-market[data-management]')).toHaveCount(0);await expect(card.getByRole('button',{name:/^Elegir ganador:/})).toHaveCount(0);for(const [width,height] of [[700,600],[360,800]]){await page.setViewportSize({width,height});await card.scrollIntoViewIfNeeded();await page.screenshot({path:`test-results/streamer-footer-${width}.png`});}await expect(card.getByRole('button',{name:'Confirmar ganador',exact:true})).toHaveCount(0);await page.reload();await expect(page.getByRole('button',{name:'Mis apuestas',exact:true})).toHaveAttribute('aria-current','page');await expect(page.locator('[data-streamer-key]').filter({hasText:'¿Quién gana la final?'})).toContainText('Resuelta');await expect(card.getByRole('button',{name:'Ver detalle',exact:true})).toHaveCount(0);for(const hash of ['history','streamer']){await page.goto(`/app?market=${encodeURIComponent(key!)}#${hash}`);await expect(page.getByRole('region',{name:'Consola del streamer'})).toBeVisible();await expect(page.getByRole('group',{name:'Ver apuestas'})).toHaveCount(0);await expect(page.getByRole('button',{name:/^Apostar a/})).toHaveCount(0);await expect(page).toHaveURL(/#markets$/);}expect(errors).toEqual([]);
});

test('cancel requires preview, allows backing out and refunds viewer stakes once',async({page,browser})=>{
 await owner(page);const card=await create(page,'¿Se completa el reto?');const key=await card.getAttribute('data-streamer-key');const viewer=await browser.newPage();await signIn(viewer);await api(viewer,'/api/points/bet',{key,outcomeId:'2',amount:200,requestId:randomUUID()});await card.getByRole('button',{name:'Cerrar apuestas',exact:true}).click();await expect(card).toHaveAttribute('data-phase','locked');
 await card.getByRole('button',{name:'Cancelar y reembolsar',exact:true}).click();const preview=card.getByRole('region',{name:'Confirmar liquidación'});await expect(preview.locator('[data-settlement-share=streamer]')).toHaveText('Para el streamer0pts');await expect(preview.locator('[data-settlement-share=winners]')).toHaveText('Reembolso a usuarios200pts');await preview.getByRole('button',{name:'Volver',exact:true}).click();await expect(preview).toHaveCount(0);await expect(card).toHaveAttribute('data-phase','locked');await card.getByRole('button',{name:'Cancelar y reembolsar',exact:true}).click();await preview.getByRole('button',{name:'Confirmar reembolso',exact:true}).click();await expect(card).toHaveAttribute('data-phase','void');await expect(card).not.toContainText('Cancelado · Apuestas reembolsadas');await expect(card.locator('.plot-resolution.count')).toHaveAttribute('data-state','spectator');await expect(card).toContainText('Anulada');await expect(card.locator('.phone-market[data-management]')).toHaveCount(0);expect((await api(viewer,'/api/points/me')).balance).toBe(10000);await viewer.close();
});

test('viewer and disconnected owner have no management tab; proposals load with auth and recover from errors',async({page})=>{
 await signIn(page);await page.goto('/app#streamer');await expect(page.getByRole('button',{name:'Streamer',exact:true})).toHaveCount(0);await expect(page.getByRole('group',{name:'Ver apuestas'})).toBeVisible();await expect(page.getByRole('region',{name:'Consola del streamer'})).toHaveCount(0);
 // Start a fresh account context via a reload of the OAuth fixture, preserving the signed-in wallet.
 const login=`manager_${randomUUID().slice(0,8)}`,id=String(Date.now());await writeFile(resolve('test-results/twitch-oauth.json'),JSON.stringify({id,login,display_name:'Rami'}));await page.route('https://id.twitch.tv/oauth2/authorize?**',async route=>{const u=new URL(route.request().url()),callback=new URL(u.searchParams.get('redirect_uri')!);callback.searchParams.set('state',u.searchParams.get('state')!);callback.searchParams.set('code','e2e-code');await route.fulfill({status:302,headers:{location:callback.href}});});const start=await api(page,'/api/twitch/start',{});await page.goto(start.url);await page.getByRole('button',{name:'Mis apuestas',exact:true}).click();
 let failures=true;await page.route('**/api/proposals/channels/*',async route=>{expect(route.request().headers().authorization).toMatch(/^Bearer .+/);if(failures)await route.fulfill({status:503,json:{error:'No se pudieron cargar las propuestas.'}});else await route.continue();});await page.getByRole('button',{name:'Propuestas',exact:true}).click();await expect(page.getByRole('alert')).toContainText('No se pudieron cargar');failures=false;await page.getByRole('button',{name:'Reintentar',exact:true}).click();await expect(page.getByText('No hay propuestas pendientes para este canal.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Mi perfil',exact:true}).click();await page.getByRole('button',{name:'Desconectar',exact:true}).click();await expect(page.getByRole('button',{name:'Streamer',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Mis apuestas',exact:true}).click();await expect(page.getByRole('group',{name:'Ver apuestas'})).toBeVisible();
});

test('resolution card preserves real stake, total payout and net for historical streamer bets',async({page,browser})=>{
 await signIn(page);
 const previousOwner=await browser.newPage();await owner(previousOwner);const created=await create(previousOwner,'¿Gana la apuesta histórica?');const key=await created.getAttribute('data-streamer-key');
 const identity=(await api(previousOwner,'/api/points/me')).twitch;
 await api(page,'/api/points/bet',{key,outcomeId:'1',amount:100,requestId:randomUUID()});
 const other=await browser.newPage();await signIn(other);await api(other,'/api/points/bet',{key,outcomeId:'2',amount:200,requestId:randomUUID()});await other.close();
 // The real stake predates channel registration on this account. New streamer bets remain prohibited.
 await api(previousOwner,'/api/twitch/disconnect',{});await previousOwner.close();
 await writeFile(resolve('test-results/twitch-oauth.json'),JSON.stringify({id:identity.id,login:identity.login,display_name:identity.displayName}));
 await page.route('https://id.twitch.tv/oauth2/authorize?**',async route=>{const u=new URL(route.request().url()),callback=new URL(u.searchParams.get('redirect_uri')!);callback.searchParams.set('state',u.searchParams.get('state')!);callback.searchParams.set('code','e2e-code');await route.fulfill({status:302,headers:{location:callback.href}});});
 const start=await api(page,'/api/twitch/start',{});await page.goto(start.url);await page.getByRole('button',{name:'Mis apuestas',exact:true}).click();
 const card=page.locator(`[data-streamer-key="${key}"]`);await card.getByRole('button',{name:'Cerrar apuestas',exact:true}).click();await expect(card).toHaveAttribute('data-phase','locked');await card.getByRole('button',{name:'Elegir ganador: Equipo Rojo',exact:true}).click();await card.getByRole('button',{name:'Revisar resultado',exact:true}).click();await card.getByRole('button',{name:'Confirmar ganador',exact:true}).click();
 await expect(card.locator('.plot-resolution.count')).toHaveAttribute('data-state','won');await expect(card.locator('.resolution-count')).toHaveAttribute('data-complete','true');await expect(card.locator('.resolution-net')).toHaveAttribute('aria-label','+188 pts');await expect(card.locator('.resolution-receipt')).toContainText('Tu apuesta100 pts');await expect(card.locator('.resolution-receipt')).toContainText('Cobro total288 pts');await expect(card.locator('.phone-market[data-management]')).toHaveCount(0);
 for(const [width,height] of [[700,600],[360,800]]){await page.setViewportSize({width,height});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await card.scrollIntoViewIfNeeded();await page.screenshot({path:`test-results/streamer-resolution-personal-${width}.png`});}
 await card.getByRole('button',{name:'Cobrar 288 pts',exact:true}).click();await expect(card.getByRole('button',{name:'Cobrar 288 pts',exact:true})).toHaveCount(0);await expect(page.locator('#own-balance')).toContainText('10.194');
});

test('automatic cancellation explains missing winning bets before and after confirmation',async({page,browser})=>{
 await owner(page);
 const viewer=await browser.newPage();await signIn(viewer);
 try{
  for(const withBet of [false,true]){
   const card=await create(page,withBet?'¿Resultado sin ganadores apostados?':'¿Resultado sin apuestas?');
   const key=await card.getAttribute('data-streamer-key');
   if(withBet)await api(viewer,'/api/points/bet',{key,outcomeId:'1',amount:200,requestId:randomUUID()});
   await card.getByRole('button',{name:'Cerrar apuestas',exact:true}).click();
   await card.getByRole('button',{name:'Elegir ganador: Equipo Azul',exact:true}).click();
   await card.getByRole('button',{name:'Revisar resultado',exact:true}).click();
   await expect(card.getByRole('region',{name:'Confirmar liquidación'}).locator('[data-settlement-share=winners]')).toHaveText(`Reembolso a usuarios${withBet?200:0}pts`);
   await card.getByRole('button',{name:'Confirmar anulación',exact:true}).click();
   await expect(card).toHaveAttribute('data-phase','void');await expect(card).toContainText('Anulada');
   await expect(card.locator('.resolution-reason')).toContainText(withBet?'No hubo apuestas a la opción ganadora':'no recibió apuestas');
   await expect(card).toContainText(withBet?'Todas las apuestas fueron reembolsadas.':'La predicción no recibió apuestas.');
   const markets=await api(page,'/api/markets'),market=markets.find((m:{key:string})=>m.key===key);
   expect(market.phase).toBe('void');expect(market.winnerId).toBe('2');expect(market.reason).toContain(withBet?'No hubo apuestas a la opción ganadora':'no recibió apuestas');
   await page.reload();await expect(card).toHaveAttribute('data-phase','void');await expect(card.locator('.resolution-reason')).toContainText(withBet?'No hubo apuestas a la opción ganadora':'no recibió apuestas');
   const me=await api(viewer,'/api/points/me');expect(me.balance).toBe(10000);
   expect(me.ledger.filter((entry:{kind:string;marketKey:string})=>entry.kind==='refund'&&entry.marketKey===key)).toHaveLength(withBet?1:0);
  }
 }finally{await viewer.close();}
});

test('concise settlement amounts preserve fees and payouts while user cards omit commission blocks',async({page,browser})=>{
 await page.setViewportSize({width:700,height:600});const login=await owner(page),card=await create(page,'¿Repartimos 1000 puntos?');
 const key=await card.getAttribute('data-streamer-key');const viewer=await browser.newPage();
 try{
  await signIn(viewer);await viewer.goto(`/app?channel=${login}`);
  const viewerCard=viewer.locator(`[data-key="${key}"]`);await viewerCard.getByRole('button',{name:'Apostar a Equipo Rojo',exact:true}).click();
  const dialog=viewer.getByRole('dialog');await dialog.getByLabel('Puntos a apostar',{exact:true}).fill('1000');
  await expect(dialog.locator('.points-fees,.points-fee-note')).toHaveCount(0);
  for(const width of [700,360]){
   await viewer.setViewportSize({width,height:600});await dialog.getByRole('button',{name:'Confirmar apuesta',exact:false}).scrollIntoViewIfNeeded();
   expect(await viewer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   await viewer.screenshot({path:`test-results/point-fees-bet-${width}.png`});
  }
  await dialog.getByRole('button',{name:'Confirmar apuesta',exact:false}).click();await expect(dialog).toHaveCount(0);
  const before=(await api(page,'/api/points/me')).balance;
  await card.getByRole('button',{name:'Cerrar apuestas',exact:true}).click();await card.getByRole('button',{name:'Elegir ganador: Equipo Rojo',exact:true}).click();await card.getByRole('button',{name:'Revisar resultado',exact:true}).click();
  const preview=card.getByRole('region',{name:'Confirmar liquidación'});await expect(preview.locator('[data-settlement-share=streamer]')).toHaveText('Para el streamer20pts');await expect(preview.locator('[data-settlement-share=winners]')).toHaveText('Para ganadores960pts');
  expect((await api(page,'/api/points/me')).balance).toBe(before);
  await card.getByRole('button',{name:'Confirmar ganador',exact:true}).click();await expect(card).toHaveAttribute('data-phase','resolved');
  await expect(card.locator('.points-fees,.points-fee-note,.manager-earnings')).toHaveCount(0);await expect(card.getByRole('region',{name:'Ganancia del streamer'})).toHaveCount(0);await expect(card).not.toContainText('No se modificó tu saldo.');
  const me=await api(page,'/api/points/me');expect(me.balance).toBe(before+20);expect(me.streamerEarnings).toBe(20);
  await viewer.goto('/app#history');await expect(viewer.locator('.plot-resolution')).toBeVisible();await expect(viewer.locator('.points-fees,.points-fee-note,.manager-earnings')).toHaveCount(0);
  const winner=await api(viewer,'/api/points/me');expect(winner.claimable).toBe(960);
  const claim=await api(viewer,'/api/points/claim',{key,requestId:randomUUID()});expect(claim.paid).toBe(960);expect(claim.balance).toBe(9960);
  await page.reload();await expect(card.locator('.points-fees,.points-fee-note,.manager-earnings')).toHaveCount(0);
  expect((await api(page,'/api/points/me')).streamerEarnings).toBe(20);
  for(const width of [700,360]){await page.setViewportSize({width,height:600});await card.scrollIntoViewIfNeeded();await page.screenshot({path:`test-results/point-fees-resolved-${width}.png`});}
  await page.getByRole('button',{name:'Mi perfil',exact:true}).click();await expect(page.locator('.phone-profile-stats')).toContainText('Comisiones20 pts');
 }finally{await viewer.close();}
});
