import {test,expect,type APIRequestContext} from '@playwright/test';
import {createHmac} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {phantomProvider} from './fixtures/phantom.js';

// Plan 2 E2E — authoritative moderator evidence over the REAL HTTP surface: signed EventSub webhook,
// real Get Moderators fixture mode file, real points aggregate. No manual function injection.
// Observable state: plot markets via /api/markets (source 'plot', channel fixture_streamer).

const secret='e2e-only-secret';
let evtSeq=0;
/** Signs and posts one EventSub chat notification to the real webhook endpoint. */
async function sendChat(request:APIRequestContext,channelId:string,chatterId:string,text:string){
  const raw=Buffer.from(JSON.stringify({subscription:{type:'channel.chat.message',condition:{user_id:'42'}},event:{broadcaster_user_id:channelId,chatter_user_id:chatterId,message:{text}}}));
  const id=`evt-${Date.now()}-${++evtSeq}`,stamp=new Date().toISOString();
  const derived=createHmac('sha256',secret).update('plot-eventsub-webhook-v1').digest('hex');
  const sig='sha256='+createHmac('sha256',derived).update(id+stamp).update(raw).digest('hex');
  return request.post('/api/twitch/bot/webhook',{headers:{'content-type':'application/json','twitch-eventsub-message-id':id,'twitch-eventsub-message-timestamp':stamp,'twitch-eventsub-message-type':'notification','twitch-eventsub-message-signature':sig},'data':raw});
}

const plotMarkets=async(request:APIRequestContext)=>await (await request.get('/api/markets')).json() as {key:string;source?:string;prediction:{title:string}}[];

const modeFile='.e2e-fixtures/moderators-mode';
const setMode=(mode:string)=>writeFile(modeFile,mode);
const oauthFile='.e2e-fixtures/twitch-oauth.json';
const setOauth=(user:unknown)=>writeFile(oauthFile,JSON.stringify(user));

test('moderator evidence over real HTTP: positive cache publishes, revocation/outage denies',async({request})=>{
  test.setTimeout(120_000);
  // 1) Bot account authorization through the real endpoints (plotfun with full bot scopes).
  await setOauth({id:'42',login:'plotfun',display_name:'Plot Bot',scopes:['user:bot','user:read:chat','user:write:chat']});
  const origin='http://twitch-predict.localhost:14622';
  const botStart=await request.post('/api/twitch/bot/account/start',{data:{},headers:{origin}});
  expect(botStart.ok()).toBeTruthy();
  const {url}=await botStart.json();
  const state=new URL(url).searchParams.get('state')!;
  const setCookie=botStart.headersArray().filter(h=>h.name.toLowerCase()==='set-cookie').map(h=>h.value.split(';')[0]);
  const cookie=setCookie.find(c=>c.startsWith('twitch_bot'))??setCookie[0];
  const cb=await request.get(`/auth/twitch/bot/callback?state=${state}&code=e2e-code`,{headers:{cookie},maxRedirects:0});
  expect([200,302]).toContain(cb.status());

  // 2) Owner channel registration: Twitch link (owner identity fixture) + bot channel authorization.
  await setOauth({id:'12345',login:'fixture_streamer',display_name:'Fixture Streamer',scopes:['channel:bot','moderation:read']});
  const linkStart=await request.post('/api/twitch/start',{data:{}});
  expect(linkStart.ok()).toBeTruthy();
  const linkUrl=await (await linkStart.json()).url as string;
  const linkState=new URL(linkUrl).searchParams.get('state')!;
  const linkCookies=linkStart.headersArray().filter(h=>h.name.toLowerCase()==='set-cookie').map(h=>h.value.split(';')[0]);
  const linkCookie=linkCookies.find(c=>c.startsWith('twitch_link'))??linkCookies[0];
  const linkCb=await request.get(`/auth/twitch/callback?state=${linkState}&code=e2e-code`,{headers:{cookie:linkCookie},maxRedirects:0});
  expect([200,302]).toContain(linkCb.status());
  const linkLocation=linkCb.headersArray().find(h=>h.name.toLowerCase()==='location')?.value??'';
  const ticket=new URLSearchParams(new URL(linkLocation,'http://x').search).get('twitch_ticket')!;
  const complete=await request.post('/api/twitch/complete',{data:{ticket}});
  expect(complete.ok()).toBeTruthy();
  const ownerToken=(await complete.json()).token as string;
  const channelStart=await request.post('/api/twitch/bot/start',{data:{},headers:{origin,authorization:`Bearer ${ownerToken}`}});
  expect(channelStart.ok()).toBeTruthy();
  const channelUrl=await (await channelStart.json()).url as string;
  const channelState=new URL(channelUrl).searchParams.get('state')!;
  const chCookies=channelStart.headersArray().filter(h=>h.name.toLowerCase()==='set-cookie').map(h=>h.value.split(';')[0]);
  const chCookie=chCookies.find(c=>c.startsWith('twitch_bot'))??chCookies[0];
  const chCb=await request.get(`/auth/twitch/bot/callback?state=${channelState}&code=e2e-code`,{headers:{cookie:chCookie},maxRedirects:0});
  expect([200,302]).toContain(chCb.status());
  const chLocation=chCb.headersArray().find(h=>h.name.toLowerCase()==='location')?.value??'';
  const botTicket=new URLSearchParams(new URL(chLocation,'http://x').search).get('bot_ticket')!;
  expect(botTicket).toBeTruthy();
  const botComplete=await request.post('/api/twitch/bot/complete',{data:{ticket:botTicket},headers:{origin,authorization:`Bearer ${ownerToken}`}});
  expect(botComplete.ok()).toBeTruthy();

  // 3) Moderators fixture: chatter 999 is a real moderator of channel 12345.
  await setMode('[999]');
  // 4) The moderator creates via signed chat: isModerator consults the authoritative list (positive fixture)
  // and syncs Points evidence. First command, no cooldown hit.
  const before=await plotMarkets(request);
  const beforeCount=before.filter(m=>m.source==='plot').length;
  await sendChat(request,'12345','999','!plot crear ¿Mod crea?, Sí, No');
  await expect.poll(async()=>{
    const markets=await plotMarkets(request);
    return markets.filter(m=>m.source==='plot').length;
  },{timeout:15_000}).toBe(beforeCount+1);

  // 6) Revocation without any intermediate create: list no longer has 999; wait out the 30 s evidence TTL.
  await setMode('deny');
  await new Promise(r=>setTimeout(r,31_000));
  await sendChat(request,'12345','999','!plot crear ¿Revocado?, Sí, No');
  await new Promise(r=>setTimeout(r,2_000));
  expect((await plotMarkets(request)).filter(m=>m.source==='plot').length).toBe(beforeCount+1);

  // 7) Outage: Twitch unreachable → deny without guessing.
  await setMode('outage');
  await sendChat(request,'12345','999','!plot crear ¿Outage?, Sí, No');
  await new Promise(r=>setTimeout(r,2_000));
  expect((await plotMarkets(request)).filter(m=>m.source==='plot').length).toBe(beforeCount+1);
  await setMode('deny');
});

test('owner publishes over HTTP regardless of evidence age; viewer is always denied',async({playwright,page})=>{
  test.setTimeout(90_000);
  const origin='http://twitch-predict.localhost:14622';
  await setOauth({id:'12345',login:'fixture_streamer',display_name:'Fixture Streamer',scopes:['channel:bot','moderation:read']});
  // Owner with a wallet: Twitch-first login then Phantom link on the SAME session registers the streamer row
  // (channel property evidence) after the wallet-backed re-link.
  const ownerToken=await linkOwner(playwright);
  await page.goto('/');
  await page.evaluate(t=>localStorage.setItem('pointsToken',t),ownerToken);
  await phantomProvider(page);
  await page.goto('/onboarding');
  await page.getByRole('button',{name:/Entrar con Phantom|Conectar Phantom/}).click();
  await page.waitForURL('**/app#markets');
  // Re-link Twitch now that the account has a wallet: registers the streamers row.
  const relinkTicket=await (async()=>{
    const start=await page.request.post('/api/twitch/start',{data:{},headers:{authorization:'Bearer '+ownerToken}});
    const url=await (await start.json()).url as string;
    const state=new URL(url).searchParams.get('state')!;
    const cookies=start.headersArray().filter(h=>h.name.toLowerCase()==='set-cookie').map(h=>h.value.split(';')[0]);
    const cb=await page.request.get(`/auth/twitch/callback?state=${state}&code=e2e-code`,{headers:{cookie:cookies.find(c=>c.startsWith('twitch_link'))??cookies[0]},maxRedirects:0});
    return new URLSearchParams(new URL(cb.headersArray().find(h=>h.name.toLowerCase()==='location')?.value??'','http://x').search).get('twitch_ticket')!;
  })();
  const relink=await page.request.post('/api/twitch/complete',{data:{ticket:relinkTicket},headers:{authorization:'Bearer '+ownerToken}});
  expect(relink.ok()).toBeTruthy();
  await setMode('deny');
  const ownerApi=await playwright.request.newContext();
  const create=await ownerApi.post('/api/streamer/markets',{data:{channelLogin:'fixture_streamer',title:'¿Owner HTTP?, Sí, No',options:['Sí','No'],intentId:`owner-http-${Date.now()}`},headers:{origin,authorization:`Bearer ${ownerToken}`}});
  if(create.status()!==201)console.log('CREATE_OWNER',create.status(),await create.text());
  expect(create.status()).toBe(201);
  const published=await create.json() as {key:string};
  expect(published.key.startsWith('plot:fixture_streamer:')).toBe(true);
  await setOauth({id:'67890',login:'fixture_viewer',display_name:'Fixture Viewer',scopes:['channel:bot','moderation:read']});
  const viewerToken=await linkOwner(playwright);
  await setOauth({id:'12345',login:'fixture_streamer',display_name:'Fixture Streamer',scopes:['channel:bot','moderation:read']});
  const denied=await ownerApi.post('/api/streamer/markets',{data:{channelLogin:'fixture_streamer',title:'¿Viewer HTTP?, Sí, No',options:['Sí','No'],intentId:`viewer-http-${Date.now()}`},headers:{origin,authorization:`Bearer ${viewerToken}`}});
  expect(denied.status()).toBe(403);
  await setMode('deny');
});

/** Twitch-first login with the CURRENT oauth fixture identity; returns the session token. Fresh cookie jar per call. */
async function linkOwner(playwright:{request:{newContext():Promise<APIRequestContext>}}):Promise<string>{
  const request=await playwright.request.newContext();
  const start=await request.post('/api/twitch/start',{data:{}});
  expect(start.ok()).toBeTruthy();
  const url=await (await start.json()).url as string;
  const state=new URL(url).searchParams.get('state')!;
  const cookies=start.headersArray().filter((h: {name:string;value:string})=>h.name.toLowerCase()==='set-cookie').map((h: {value:string})=>h.value.split(';')[0]);
  const cookie=cookies.find((c:string)=>c.startsWith('twitch_link'))??cookies[0];
  const cb=await request.get(`/auth/twitch/callback?state=${state}&code=e2e-code`,{headers:{cookie},maxRedirects:0});
  expect([200,302]).toContain(cb.status());
  const location=cb.headersArray().find(h=>h.name.toLowerCase()==='location')?.value??'';
  const ticket=new URLSearchParams(new URL(location,'http://x').search).get('twitch_ticket')!;
  const complete=await request.post('/api/twitch/complete',{data:{ticket}});
  expect(complete.ok()).toBeTruthy();
  return (await complete.json()).token as string;
}
