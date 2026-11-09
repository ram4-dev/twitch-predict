import {test,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHmac,randomUUID} from 'node:crypto';
import {phantomProvider} from './fixtures/phantom.js';

test('streamer creates a Plot prediction in chat; viewer stakes on the public page, streamer resolves, viewer claims',async({page,context,browser})=>{
 const login=`plot_${randomUUID().replaceAll('-','').slice(0,8)}`,ownerId=String(Date.now());
 const owner={id:ownerId,login,display_name:'Plot streamer',scopes:['channel:bot']};
 await writeFile(resolve('test-results/twitch-oauth.json'),JSON.stringify(owner));await phantomProvider(page);
 await page.route('https://id.twitch.tv/oauth2/authorize?**',async route=>{
  const url=new URL(route.request().url()),callback=new URL(url.searchParams.get('redirect_uri')!);callback.searchParams.set('state',url.searchParams.get('state')!);callback.searchParams.set('code','e2e-code');
  await route.fulfill({contentType:'text/html',body:`<a href="${callback.href}">Autorizar canal</a>`});
 });
 await page.goto('/onboarding?streamer=1');await page.getByRole('button',{name:'Conectar Phantom'}).click();
 await page.getByRole('button',{name:'Conectar Twitch'}).click();await page.getByRole('link',{name:'Autorizar canal'}).click();await expect(page.getByText(`@${login}`)).toBeVisible();
 const token=await page.evaluate(()=>localStorage.getItem('pointsToken')!),origin=new URL(page.url()).origin;
 const authorize=async(path:string,identity:unknown)=>{
  await writeFile(resolve('test-results/twitch-oauth.json'),JSON.stringify(identity));
  const start=await context.request.post(path,{headers:{origin,Authorization:`Bearer ${token}`},data:{}});expect(start.ok()).toBe(true);
  const url=new URL((await start.json()).url),callback=new URL(url.searchParams.get('redirect_uri')!);callback.searchParams.set('state',url.searchParams.get('state')!);callback.searchParams.set('code','e2e-code');
  const response=await context.request.get(callback.href,{maxRedirects:0});expect(response.status()).toBe(302);return new URL(response.headers().location,origin);
 };
 await authorize('/api/twitch/bot/account/start',{id:'42',login:'plotfun',display_name:'Plot',scopes:['user:bot','user:read:chat','user:write:chat']});
 const completion=await authorize('/api/twitch/bot/start',owner);
 const linked=await context.request.post('/api/twitch/bot/complete',{headers:{Authorization:`Bearer ${token}`},data:{ticket:completion.searchParams.get('bot_ticket')}});expect(linked.ok()).toBe(true);
 const send=async(text:string,actor=ownerId,id:string=randomUUID())=>{
  const raw=JSON.stringify({subscription:{type:'channel.chat.message',condition:{user_id:'42'}},event:{broadcaster_user_id:ownerId,chatter_user_id:actor,message:{text}}});
  const stamp=new Date().toISOString(),secret=createHmac('sha256','e2e-only-secret').update('plot-eventsub-webhook-v1').digest('hex');
  const response=await context.request.post('/api/twitch/bot/webhook',{headers:{'content-type':'application/json','twitch-eventsub-message-id':id,'twitch-eventsub-message-timestamp':stamp,'twitch-eventsub-message-type':'notification','twitch-eventsub-message-signature':'sha256='+createHmac('sha256',secret).update(id+stamp).update(raw).digest('hex')},data:raw});
  expect(response.status()).toBe(204);
 };
 await send('!plot crear ¿Ganamos la partida?, Sí, No',ownerId,'native-create');await send('!plot crear ¿Ganamos la partida?, Sí, No',ownerId,'native-create');
 const markets=await (await context.request.get('/api/markets')).json();const native=markets.filter((m:{source?:string;prediction:{channel:string}})=>m.source==='plot'&&m.prediction.channel===login);expect(native).toHaveLength(1);expect(native[0].demo).toBe(false);
 const viewerContext=await browser.newContext({baseURL:origin});
 try{
  const viewer=await viewerContext.newPage();await phantomProvider(viewer);await viewer.goto('/onboarding');await viewer.getByRole('button',{name:'Conectar Phantom',exact:true}).click();await viewer.waitForURL('**/app#markets');
  await viewer.goto(`/s/twitch/${login}`);await expect(viewer.getByText('¿Ganamos la partida?',{exact:true})).toBeVisible();
  for(const width of [360,700]){await viewer.setViewportSize({width,height:600});expect(await viewer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
  await expect(viewer.getByText('Puntos internos de Plot · sin dinero real',{exact:true})).toBeVisible();
  await viewer.getByRole('button',{name:'Apostar a Sí',exact:true}).click();const dialog=viewer.getByRole('dialog');await expect(dialog).toBeVisible();
  await viewer.getByLabel('Puntos a apostar',{exact:true}).fill('100');await dialog.getByRole('button',{name:'Confirmar apuesta',exact:false}).click();await expect(dialog).not.toBeVisible();
  const afterBet=await viewer.evaluate(async()=>{const r=await fetch('/api/points/me',{headers:{Authorization:`Bearer ${localStorage.getItem('pointsToken')}`}});return r.json();});expect(afterBet.balance).toBe(9900);
  await send('!plot cerrar','not-the-owner','unauthorized-close');expect((await (await context.request.get('/api/markets')).json()).find((m:{key:string})=>m.key===native[0].key).canBet).toBe(true);
  await send('!plot cerrar');await send('!plot resolver 1');
  await viewer.reload();await expect(viewer.getByText('¿Ganamos la partida?',{exact:true})).toBeVisible();
  const claim=await viewer.evaluate(async key=>{const r=await fetch('/api/points/claim',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${localStorage.getItem('pointsToken')}`},body:JSON.stringify({key,requestId:crypto.randomUUID()})});return {status:r.status,body:await r.json()};},native[0].key);
  expect(claim.status).toBe(200);expect(claim.body.paid).toBe(100);expect(claim.body.balance).toBe(10000);
 }finally{await viewerContext.close();}
});
