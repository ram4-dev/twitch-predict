import {test,expect} from '@playwright/test';
import {demoSnapshot} from '../src/ui/mobile-app-data.js';

test.use({hasTouch:true});

test('web uses the shared resolution in history, details and streamer workspace with persistent claim totals',async({page})=>{
 const snapshot=demoSnapshot(),market=snapshot.markets[0],account=snapshot.account!;
 market.phase='resolved';market.canBet=false;market.winnerId='yes';market.source='plot';
 account.bets=[{...account.bets[0],amount:100,payout:320,phase:'resolved'}];account.claimable=320;
 const errors:string[]=[],writes:string[]=[];let failClaim=true;
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('pointsToken','resolution-fixture'));
 await page.context().route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(route.request().method()!=='GET')writes.push(path);
  if(path==='/api/points/claim'){
   if(failClaim){failClaim=false;return route.fulfill({status:503,json:{error:'Cobro temporalmente no disponible'}});}
   for(const bet of account.bets)bet.claimed=true;account.balance+=account.claimable;account.claimable=0;
   return route.fulfill({json:{paid:320}});
  }
  return route.fulfill({json:path==='/api/markets'?[market]:path==='/api/points/me'?account:path==='/api/channels'?{channels:['ramitapai']}:path==='/api/streamer/console'?{channels:['ramitapai'],markets:[{...market,bets:account.bets,credited:320,pending:0}]}:path==='/api/google/config'?{configured:false}:{proposals:[]}});
 });
 await page.goto('/app#history');const card=page.locator('.plot-resolution.count');await expect(card).toBeVisible();await expect(card.locator('.points-fees,.points-fee-note,.manager-earnings')).toHaveCount(0);await expect(card).toHaveCount(1);
 await expect(card.locator('.resolution-net')).toHaveText('+220 pts');await expect(card.locator('.resolution-receipt')).toHaveText('Tu apuesta100 ptsCobro total320 pts');
 await expect(page.locator('.phone-position .phone-market,.phone-position-receipt')).toHaveCount(0);
 await card.getByRole('button',{name:'Cobrar 320 pts',exact:true}).click();await expect(page).not.toHaveURL(/market=/);await expect(card.getByRole('alert')).toContainText('Cobro temporalmente no disponible');await expect(card.locator('.resolution-net')).toHaveText('+220 pts');
 await card.getByRole('button',{name:'Cobrar 320 pts',exact:true}).click();await expect(card.locator('.resolution-credited')).toContainText('Cobro acreditado · 320 pts');await expect(card.locator('.resolution-net')).toHaveText('+220 pts');await expect(card.locator('.points-claim')).toHaveCount(0);await expect(page).not.toHaveURL(/market=/);
 await expect(card.getByRole('button',{name:/Ver detalle|Abrir mercado|Ir al mercado/})).toHaveCount(0);
 const link=card.getByRole('link',{name:`Ver mercado: ${market.prediction.title}`,exact:true});await expect(link).toHaveAttribute('href',/market=demo-1/);
 const popupPromise=page.context().waitForEvent('page',{timeout:5000});await link.click({modifiers:['Control']});const opened=await popupPromise;await expect(opened).toHaveURL(/market=demo-1/);await opened.close();await expect(page).not.toHaveURL(/market=/);
 await card.scrollIntoViewIfNeeded();const scroll=await page.locator('.phone-content').evaluate(e=>e.scrollTop);const box=(await card.locator('.resolution-net').boundingBox())!;await page.mouse.click(box.x+box.width/2,box.y+box.height/2);await expect(page).toHaveURL(/market=demo-1/);await expect(card).toHaveCount(1);await expect(card.locator('.resolution-net')).toHaveText('+220 pts');await expect(page.locator('.detail-duel,.detail-result,.detail-actions')).toHaveCount(0);
 await expect(card.locator('.resolution-market-link,.resolution-detail-toggle,.resolution-detail')).toHaveCount(0);
 await page.goBack();await expect(page).not.toHaveURL(/market=/);await expect(link).toBeVisible();await expect.poll(()=>page.locator('.phone-content').evaluate(e=>e.scrollTop)).toBe(scroll);
 await page.keyboard.press('Tab');await link.focus();await expect(link).toBeFocused();expect(await link.evaluate(e=>({style:getComputedStyle(e,'::after').outlineStyle,offset:getComputedStyle(e,'::after').outlineOffset}))).toEqual({style:'solid',offset:'-3px'});await page.keyboard.press('Enter');await expect(page).toHaveURL(/market=demo-1/);await expect(card.locator('.resolution-receipt')).toHaveText('Tu apuesta100 ptsCobro total320 pts');
 for(const [width,height] of [[360,800],[700,600],[1440,900]]){
  await page.setViewportSize({width,height});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);const container=page.locator('.detail-scroll');expect((await card.boundingBox())!.width).toBeGreaterThan((await container.boundingBox())!.width-12);await expect(card.locator('.resolution-net')).toHaveCSS('color','rgb(121, 226, 180)');
  await page.screenshot({path:`test-results/web-resolution-${width}.png`});
  await page.getByRole('button',{name:'Volver',exact:true}).click();await expect(page).not.toHaveURL(/market=/);await card.locator('.resolution-net').scrollIntoViewIfNeeded();const tapBox=(await card.locator('.resolution-net').boundingBox())!;await page.touchscreen.tap(tapBox.x+tapBox.width/2,tapBox.y+tapBox.height/2);await expect(page).toHaveURL(/market=demo-1/);
 }
 account.streamerChannels=['ramitapai'];
 await page.goto('/app#markets');await expect(page.locator('[data-streamer-key="demo-1"] .plot-resolution.count')).toHaveCount(1);await expect(card.locator('.resolution-net')).toHaveText('+220 pts');await expect(page.locator('.phone-streamer-market-options,.phone-admin-actions')).toHaveCount(0);
 expect(writes).toEqual(['/api/points/claim','/api/points/claim']);expect(errors).toEqual([]);
});

test('web resolution handles loss, mixed bets, refunds, spectators and unknown accounts at compact widths',async({page})=>{
 const snapshot=demoSnapshot(),market=snapshot.markets[0],account=snapshot.account!;let known=true;
 market.phase='resolved';market.canBet=false;market.winnerId='yes';
 await page.addInitScript(()=>localStorage.setItem('pointsToken','resolution-fixture'));
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;
  return path==='/api/points/me'&&!known?route.fulfill({status:401,json:{error:'Sin cuenta'}}):route.fulfill({json:path==='/api/markets'?[market]:path==='/api/points/me'?account:path==='/api/channels'?{channels:['ramitapai']}:[]});
 });
 const bet=account.bets[0];
 for(const scenario of [
  {state:'lost',phase:'resolved',bets:[{...bet,outcomeId:'no',amount:200,payout:0}],net:'−200 pts'},
  {state:'won',phase:'resolved',bets:[{...bet,amount:100,payout:150},{...bet,id:'second',outcomeId:'no',amount:200,payout:0}],net:'−150 pts'},
  {state:'void',phase:'void',bets:[{...bet,amount:200,payout:200,claimed:true}],net:'0 pts'},
  {state:'won',phase:'resolved',bets:[{...bet,amount:1000000,payout:9500000}],net:'+8.500.000 pts'},
  {state:'spectator',phase:'resolved',bets:[],net:undefined},
 ] as const){
  market.phase=scenario.phase;account.bets=scenario.bets.map(b=>({...b,phase:scenario.phase}));
  await page.goto('/app?market=demo-1');const card=page.locator('.plot-resolution.count');await expect(card).toBeVisible();await expect(card.locator('.points-fees,.points-fee-note,.manager-earnings')).toHaveCount(0);await expect(card).toHaveAttribute('data-state',scenario.state);
  if(scenario.net)await expect(card.locator('.resolution-net')).toHaveText(scenario.net);else{await expect(card).toContainText('No participaste');await expect(card.locator('.resolution-receipt')).toHaveCount(0);}
  if(scenario.phase==='void'){await expect(card).toContainText('Reembolso total');await expect(card).toContainText('Reembolso acreditado');await expect(card).not.toContainText('Ganó Sí');}else{await expect(card.locator('.resolution-result')).toContainText('Ganó Sí');await expect(card.locator('.resolution-result')).toContainText('Perdió No');}
  for(const width of [360,700]){await page.setViewportSize({width,height:600});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await card.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);}
  if(scenario.net)await page.screenshot({path:`test-results/web-resolution-${scenario.state}-${scenario.bets.length}.png`});
 }
 known=false;await page.reload();await expect(page.getByRole('region',{name:'Iniciar sesión'})).toBeVisible();await expect(page.locator('.plot-resolution')).toHaveCount(0);
 await page.goto('/s/twitch/ramitapai');await page.getByRole('link',{name:'Ver detalle: ¿Gana la próxima partida?',exact:true}).click();await expect(page.locator('.plot-resolution')).toHaveAttribute('data-state','unknown');await expect(page.locator('.plot-resolution')).toContainText('Conectá tu cuenta');await expect(page.locator('.resolution-net,.resolution-receipt')).toHaveCount(0);
 await page.emulateMedia({reducedMotion:'reduce'});known=true;await page.evaluate(()=>localStorage.setItem('pointsToken','resolution-fixture'));account.bets=[{...bet,amount:100,payout:320,phase:'resolved'}];await page.goto('/app?market=demo-1');await expect(page.locator('.resolution-count')).toHaveAttribute('data-complete','true');await expect(page.locator('.resolution-count')).toHaveCSS('animation-name','none');
});
