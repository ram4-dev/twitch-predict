import {test,expect} from '@playwright/test';
import {writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHmac,randomUUID} from 'node:crypto';
import {phantomProvider} from './fixtures/phantom.js';

test('viewer chat proposal appears in the open streamer inbox and bot delivers help, confirmation and permission replies',async({page,context})=>{
 const login=`plot_${randomUUID().replaceAll('-','').slice(0,8)}`,ownerId=String(Date.now());
 const owner={id:ownerId,login,display_name:'Plot streamer',scopes:['channel:bot','moderation:read']};
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

 // Keep the owner inbox open before the viewer's command arrives.
 await page.goto('/app#markets');
 await page.getByRole('button',{name:'Propuestas',exact:true}).click();
 await expect(page.getByText('Todavía no hay propuestas para este canal.')).toBeVisible();
 const viewerId=String(Number(ownerId)+1);
 await writeFile(resolve('test-results/twitch-oauth.json'),JSON.stringify({id:viewerId,login:`viewer_${login}`,display_name:'Viewer'}));
 const start=await context.request.post('/api/twitch/start',{data:{}});expect(start.ok()).toBe(true);
 const authUrl=new URL((await start.json()).url),callback=new URL(authUrl.searchParams.get('redirect_uri')!);
 callback.searchParams.set('state',authUrl.searchParams.get('state')!);callback.searchParams.set('code','e2e-code');
 const cb=await context.request.get(callback.href,{maxRedirects:0});expect(cb.status()).toBe(302);
 const ticket=new URL(cb.headers().location,origin).searchParams.get('twitch_ticket');
 const complete=await context.request.post('/api/twitch/complete',{data:{ticket}});expect(complete.ok()).toBe(true);
 const viewerToken=(await complete.json()).token;
 const eventId=randomUUID();
 await send('!plot ayuda',viewerId);
 await send('!plot crear ¿Viewer propone desde Twitch?, Sí, No',viewerId,eventId);
 await send('!plot crear ¿Viewer propone desde Twitch?, Sí, No',viewerId,eventId);
 await send('!plot cerrar',viewerId);
 const inbox=page.getByRole('region',{name:'Bandeja de propuestas'});
 await expect(inbox.getByText('¿Viewer propone desde Twitch?',{exact:true})).toBeVisible({timeout:12000});
 await expect(inbox.locator('[data-proposal-id]')).toHaveCount(1);
 const marketCount=async()=>((await (await context.request.get('/api/markets')).json()) as {prediction:{channel:string}}[]).filter(m=>m.prediction.channel===login).length;
 expect(await marketCount()).toBe(0);
 const mine=await (await context.request.get('/api/proposals/me',{headers:{Authorization:`Bearer ${viewerToken}`}})).json();
 expect(mine.proposals).toHaveLength(1);expect(mine.proposals[0].status).toBe('pending');expect(mine.proposals[0].origin).toBe('chat');
 // Exercise real outbox delivery through the isolated Twitch API fixture, not live Twitch chat.
 await expect.poll(async()=>{
  let lines='';try{lines=await readFile(resolve('.e2e-fixtures/chat-messages.jsonl'),'utf8');}catch{/* first worker tick */}
  return lines.split('\n').filter(Boolean).map(line=>JSON.parse(line)).filter(m=>m.broadcaster_id===ownerId).map(m=>m.message).join('\n');
 },{timeout:35000,intervals:[1000]}).toMatch(/Crear o proponer:[\s\S]*Propuesta .* pendiente de aprobación[\s\S]*No tenés permisos/);
 for(const width of [700,360]){await page.setViewportSize({width,height:600});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 await inbox.getByRole('button',{name:'Aceptar y publicar'}).click();
 await expect(inbox.getByText('Propuesta aceptada y mercado publicado.')).toBeVisible();
 expect(await marketCount()).toBe(1);
 const replay=await context.request.post(`/api/proposals/${mine.proposals[0].id}/accept`,{headers:{Authorization:`Bearer ${token}`},data:{intentId:randomUUID()}});
 expect(replay.ok()).toBe(true);expect(await marketCount()).toBe(1);
});
