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
  await expect(card.getByRole('region',{name:'Ganancia del streamer'})).toHaveText('Ganaste0pts');for(const text of ['No participaste','No se modificó tu saldo.','Liquidado antes de aplicar comisiones.'])await expect(card).not.toContainText(text);
  await expect(card.locator('.resolution-result')).toHaveCount(0);await expect(card.getByRole('button',{name:/Elegir ganador|Confirmar ganador|Revisar resultado/})).toHaveCount(0);
  for(const width of [360,700,1440]){
   await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   expect(await state.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);expect(await state.locator('.manager-state-title').evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(28);
   await page.screenshot({path:`test-results/streamer-finished-${phase}-${width}.png`});
  }
 }
 expect(writes).toEqual([]);
});

test('streamer earned amount uses only that market persisted fee or ledger credit and void stays zero',async({page})=>{
 const data=demoSnapshot(),account=data.account!;account.streamerChannels=['ramitapai'];account.bets=[];
 const markets=['fees','ledger','unknown','void'].map(kind=>({...structuredClone(data.markets[0]),key:`earned-${kind}`,totalPoints:750,totalBets:2,participants:2,outcomes:data.markets[0].outcomes.map((o,i)=>({...o,points:i===0?500:250,bets:1,share:(i===0?500:250)/750*100})),source:'plot' as const,phase:kind==='void'?'void' as const:'resolved' as const,canBet:false,winnerId:'yes',fees:kind==='fees'||kind==='void'?{version:1 as const,pool:750,streamer:15,platform:15,winners:720}:undefined}));
 account.ledger=[['earned-fees',15],['earned-ledger',7],['earned-void',15],['another-market',99]].map(([marketKey,delta],i)=>({id:`fee-${i}`,kind:'streamer_fee' as const,marketKey:marketKey as string,delta:delta as number,balance:account.balance,title:undefined,accountId:account.id,createdAt:new Date().toISOString()}));
 const clockStart=new Date('2026-11-11T18:00:00Z');await page.clock.install({time:clockStart});await page.clock.pauseAt(new Date(clockStart.getTime()+60000));await page.emulateMedia({reducedMotion:'no-preference'});
 let consoleLoads=0;const writes:string[]=[];await page.addInitScript(()=>localStorage.setItem('pointsToken','streamer-earned-fixture'));
 await page.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;if(path==='/api/streamer/console')consoleLoads++;if(route.request().method()!=='GET')writes.push(path);return route.fulfill({json:path==='/api/points/me'?account:path==='/api/streamer/console'?{channels:['ramitapai'],markets}:path==='/api/markets'?markets:path==='/api/channels'?{channels:['ramitapai']}:{proposals:[]}});});
 await page.goto('/app');
 const animated=page.locator('[data-streamer-key="earned-fees"] .manager-earnings .resolution-count');
 await expect(animated).toHaveAttribute('data-complete','false');await expect(animated).toHaveText('0');await expect(page.locator('[data-streamer-key="earned-fees"] .manager-earnings p')).toHaveAttribute('aria-label','15 pts');
 await page.clock.runFor(300);const intermediate=Number(await animated.textContent());expect(intermediate).toBeGreaterThan(0);expect(intermediate).toBeLessThan(15);
 await page.clock.runFor(1500);await expect(animated).toHaveAttribute('data-complete','true');await expect(animated).toHaveText('15');await expect(animated).toHaveCSS('animation-name','payout-count-arrival');
 await animated.evaluate(e=>{e.setAttribute('data-animation-marker','stable');const state=window as Window&{earningsReplayed?:boolean};state.earningsReplayed=false;new MutationObserver(()=>{if(e.getAttribute('data-complete')==='false')state.earningsReplayed=true;}).observe(e,{attributes:true,attributeFilter:['data-complete']});});
 await page.clock.runFor(11000);await expect.poll(()=>consoleLoads).toBeGreaterThanOrEqual(2);await page.clock.runFor(100);await expect(animated).toHaveAttribute('data-animation-marker','stable');expect(await page.evaluate(()=>(window as Window&{earningsReplayed?:boolean}).earningsReplayed)).toBe(false);

 for(const [kind,amount] of [['fees',15],['ledger',7],['unknown',0],['void',0]] as const){const card=page.locator(`[data-streamer-key="earned-${kind}"]`);await expect(card.getByRole('region',{name:'Ganancia del streamer'})).toHaveText(`Ganaste${amount}pts`);await expect(card.locator('.points-fees,.points-fee-note')).toHaveCount(0);}
 const card=page.locator('[data-streamer-key="earned-fees"]');
 for(const width of [360,700,1440]){await page.setViewportSize({width,height:width===700?600:900});const earnings=card.locator('.manager-earnings');expect(await earnings.locator('strong').evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(36);expect(await card.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);await card.locator('.phone-market').screenshot({path:`test-results/streamer-earned-${width}.png`,animations:'disabled'});}
 await page.emulateMedia({reducedMotion:'reduce'});await page.reload();await expect(animated).toHaveText('15');await expect(animated).toHaveAttribute('data-complete','true');await expect(animated).toHaveCSS('animation-name','none');
 expect(writes).toEqual([]);
});
