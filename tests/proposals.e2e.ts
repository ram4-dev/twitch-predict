import {test,expect,type APIRequestContext,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {phantomProvider} from './fixtures/phantom.js';

// Plan 2 E2E — real mounted server (session launcher, port 1362): real Twitch-first login (fixture OAuth),
// real proposals router, real Points aggregate. Success is a functional happy path, never the unmounted 401.

/** Twitch-first login via the fixture OAuth server; returns the bearer session token. */
async function loginTwitch(request:APIRequestContext):Promise<string>{
  const start=await request.post('/api/twitch/start',{data:{}});
  expect(start.ok()).toBeTruthy();
  const {url}=await start.json();
  const state=new URL(url).searchParams.get('state')!;
  const setCookie=start.headersArray().filter(h=>h.name.toLowerCase()==='set-cookie').map(h=>h.value.split(';')[0]);
  const cookie=setCookie.find(c=>c.startsWith('twitch_link'))??setCookie[0];
  // Fixture callback: the server preload intercepts Twitch token/user endpoints.
  const cb=await request.get(`/auth/twitch/callback?state=${state}&code=e2e-code-fixture`,{headers:{cookie},maxRedirects:0});
  // The callback answers 302 with the ticket in the location — a redirect IS success here.
  expect([200,302]).toContain(cb.status());
  const location=cb.headersArray().find(h=>h.name.toLowerCase()==='location')?.value??'';
  const ticket=new URLSearchParams(new URL(location,'http://x').search).get('twitch_ticket')!;
  if(!ticket)console.log('LOGIN_TICKET_MISSING',cb.status(),location);
  expect(ticket).toMatch(/^[a-f0-9]{64}$/);
  const complete=await request.post('/api/twitch/complete',{data:{ticket}});
  expect(complete.ok()).toBeTruthy();
  const {token}=await complete.json();
  expect(token).toBeTruthy();
  return token as string;
}

/** Owner: Twitch-first login, then wallet link on the SAME session, then re-link Twitch so the streamer row registers. */
async function ownerWithWalletAndChannel(page:Page,request:APIRequestContext):Promise<{token:string;channelLogin:string}>{
  const token=await loginTwitch(request);
  await page.goto('/');
  await page.evaluate(t=>localStorage.setItem('pointsToken',t),token);
  await phantomProvider(page);
  await page.goto('/onboarding');
  await page.getByRole('button',{name:/Entrar con Phantom|Conectar Phantom/}).click();
  await page.waitForURL('**/app#markets');
  const linked=await loginTwitchLinked(request,token);
  return {token,channelLogin:linked.login};
}

test('anonymous submit is explicitly rejected (real mounted router, not the bridge 401)',async({request})=>{
  const response=await request.post('/api/proposals/channels/fixture_streamer',
    {data:{title:'¿Gana el equipo rojo?',options:['Sí','No'],intentId:'e2e-anon-000001'}});
  expect(response.status()).toBe(403);
  const body=await response.json();
  expect(String(body.error)).toMatch(/Iniciá sesión/i);
});

/** Twitch link completion bound to an existing session. */
async function loginTwitchLinked(request:APIRequestContext,sessionToken:string):Promise<{login:string}>{
  const start=await request.post('/api/twitch/start',{data:{},headers:{authorization:`Bearer ${sessionToken}`}});
  expect(start.ok()).toBeTruthy();
  const {url}=await start.json();
  const state=new URL(url).searchParams.get('state')!;
  const setCookie=start.headersArray().filter(h=>h.name.toLowerCase()==='set-cookie').map(h=>h.value.split(';')[0]);
  const cookie=setCookie.find(c=>c.startsWith('twitch_link'))??setCookie[0];
  const cb=await request.get(`/auth/twitch/callback?state=${state}&code=e2e-code-fixture`,{headers:{cookie},maxRedirects:0});
  expect([200,302]).toContain(cb.status());
  const location=cb.headersArray().find(h=>h.name.toLowerCase()==='location')?.value??'';
  const ticket=new URLSearchParams(new URL(location,'http://x').search).get('twitch_ticket')!;
  const complete=await request.post('/api/twitch/complete',{data:{ticket},headers:{authorization:`Bearer ${sessionToken}`}});
  if(!complete.ok())console.log('LINKED_COMPLETE',complete.status(),await complete.text());
  expect(complete.ok()).toBeTruthy();
  const body=await complete.json();
  return {login:body.twitch?.login??'fixture_streamer'};
}
test('full flow: viewer proposes, owner accepts -> one published market; withdraw and permission guards hold',async({page,request})=>{
  // Owner: wallet + Twitch link registers the channel.
  const {token:ownerToken,channelLogin}=await ownerWithWalletAndChannel(page,request);
  const ownerMe=await (await request.get('/api/points/me',{headers:{authorization:`Bearer ${ownerToken}`}})).json();
  const channelId=ownerMe.twitch.id;
  expect(channelId).toBeTruthy();
  // Second browser identity: the viewer (Twitch-first, no wallet) via a distinct fixture identity.
  const {writeFile}=await import('node:fs/promises');const {resolve:res2}=await import('node:path');
  await writeFile(res2('.e2e-fixtures/twitch-oauth.json'),JSON.stringify({id:'67890',login:'fixture_viewer',display_name:'Fixture Viewer'}));
  console.log('OAUTH_FILE_BEFORE_VIEWER',await readFile(res2('.e2e-fixtures/twitch-oauth.json'),'utf8'));
  const viewerToken=await loginTwitch(request);
  await writeFile(res2('.e2e-fixtures/twitch-oauth.json'),JSON.stringify({id:'12345',login:'fixture_streamer',display_name:'Fixture Streamer'}));
  const viewerMe=await (await request.get('/api/points/me',{headers:{authorization:`Bearer ${viewerToken}`}})).json();
  expect(viewerMe.twitch.id).not.toBe(channelId);

  // 1) Viewer submits a proposal from the app API.
  const submit=await request.post(`/api/proposals/channels/${channelLogin}`,
    {data:{title:'¿Gana el equipo rojo?',options:['Sí','No'],intentId:'e2e-viewer-proposal-01'},headers:{authorization:`Bearer ${viewerToken}`}});
  if(submit.status()!==201)console.log('SUBMIT_FAILED',submit.status(),await submit.text());
  expect(submit.status()).toBe(201);
  const proposal=await submit.json();
  expect(proposal.status).toBe('pending');
  expect(proposal.shortId).toMatch(/^P/);

  // 2) The owner sees it in the private inbox; the viewer cannot see others' submissions there.
  const inboxOwner=await (await request.get(`/api/proposals/channels/${channelLogin}`,{headers:{authorization:`Bearer ${ownerToken}`}})).json();
  expect(inboxOwner.isOwner).toBe(true);
  expect(inboxOwner.proposals.some((p:{id:string})=>p.id===proposal.id)).toBe(true);
  const inboxViewer=await (await request.get(`/api/proposals/channels/${channelLogin}`,{headers:{authorization:`Bearer ${viewerToken}`}})).json();
  expect(inboxViewer.isOwner).toBe(false);
  expect(inboxViewer.proposals.every((p:{authorAccountId:string})=>p.authorAccountId===viewerMe.id)).toBe(true);

  // 3) The viewer cannot accept (server-side permission, not UI).
  const forbidden=await request.post(`/api/proposals/${proposal.id}/accept`,
    {data:{intentId:'e2e-viewer-accept-01'},headers:{authorization:`Bearer ${viewerToken}`}});
  expect(forbidden.status()).toBe(403);

  // 4) One click in the real inbox accepts and publishes; there is no confirmation dialog.
  await page.goto('/app#markets');await page.getByRole('button',{name:'Propuestas',exact:true}).click();
  const card=page.locator(`[data-proposal-id="${proposal.id}"]`);await expect(card).toBeVisible();
  let acceptWrites=0;page.on('request',r=>{if(r.method()==='POST'&&new URL(r.url()).pathname===`/api/proposals/${proposal.id}/accept`)acceptWrites++;});
  await card.getByRole('button',{name:'Aceptar y publicar',exact:true}).click();
  await expect(card.locator('[data-proposal-status]')).toHaveAttribute('data-proposal-status','accepted');
  await expect(card.getByRole('button',{name:'Aceptar y publicar',exact:true})).toHaveCount(0);await expect(page.getByRole('dialog')).toHaveCount(0);expect(acceptWrites).toBe(1);
  // An API replay returns the same published market receipt.
  const accept=await request.post(`/api/proposals/${proposal.id}/accept`,
    {data:{intentId:'e2e-owner-accept-01'},headers:{authorization:`Bearer ${ownerToken}`}});
  expect(accept.ok()).toBeTruthy();
  const accepted=await accept.json();
  expect(accepted.status).toBe('accepted');
  expect(accepted.acceptedMarketKey).toMatch(/^plot:/);

  // 5) Double accept replays the same receipt: no second market.
  const replay=await request.post(`/api/proposals/${proposal.id}/accept`,
    {data:{intentId:'e2e-owner-accept-02'},headers:{authorization:`Bearer ${ownerToken}`}});
  expect(replay.ok()).toBeTruthy();
  expect((await replay.json()).acceptedMarketId).toBe(accepted.acceptedMarketId);

  // 6) A second proposal withdrawn by its author leaves no market.
  const second=await (await request.post(`/api/proposals/channels/${channelLogin}`,
    {data:{title:'¿Sale el clip del mes?',options:['Sí','No'],intentId:'e2e-viewer-proposal-02'},headers:{authorization:`Bearer ${viewerToken}`}})).json();
  const withdraw=await request.post(`/api/proposals/${second.id}/withdraw`,
    {data:{intentId:'e2e-viewer-withdraw-01'},headers:{authorization:`Bearer ${viewerToken}`}});
  expect(withdraw.ok()).toBeTruthy();
  expect((await withdraw.json()).status).toBe('withdrawn');
  const afterWithdraw=await (await request.get('/api/proposals/channels/'+channelLogin,{headers:{authorization:`Bearer ${ownerToken}`}})).json();
  const withdrawn=afterWithdraw.proposals.find((p:{id:string})=>p.id===second.id);
  expect(withdrawn.status).toBe('withdrawn');

  // 7) Reject with reason; the author sees it via /api/proposals/me.
  const third=await (await request.post(`/api/proposals/channels/${channelLogin}`,
    {data:{title:'¿Cae el récord?',options:['Sí','No'],intentId:'e2e-viewer-proposal-03'},headers:{authorization:`Bearer ${viewerToken}`}})).json();
  const reject=await request.post(`/api/proposals/${third.id}/reject`,
    {data:{intentId:'e2e-owner-reject-01',reason:'Fuera de tema del canal'},headers:{authorization:`Bearer ${ownerToken}`}});
  expect(reject.ok()).toBeTruthy();
  const mine=await (await request.get('/api/proposals/me',{headers:{authorization:`Bearer ${viewerToken}`}})).json();
  const rejected=mine.proposals.find((p:{id:string})=>p.id===third.id);
  expect(rejected.status).toBe('rejected');
  expect(rejected.rejectionReason).toBe('Fuera de tema del canal');
});
