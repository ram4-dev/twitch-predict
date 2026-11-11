import {test,expect} from '@playwright/test';
import {demoSnapshot} from '../src/ui/mobile-app-data.js';

test('state-first manager clearly separates open, pending choice and external result without premature writes',async({page})=>{
 const data=demoSnapshot(),market=data.markets[0],account=data.account!;
 account.streamerChannels=['ramitapai'];market.source='plot';
 market.outcomes[1].title='Equipo Azul con un nombre de opción largo para verificar el espacio disponible';
 const writes:string[]=[],errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('pointsToken','state-first-fixture'));
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(route.request().method()==='POST'){
   writes.push(path);
   if(path==='/api/streamer/action'){market.phase='locked';market.canBet=false;market.updatedAt=new Date().toISOString();return route.fulfill({json:market});}
  }
  return route.fulfill({json:path==='/api/points/me'?account:path==='/api/streamer/console'?{channels:['ramitapai'],markets:[market]}:path==='/api/markets'?[market]:path==='/api/channels'?{channels:['ramitapai']}:{proposals:[]}});
 });
 await page.goto('/app');const card=page.locator('[data-streamer-key]'),state=card.getByRole('status',{name:'Estado del mercado'});
 await expect(state.locator('.manager-state-title')).toHaveText('Apuestas abiertas');await expect(card.getByRole('button',{name:'Elegir ganador: Sí',exact:true})).toBeDisabled();
 await card.getByRole('button',{name:'Cerrar apuestas',exact:true}).click();await expect(state.locator('.manager-state-title')).toHaveText('Elegí al ganador');await expect(state).toContainText('Seleccioná una de las opciones');
 const blue=card.getByRole('button',{name:`Elegir ganador: ${market.outcomes[1].title}`,exact:true});await blue.focus();await page.keyboard.press('Enter');
 await expect(state.locator('.manager-state-title')).toHaveText(market.outcomes[1].title);await expect(state).toContainText('Pendiente de confirmar.');await expect(blue).toHaveAttribute('aria-pressed','true');await expect(state.locator('.manager-state-title')).toHaveCSS('color','rgb(145, 233, 189)');await expect(blue.locator('.phone-outcome-name')).toHaveCSS('color','rgb(255, 255, 255)');
 expect(writes).toEqual(['/api/streamer/action']);
 for(const width of [360,700,1440]){
  await page.setViewportSize({width,height:width===700?600:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(state).toBeVisible();if(width===360)expect((await blue.boundingBox())!.height).toBeLessThan(200);for(const el of [state,blue])expect(await el.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
  await card.scrollIntoViewIfNeeded();await page.screenshot({path:`test-results/streamer-state-selected-${width}.png`});
 }
 await page.emulateMedia({reducedMotion:'reduce'});await expect(state.locator('.manager-state-title')).toBeVisible();
 market.source=undefined;await page.reload();await expect(state.locator('.manager-state-title')).toHaveText('Esperando resultado');await expect(state).toContainText('Twitch confirmará el resultado.');await expect(blue).toBeDisabled();await expect(card.getByRole('button',{name:'Revisar resultado',exact:true})).toHaveCount(0);
 expect(writes).toEqual(['/api/streamer/action']);expect(errors).toEqual([]);
});

test('finished streamer markets show the confirmed winner or annulment prominently, without live writes',async({page})=>{
 const data=demoSnapshot(),market=data.markets[0],account=data.account!;
 account.streamerChannels=['ramitapai'];account.bets=[];market.source='plot';market.phase='resolved';market.canBet=false;market.winnerId='yes';
 const writes:string[]=[];page.on('request',r=>{if(r.method()!=='GET')writes.push(r.url());});
 await page.addInitScript(()=>localStorage.setItem('pointsToken','finished-state-fixture'));
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;
  return route.fulfill({json:path==='/api/points/me'?account:path==='/api/streamer/console'?{channels:['ramitapai'],markets:[market]}:path==='/api/markets'?[market]:path==='/api/channels'?{channels:['ramitapai']}:{proposals:[]}});
 });
 for(const phase of ['resolved','void'] as const){
  market.phase=phase;market.reason=phase==='void'?'No hubo apuestas a la opción ganadora. Todas las apuestas fueron reembolsadas.':undefined;
  await page.goto('/app');const card=page.locator('[data-streamer-key]'),state=card.getByRole('status',{name:'Estado del mercado'});
  await expect(state).toHaveAttribute('data-state',phase);
  if(phase==='resolved'){
   await expect(state.locator('.manager-state-title')).toHaveText('Ganó Sí');await expect(state.locator('.manager-state-title')).toHaveCSS('color','rgb(145, 233, 189)');await expect(state.locator('.manager-state-loser')).toHaveText('Perdió No');await expect(state.locator('.manager-state-loser')).toHaveCSS('color','rgb(255, 154, 168)');
  }else{
   await expect(state.locator('.manager-state-title')).toHaveText('Mercado anulado');await expect(state.locator('.manager-state-title')).toHaveCSS('color','rgb(242, 204, 134)');await expect(state.locator('.manager-state-loser')).toHaveCount(0);await expect(card.locator('.resolution-reason')).toContainText('No hubo apuestas a la opción ganadora');await expect(state).not.toContainText('Ganó');
  }
  await expect(card.getByRole('region',{name:'Ganancia del streamer'})).toContainText('0pts');for(const text of ['No participaste','No se modificó tu saldo.','Liquidado antes de aplicar comisiones.'])await expect(card).not.toContainText(text);
  await expect(card.locator('.resolution-result')).toHaveCount(0);await expect(card.getByRole('button',{name:/Elegir ganador|Confirmar ganador|Revisar resultado/})).toHaveCount(0);
  for(const width of [360,700,1440]){
   await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   expect(await state.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);expect(await state.locator('.manager-state-title').evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(28);
   await page.screenshot({path:`test-results/streamer-finished-${phase}-${width}.png`});
  }
 }
 expect(writes).toEqual([]);
});
