import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {Points} from '../src/points.js';
import {TwitchAuth} from '../src/twitch-auth.js';
const config={clientId:'test-client',clientSecret:'server-only-secret',origin:'https://twitch-predict.localhost:1357'};
const identity={id:'12345',login:'streamer_test',displayName:'Streamer Test',linkedAt:new Date().toISOString()};
async function fixture(run:(p:Points,dir:string)=>Promise<void>){const dir=await mkdtemp(`${tmpdir()}/twitch-auth-`);try{const p=new Points(dir);await p.load();await run(p,dir);}finally{await rm(dir,{recursive:true,force:true});}}
function transport(options:{clientId?:string;userId?:string;deny?:boolean}={}){const calls:string[]=[];const request:typeof fetch=async(input,init)=>{const url=String(input);calls.push(url);if(url.endsWith('/token')){assert.equal(new URLSearchParams(init?.body as URLSearchParams).get('client_secret'),config.clientSecret);return options.deny?Response.json({error:'bad-code'},{status:400}):Response.json({access_token:'transient-token',refresh_token:'transient-refresh',token_type:'bearer'});}if(url.endsWith('/validate'))return Response.json({client_id:options.clientId??config.clientId,user_id:'12345',login:'streamer_test',expires_in:3600});if(url.endsWith('/users'))return Response.json({data:[{id:options.userId??'12345',login:'streamer_test',display_name:'Streamer Test'}]});return new Response(null,{status:200});};return {request,calls};}
const state=(url:string)=>new URL(url).searchParams.get('state')!;
test('OAuth binds verified channel to original wallet, persists identity and never stores Twitch tokens',()=>fixture(async(p,dir)=>{
  const a=await p.walletLogin('wallet-a');const t=transport(),auth=new TwitchAuth(p,config,t.request);const start=auth.start(a.token);assert.equal(new URL(start.url).searchParams.get('scope'),'');assert.equal(new URL(start.url).searchParams.get('redirect_uri'),auth.callbackUrl);
  const ticket=await auth.callback(state(start.url),start.cookie,'code');assert.equal(p.me(a.token).twitch,null);await auth.complete(a.token,ticket,start.cookie);
  assert.equal(p.me(a.token).twitch?.id,'12345');assert.deepEqual(p.me(a.token).streamerChannels,['streamer_test']);assert.ok(p.channels().includes('streamer_test'));assert.equal(p.me(a.token).balance,10000);
  const stored=await readFile(`${dir}/points.json`,'utf8');for(const secret of ['transient-token','transient-refresh','server-only-secret'])assert.ok(!stored.includes(secret));assert.ok(t.calls.some(c=>c.endsWith('/revoke')));
  const loaded=new Points(dir);await loaded.load();assert.equal(loaded.me(a.token).twitch?.login,'streamer_test');await assert.rejects(auth.complete(a.token,ticket,start.cookie),/cuenta cambió/);
}));
test('state, browser cookie, expiry, callback replay and wallet switching cannot link accounts',()=>fixture(async p=>{
  const a=await p.walletLogin('wallet-a'),b=await p.walletLogin('wallet-b');let clock=Date.now();const t=transport(),auth=new TwitchAuth(p,config,t.request,()=>clock);const first=auth.start(a.token);
  await assert.rejects(auth.callback('forged',first.cookie,'code'),/venció/);await assert.rejects(auth.callback(state(first.url),'wrong-browser','code'),/venció/);assert.equal(t.calls.length,0);
  const ticket=await auth.callback(state(first.url),first.cookie,'code');await assert.rejects(auth.callback(state(first.url),first.cookie,'code'),/venció/);
  await assert.rejects(auth.complete(b.token,ticket,first.cookie),/cuenta cambió/);await assert.rejects(auth.complete(a.token,ticket,'wrong-browser'),/cuenta cambió/);assert.equal(p.me(b.token).twitch,null);
  await auth.complete(a.token,ticket,first.cookie);const expired=auth.start(a.token);clock+=600001;await assert.rejects(auth.callback(state(expired.url),expired.cookie,'code'),/venció/);
}));
test('provider cancellation, wrong client, conflicting identity and exchange errors never grant ownership',()=>fixture(async p=>{
  const a=await p.walletLogin('wallet-a');for(const options of [{clientId:'different-app'},{userId:'99999'},{deny:true}]){const t=transport(options),auth=new TwitchAuth(p,config,t.request),s=auth.start(a.token);await assert.rejects(auth.callback(state(s.url),s.cookie,'code'));assert.equal(p.me(a.token).twitch,null);if(!options.deny)assert.ok(t.calls.some(c=>c.endsWith('/revoke')));}
  const t=transport(),auth=new TwitchAuth(p,config,t.request),s=auth.start(a.token);await assert.rejects(auth.callback(state(s.url),s.cookie,undefined,true),/Cancelaste/);assert.equal(t.calls.length,0);
  assert.throws(()=>new TwitchAuth(p,{...config,clientSecret:''}).start(a.token),/configurar/);
}));
test('one Twitch identity cannot own two wallets; unlink revokes console permissions and preserves balance/history',()=>fixture(async(p,dir)=>{
  const a=await p.walletLogin('wallet-a'),b=await p.walletLogin('wallet-b');await p.linkTwitch(a.token,identity);await assert.rejects(p.linkTwitch(b.token,identity),/otra wallet/);await assert.rejects(p.assignStreamer('somebody_else','wallet-a'),/Twitch/);
  const raw=JSON.parse(await readFile(`${dir}/points.json`,'utf8'));raw.streamers.unverified={channel:'unverified',wallet:'wallet-b',assignedAt:new Date().toISOString()};await writeFile(`${dir}/points.json`,JSON.stringify(raw));const loaded=new Points(dir);await loaded.load();assert.deepEqual(loaded.me(b.token).streamerChannels,[]);assert.deepEqual(loaded.streamerConsole(b.token).channels,[]);
  await p.unlinkTwitch(a.token);assert.equal(p.me(a.token).twitch,null);assert.deepEqual(p.streamerConsole(a.token).channels,[]);assert.equal(p.me(a.token).balance,10000);await p.linkTwitch(b.token,identity);assert.equal(p.me(b.token).twitch?.id,'12345');
}));
