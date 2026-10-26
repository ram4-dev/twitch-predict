import {test,expect,type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {signIn} from './fixtures/phantom.js';
async function operator(page:Page,path:string,body:unknown){return page.evaluate(async({path,body})=>{const {token}=await(await fetch('/api/pair')).json();const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(body)});if(!r.ok)throw new Error((await r.json()).error);return r.json();},{path,body});}
async function own(page:Page,path:string,body?:unknown){return page.evaluate(async({path,body})=>{const r=await fetch(path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${localStorage.getItem('pointsToken')}`},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json()};},{path,body});}
test.skip(process.env.MARKET_MODE==='solana','Offchain settlement');
test('streamer console is read-only while settlement API preserves payouts, offline credits and refunds',async({page,browser})=>{
  await signIn(page);const m=await operator(page,'/api/demo',{});
  await page.getByRole('link',{name:'Canales',exact:true}).click();await expect(page.getByLabel('Canal del streamer',{exact:true})).toHaveValue('demo_streamer');await page.getByRole('button',{name:'Habilitar mi wallet para este canal',exact:true}).click();await expect(page).toHaveURL(/#streamer$/);
  const managed=page.locator(`[data-streamer-key="${m.key}"]`);await expect(managed).toBeVisible();
  const contexts=await Promise.all([browser.newContext(),browser.newContext(),browser.newContext()]);
  try{
    const users=await Promise.all(contexts.map(c=>c.newPage()));const wallets=[];
    for(let i=0;i<users.length;i++){
      wallets.push(await signIn(users[i]));await users[i].reload();const card=users[i].locator(`[data-key="${m.key}"]`);
      await card.getByLabel('Puntos a apostar').fill(String([100,300,600][i]));await card.getByRole('button',{name:`Apostar a ${i===2?'Pierde':'Gana'}`,exact:true}).click();await expect(users[i].locator('#own-balance')).toHaveText(['9.900','9.700','9.400'][i]);
    }
    const unauthorized=await own(users[0],'/api/streamer/action',{key:m.key,action:'lock',requestId:randomUUID()});expect(unauthorized.status).toBe(400);expect(unauthorized.body.error).toContain('permisos');
    const privateConsole=await own(users[0],'/api/streamer/console');expect(privateConsole.body.markets).toEqual([]);
    const selfGrant=await own(users[0],'/api/operator/streamers',{channel:'other_channel',wallet:wallets[0].address});expect(selfGrant.status).toBe(401);
    await page.reload();
    await expect(managed.getByRole('button')).toHaveCount(0);
    await expect(managed.locator('input,select,table,details')).toHaveCount(0);
    for(const w of wallets)await expect(managed.locator(`code[title="${w.address}"]`)).toHaveCount(0);
    await expect(page.locator('#streamer')).not.toContainText('Pozo total');
    const locked=await own(page,'/api/streamer/action',{key:m.key,action:'lock',requestId:randomUUID()});expect(locked.status).toBe(200);
    await page.reload();await expect(managed).toContainText('Esperando resultado');await expect(managed.getByRole('button')).toHaveCount(0);
    const preview=await own(page,'/api/streamer/preview',{key:m.key,winnerId:'victory'});expect(preview.status).toBe(200);expect(preview.body.pool).toBe(1000);expect(preview.body.bets.map((b:{payout:number})=>b.payout).sort((a:number,b:number)=>a-b)).toEqual([0,250,750]);
    const before=await own(users[0],'/api/points/me');expect(before.body.claimable).toBe(0);
    const resolved=await own(page,'/api/streamer/action',{key:m.key,action:'resolve',winnerId:'victory',requestId:randomUUID()});expect(resolved.status).toBe(200);await page.reload();await expect(managed).toContainText('Ganó Gana');await expect(managed.getByRole('button')).toHaveCount(0);
    await users[0].getByRole('link',{name:'Mis apuestas',exact:true}).click();await users[0].reload();const position=users[0].locator(`[data-position-key="${m.key}"]`);await expect(position.getByRole('button',{name:'Cobrar 250 pts',exact:true})).toBeVisible();
    await page.screenshot({path:'test-results/streamer-resolution.png',fullPage:true});
    // One winner is disconnected while the operator credits their stored account.
    await users[1].close();const distributed=await own(page,'/api/streamer/action',{key:m.key,action:'distribute',requestId:randomUUID()});expect(distributed.status).toBe(200);expect(distributed.body.paid).toBe(1000);expect(distributed.body.accounts).toBe(2);
    await users[0].reload();await expect(users[0].locator('#own-balance')).toHaveText('10.150');await expect(position).toContainText('Acreditados 250 pts');await expect(users[0].getByRole('cell',{name:'Reparto del streamer',exact:true})).toBeVisible();
    await users[0].screenshot({path:'test-results/user-settled.png',fullPage:true});
    const returned=await contexts[1].newPage();await returned.goto(users[0].url());await expect(returned.locator('#own-balance')).toHaveText('10.450');
    expect((await own(returned,'/api/points/claim',{key:m.key,requestId:randomUUID()})).status).toBe(400);
    const again=await own(page,'/api/streamer/action',{key:m.key,action:'distribute',requestId:randomUUID()});expect(again.body.paid).toBe(0);
    const refund=await operator(page,'/api/demo',{});await users[0].getByRole('link',{name:'Mercados',exact:true}).click();await users[0].reload();const refundCard=users[0].locator(`[data-key="${refund.key}"]`);await refundCard.getByLabel('Puntos a apostar').fill('200');await refundCard.getByRole('button',{name:'Apostar a Gana',exact:true}).click();await expect(users[0].locator('#own-balance')).toHaveText('9.950');
    await own(page,'/api/streamer/action',{key:refund.key,action:'lock',requestId:randomUUID()});await own(page,'/api/streamer/action',{key:refund.key,action:'cancel',requestId:randomUUID()});await own(page,'/api/streamer/action',{key:refund.key,action:'distribute',requestId:randomUUID()});await page.reload();const refundManaged=page.locator(`[data-streamer-key="${refund.key}"]`);await expect(refundManaged).toContainText('Predicción cancelada');await expect(refundManaged.getByRole('button')).toHaveCount(0);await users[0].reload();await expect(users[0].locator('#own-balance')).toHaveText('10.150');
    await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await users[0].getByRole('link',{name:'Mis apuestas',exact:true}).click();await users[0].setViewportSize({width:390,height:844});await expect(users[0].locator('h1')).toHaveText('Mis apuestas');expect(await users[0].evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await users[0].screenshot({path:'test-results/user-console-mobile.png',fullPage:true});
  }finally{await Promise.all(contexts.map(c=>c.close()));}
});
