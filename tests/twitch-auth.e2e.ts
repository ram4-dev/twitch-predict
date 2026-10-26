import {test,expect,type Page} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {signIn} from './fixtures/phantom.js';
async function identity(){const id=String(Date.now()),login=`streamer_${randomUUID().replaceAll('-','').slice(0,8)}`;const user={id,login,display_name:'Streamer de prueba'};await writeFile(resolve('test-results/twitch-oauth.json'),JSON.stringify(user));return user;}
async function provider(page:Page,login:string){await page.route('https://id.twitch.tv/oauth2/authorize?**',async route=>{const url=new URL(route.request().url()),redirect=url.searchParams.get('redirect_uri')!,state=url.searchParams.get('state')!;expect(url.searchParams.get('response_type')).toBe('code');expect(url.searchParams.get('scope')).toBe('');await route.fulfill({contentType:'text/html',body:`<!doctype html><h1>Conectar Twitch</h1><p>Canal de prueba @${login}</p><a href="${redirect}?state=${state}&code=e2e-code">Autorizar canal</a><a href="${redirect}?state=${state}&error=access_denied">Cancelar</a>`});});}
async function me(page:Page){return page.evaluate(async()=>{const r=await fetch('/api/points/me',{headers:{Authorization:`Bearer ${localStorage.getItem('pointsToken')}`}});return r.json();});}
async function startOAuth(page:Page){const result=await page.evaluate(async()=>{const r=await fetch('/api/twitch/start',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${localStorage.getItem('pointsToken')}`},body:'{}'});if(!r.ok)throw new Error(await r.text());return r.json();});await page.goto(result.url);}
test.skip(process.env.MARKET_MODE==='solana','Offchain Twitch linking');
test('Phantom wallet connects verified Twitch channel through OAuth and can disconnect without losing balance or history',async({page})=>{
  const user=await identity();await signIn(page);const before=await me(page);await provider(page,user.login);await page.getByRole('link',{name:'Streamer',exact:true}).click();await startOAuth(page);
  await expect(page.getByRole('heading',{name:'Conectar Twitch',exact:true})).toBeVisible();await page.getByRole('link',{name:'Autorizar canal',exact:true}).click();await expect(page).toHaveURL(/\/#streamer$/);await expect.poll(async()=>(await me(page)).twitch?.id).toBe(user.id);
  const linked=await me(page);expect(linked.id).toBe(before.id);expect(linked.wallet).toBe(before.wallet);expect(linked.balance).toBe(before.balance);expect(linked.twitch.id).toBe(user.id);expect(linked.streamerChannels).toContain(user.login);expect(new URL(page.url()).search).toBe('');
  await page.reload();await expect.poll(async()=>(await me(page)).twitch?.id).toBe(user.id);
  const disconnected=await page.evaluate(async()=>{const r=await fetch('/api/twitch/disconnect',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${localStorage.getItem('pointsToken')}`},body:'{}'});return r.ok;});expect(disconnected).toBe(true);const after=await me(page);expect(after.twitch).toBeNull();expect(after.balance).toBe(before.balance);expect(after.bets).toEqual(before.bets);
});
test('cancel, forged callback and switching wallets during OAuth cannot grant streamer access',async({page,context})=>{
  const user=await identity();await signIn(page);await provider(page,user.login);await page.getByRole('link',{name:'Streamer',exact:true}).click();await startOAuth(page);await page.getByRole('link',{name:'Cancelar',exact:true}).click();await expect(page.locator('#notice')).toContainText('Cancelaste');expect((await me(page)).twitch).toBeNull();
  await page.goto('/auth/twitch/callback?state=forged&code=e2e-code');await expect(page.locator('#notice')).toContainText('No se pudo completar');expect((await me(page)).twitch).toBeNull();
  await startOAuth(page);await expect(page.getByRole('link',{name:'Autorizar canal',exact:true})).toBeVisible();const other=await context.newPage();await signIn(other);await page.getByRole('link',{name:'Autorizar canal',exact:true}).click();await expect(page.locator('#notice')).toContainText('La cuenta cambió');expect((await me(page)).twitch).toBeNull();await other.close();
});

test('streamer account block stays absent across navigation and refresh',async({page})=>{
  await signIn(page);
  for(const hash of ['markets','streamer','channels','connect']){
    await page.goto(`/#${hash}`);
    await expect(page.locator('#page-title')).toHaveText(hash==='markets'?'Predicciones de la comunidad':hash==='streamer'?'Consola del streamer':'Canales y extensión');
    await expect(page.locator('#account-name')).not.toHaveText('Conectando…');
    await expect(page.locator('#twitch-connection,.twitch-connect')).toHaveCount(0);
    await expect(page.getByText('CUENTA DEL STREAMER',{exact:true})).toHaveCount(0);
    await expect(page.getByRole('button',{name:'Conectar con Twitch',exact:true})).toHaveCount(0);
  }
  await page.reload();
  await expect(page.locator('#account-name')).not.toHaveText('Conectando…');
  await expect(page.locator('#twitch-connection,.twitch-connect')).toHaveCount(0);
});

test('streamer markets follow Twitch lock and winner automatically without betting or settlement controls',async({page})=>{
  const user=await identity();await signIn(page);await provider(page,user.login);await startOAuth(page);await page.getByRole('link',{name:'Autorizar canal',exact:true}).click();await expect.poll(async()=>(await me(page)).twitch?.id).toBe(user.id);
  const prediction={id:randomUUID(),channel:user.login,title:'Resultado automático de Twitch',status:'ACTIVE',createdAt:new Date().toISOString(),predictionWindowSeconds:600,lockedAt:null as string|null,endedAt:null as string|null,winningOutcome:null as {id:string}|null,outcomes:[{id:'yes',title:'Sí',color:'BLUE',totalPoints:100,totalUsers:1},{id:'no',title:'No',color:'PINK',totalPoints:100,totalUsers:1}]};
  const fixture=resolve('test-results/twitch-fixture.json');
  try{
    await writeFile(fixture,JSON.stringify([prediction]));
    const watchStatus=await page.evaluate(async channel=>{const {token}=await(await fetch('/api/pair')).json();const r=await fetch('/api/channels',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({channel})});return r.status;},user.login);expect(watchStatus).toBe(200);
    await page.getByRole('link',{name:'Mercados',exact:true}).click();
    const key=`offchain:${user.login}:${prediction.id}`,card=page.locator(`[data-key="${key}"]`);
    await expect(card).toBeVisible({timeout:15000});await card.getByLabel('Puntos a apostar').fill('100');await card.getByRole('button',{name:'Apostar a Sí',exact:true}).click();await expect(page.locator('#own-balance')).toHaveText('9.900');
    await page.getByRole('link',{name:'Streamer',exact:true}).click();const market=page.locator(`[data-streamer-key="${key}"]`);await expect(market).toContainText('Abierta');
    await expect(page.locator('#streamer').getByRole('button')).toHaveCount(0);await expect(market.locator('input,select,table,details')).toHaveCount(0);
    prediction.status='LOCKED';prediction.lockedAt=new Date().toISOString();await writeFile(fixture,JSON.stringify([prediction]));await expect(market).toContainText('Esperando resultado',{timeout:15000});
    prediction.status='RESOLVED';prediction.endedAt=new Date().toISOString();prediction.winningOutcome={id:'yes'};await writeFile(fixture,JSON.stringify([prediction]));await expect(market).toContainText('Ganó Sí',{timeout:15000});await expect(market).toContainText('Confirmado por Twitch');await expect(market.getByRole('button')).toHaveCount(0);
    await page.reload();await expect(market).toContainText('Ganó Sí');await expect(market.locator('input,select,table,details,button')).toHaveCount(0);
  }finally{await writeFile(fixture,'[]');}
});
