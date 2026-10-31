import {test,expect,chromium} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';

test('MV3 liquid resolution uses account totals for winner, mixed bets, loser, refund and spectator',async()=>{
 const profile=await mkdtemp(`${tmpdir()}/liquid-resolution-`);
 const extension=resolve('extension');
 const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,viewport:{width:700,height:600},args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
 const stamp=new Date().toISOString();
 const prediction={id:'liquid-fixture',channel:'demo_streamer',title:'¿Se completa el desafío?',status:'RESOLVED',createdAt:stamp,predictionWindowSeconds:60,outcomes:[{id:'no',title:'No se completa',totalPoints:20,totalUsers:1},{id:'yes',title:'Se completa',totalPoints:40,totalUsers:2}]};
 const market={key:'liquid-fixture',prediction,phase:'resolved',winnerId:'yes',demo:true,sourceFresh:true,canBet:false,totalPoints:1000,totalBets:3,participants:3,outcomes:prediction.outcomes.map(o=>({...o,points:500,bets:1,share:50}))};
 type Bet={marketKey:string;outcomeId:string;amount:number;payout:number;claimed:boolean;title:string;outcome:string;phase:string};
 const bet=(outcomeId:string,amount:number,payout:number,claimed=false):Bet=>({marketKey:market.key,outcomeId,amount,payout,claimed,title:prediction.title,outcome:outcomeId==='yes'?'Se completa':'No se completa',phase:market.phase});
 let bets=[bet('yes',200,530)];
 const writes:string[]=[];
 try{
  await context.route('http://twitch-predict.localhost:1356/**',route=>{
   const path=new URL(route.request().url()).pathname;
   if(path==='/api/points/bet'||path==='/api/points/claim')writes.push(path);
   return route.fulfill({json:path==='/api/health'?{marketMode:'offchain'}:path==='/api/markets'?[market]:path==='/api/points/me'?{id:'fixture-account',wallet:'fixture-wallet',name:'Fixture',balance:10000,bets,streamerChannels:[]}:path==='/api/auth/extension/start'?{url:'http://twitch-predict.localhost:1356/onboarding',flowId:'fixture'}:{}});
  });
  const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');const id=new URL(worker.url()).host;
  await worker.evaluate(async prediction=>{
   const chrome=(globalThis as unknown as {chrome:{storage:{local:{set(value:unknown):Promise<void>}}}}).chrome;
   await chrome.storage.local.set({pointsToken:'fixture-only',lastPoll:{channel:'demo_streamer'},'channel:demo_streamer':{fetchedAt:new Date().toISOString(),predictions:[{prediction}]}});
  },prediction);
  const page=await context.newPage();await page.goto(`chrome-extension://${id}/popup.html`);
  const card=page.locator('.plot-resolution.count');await expect(card).toHaveAttribute('data-state','won');
  await expect(card.locator('.resolution-result')).toContainText('Se completa');await expect(card.locator('.resolution-outcomes')).toHaveCount(0);
  await expect(card.locator('.resolution-net')).toHaveText('+330 pts');await expect(card.locator('.resolution-receipt')).toContainText('530 pts');
  expect(await card.locator('.resolution-net-value').evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(48);
  const claimBox=await card.getByRole('button',{name:'Claim 530 pts'}).boundingBox();expect(claimBox!.y+claimBox!.height).toBeLessThan(560);
  await page.screenshot({path:'test-results/liquid-resolution-large-pnl.png',fullPage:true});
  expect(await card.evaluate(el=>getComputedStyle(el,'::before').animationName)).toBe('none');
  const overlay=page.locator('.prediction.plot-glow-card').first();await overlay.hover();await expect(overlay).toHaveAttribute('data-glow-active','true');expect(await overlay.evaluate(el=>getComputedStyle(el,'::after').pointerEvents)).toBe('none');expect(await overlay.evaluate(el=>{const rim=getComputedStyle(el,'::before');return {top:rim.top,right:rim.right,padding:rim.paddingTop,pointer:rim.pointerEvents};})).toEqual({top:'-3px',right:'-3px',padding:'3px',pointer:'none'});expect(await overlay.evaluate(el=>getComputedStyle(el,'::after').zIndex)).toBe('3');
  const stage=page.locator('body');await expect(stage).toHaveClass(/plot-glow-stage/);expect(await stage.evaluate(el=>getComputedStyle(el,'::before').filter)).toBe('blur(18px)');expect(await stage.evaluate(el=>getComputedStyle(el,'::before').position)).toBe('fixed');await page.locator('header').hover();await expect(stage).toHaveAttribute('data-glow-active','true');await page.locator('footer').hover();await expect(stage).toHaveAttribute('data-glow-active','true');
  await expect(page.getByRole('button',{name:/Pausar animación|Reanudar animación/})).toHaveCount(0);await expect(card.locator('.resolution-count')).toHaveAttribute('data-complete','true');expect(await card.locator('.resolution-net').evaluate(el=>getComputedStyle(el).color)).toBe('rgb(121, 226, 180)');
  bets=[bet('yes',1000000,9500000)];await page.reload();await expect(card.locator('.resolution-net')).toHaveText('+8,500,000 pts');
  expect(await card.locator('.resolution-net-value').evaluate(el=>{
   const box=el.getBoundingClientRect(),parent=el.closest('.resolution-personal')!.getBoundingClientRect();
   return box.left>=parent.left&&box.right<=parent.right&&el.scrollWidth<=el.clientWidth;
  })).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  // Claim state changes the available action, not the original financial result.
  bets=[bet('yes',200,530,true)];await page.reload();await expect(card.locator('.resolution-net')).toHaveText('+330 pts');await expect(card.locator('.resolution-credited')).toContainText('530 pts');await expect(card.locator('.points-claim')).toHaveCount(0);
  // A user can back both options and hit the winner while losing money overall.
  bets=[bet('yes',100,150),bet('no',200,0)];await page.reload();await expect(card).toHaveAttribute('data-state','won');await expect(card.locator('.resolution-net')).toHaveText('−150 pts');await expect(card.locator('.resolution-label')).toHaveText('Net loss');
  bets=[bet('no',200,0)];await page.reload();await expect(card).toHaveAttribute('data-state','lost');await expect(card.locator('.resolution-net')).toHaveText('−200 pts');await expect(card.locator('.points-claim')).toHaveCount(0);
  market.phase='void';bets=[bet('no',200,200)];await page.reload();await expect(card).toHaveAttribute('data-state','void');await expect(card.locator('.resolution-net')).toHaveText('0 pts');await expect(card.locator('.winner,.loser')).toHaveCount(0);await expect(card.getByRole('button',{name:'Recover 200 pts'})).toBeVisible();
  market.phase='resolved';bets=[];await page.reload();await expect(card).toHaveAttribute('data-state','spectator');await expect(card.locator('.resolution-receipt')).toHaveCount(0);await expect(card.getByText('You did not take part',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.emulateMedia({reducedMotion:'reduce'});expect(await card.evaluate(el=>getComputedStyle(el,'::before').animationName)).toBe('none');
  expect(writes).toEqual([]);
 }finally{await context.close();await rm(profile,{recursive:true,force:true});}
});

test('MV3 SOL resolution uses animated glass and does not invent a wallet payout',async()=>{
 const profile=await mkdtemp(`${tmpdir()}/liquid-sol-`),extension=resolve('extension');
 const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,viewport:{width:700,height:600},args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
 const market={id:'pm_liquid',title:'¿Gana el equipo?',options:['No gana','Gana'],currency:'sol',status:'resolved',bettable:false,resolvable:false,openMs:Date.now()-60000,closeMs:Date.now()-1000,chain:{market:'11111111111111111111111111111111',settled:false},pools:[2000000,3000000],total:5000000,bettors:2,winner:1,invalidReason:null,notes:{channel:'demo_streamer'}};
 try{
  await context.route('http://twitch-predict.localhost:1356/**',route=>{
   const path=new URL(route.request().url()).pathname;
   return route.fulfill({json:path==='/api/health'?{marketMode:'byte'}:path==='/api/byte/markets'?{markets:[market]}:path==='/api/byte/config'?{enabled:true}:path==='/api/auth/extension/start'?{url:'http://twitch-predict.localhost:1356/onboarding',flowId:'fixture'}:{}});
  });
  const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');const id=new URL(worker.url()).host;
  await worker.evaluate(async()=>{await (globalThis as unknown as {chrome:{storage:{local:{set(value:unknown):Promise<void>}}}}).chrome.storage.local.set({byteOperation:{marketId:'pm_liquid',status:'confirmed',receipt:{signature:'test-signature'}}});});
  const page=await context.newPage();await page.goto(`chrome-extension://${id}/popup.html`);
  const card=page.locator('.plot-resolution.count');await expect(card).toBeVisible();await expect(page.getByText('Stake confirmed on Solana.',{exact:false})).toHaveCount(0);await expect(page.locator('#freshness')).toBeHidden();await expect(card.locator('.resolution-result')).toContainText('Gana');await expect(card.locator('.resolution-outcomes')).toHaveCount(0);await expect(card).toContainText('Your payout amount is not available.');await expect(card.locator('.resolution-net,.resolution-receipt')).toHaveCount(0);
  await expect(card).toContainText('Waiting for byte to finish payouts.');
  expect(await card.evaluate(el=>getComputedStyle(el,'::before').animationName)).toBe('none');
  market.chain.settled=true;await page.reload();await expect(card).toContainText('Payouts or refunds completed on-chain.');await expect(card.locator('.resolution-net')).toHaveCount(0);
  await expect(card.getByRole('link',{name:'View market on Solana devnet'})).toHaveAttribute('href',`https://explorer.solana.com/address/${market.chain.market}?cluster=devnet`);
  market.status='invalid';await page.reload();await expect(card).toContainText('Voided');await expect(card.locator('.winner,.loser')).toHaveCount(0);
  await page.screenshot({path:'test-results/liquid-sol-resolution.png',fullPage:true});
 }finally{await context.close();await rm(profile,{recursive:true,force:true});}
});
