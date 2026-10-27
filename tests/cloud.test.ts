import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,generateKeyPairSync,sign} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {AddressInfo} from 'node:net';
import {getBase58Decoder} from '@solana/kit';
import {Documents} from '../src/cloud/documents.js';
import {CloudTwitchAuth} from '../src/cloud/twitch-auth.js';
import {CloudAuth} from '../src/cloud/auth.js';
import {cloudApp} from '../src/cloud/app.js';
import {Points} from '../src/points.js';
import {ByteService} from '../src/byte.js';
import {BYTE_PROGRAM} from '../src/byte-model.js';
const database=process.env.PLOT_STAGING_DATABASE_URL;
async function fixture(work:(docs:Documents)=>Promise<void>){
 const docs=new Documents(database!,`test-${randomUUID()}`);await docs.migrate();
 try{await work(docs);}finally{for(const table of ['documents','leases','request_limits'])await docs.pool.query(`DELETE FROM plot_private.${table} WHERE namespace=$1`,[docs.namespace]);await docs.close();}
}
const options={skip:!database};
test('PostgreSQL serializes mutations from separate processes and rolls back nested aggregates',options,()=>fixture(async docs=>{
 const code=`import {Documents} from './src/cloud/documents.ts';const d=new Documents(process.env.PLOT_STAGING_DATABASE_URL,process.env.TEST_NAMESPACE);for(let i=0;i<15;i++)await d.update('counter',()=>({n:0}),s=>{s.n++});await d.close();`;
 await Promise.all(Array.from({length:3},()=>promisify(execFile)(process.execPath,['--import','tsx','--input-type=module','-e',code],{env:{...process.env,TEST_NAMESPACE:docs.namespace}})));
 assert.equal((await docs.read('counter',()=>({n:0}))).n,45);
 await assert.rejects(docs.update('outer',()=>({n:0}),async s=>{s.n++;await docs.update('counter',()=>({n:0}),s=>s.n++);throw new Error('rollback');}));
 assert.equal((await docs.read('counter',()=>({n:0}))).n,45);
}));
test('PostgreSQL consumes wallet nonce once across instances, persists distinct sessions and rate limits',options,()=>fixture(async docs=>{
 const points=new Points('',docs);await points.load();const a=new CloudAuth(points,docs),b=new CloudAuth(new Points('',docs),docs);
 const keys=generateKeyPairSync('ed25519'),wallet=getBase58Decoder().decode(keys.publicKey.export({format:'der',type:'spki'}).subarray(-32));
 const challenge=await a.challenge(wallet,'https://plot.example'),signature=sign(null,Buffer.from(challenge.message),keys.privateKey).toString('base64');
 const results=await Promise.allSettled([a.authenticate(challenge.challengeId,signature,'https://plot.example'),b.authenticate(challenge.challengeId,signature,'https://plot.example')]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const restored=new Points('',docs);await restored.load();const second=await restored.walletLogin(wallet);await points.load();assert.equal(points.me(second.token).wallet,wallet);
 assert.equal(await docs.allowRequest('test',1),true);assert.equal(await docs.allowRequest('test',1),false);
}));
test('PostgreSQL fences expired workers and prevents duplicate Byte creation across instances',options,()=>fixture(async docs=>{
 assert.equal(await docs.lease('twitch-worker','old',30),true);assert.equal(await docs.lease('twitch-worker','new',30),false);
 await docs.pool.query("UPDATE plot_private.leases SET expires_at=now()-interval '1 second' WHERE namespace=$1",[docs.namespace]);
 assert.equal(await docs.lease('twitch-worker','new',30),true);
 await assert.rejects(docs.withLease('twitch-worker','old',()=>docs.update('counter',()=>({n:0}),s=>s.n++)),/lease lost/);
 let posts=0;const m={id:'pm_fixture',title:'Test market',options:['Yes','No'],currency:'sol',status:'open',bettable:true,resolvable:false,openMs:Date.now(),closeMs:Date.now()+60000,chain:{market:'11111111111111111111111111111111',settled:false},pools:[0,0],total:0,bettors:0,winner:null,invalidReason:null};
 const transport:typeof fetch=async(url,init)=>{if(String(url).endsWith('/api/bets/open'))return Response.json({enabled:true,sol:{cluster:'devnet',programId:BYTE_PROGRAM,maxBet:100000000,maxPool:2000000000}});if(init?.method==='POST'){posts++;await new Promise(r=>setTimeout(r,100));}return Response.json({market:m});};
 const a=new ByteService('','fixture-key',undefined,transport,docs),b=new ByteService('','fixture-key',undefined,transport,docs);await Promise.all([a.load(),b.load()]);
 const input={title:m.title,options:m.options,currency:'sol',windowSecs:60,channel:'fixture',rules:'Result from test fixture',requestId:randomUUID()};
 const results=await Promise.allSettled([a.create(input),b.create(input)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(posts,1);assert.equal((await b.create(input)).id,m.id);assert.equal(posts,1);
}));
test('cloud HTTP rejects local operator fallback, global bridge and foreign origins; canonical SIWS ignores host headers',options,()=>fixture(async docs=>{
 const env={AUTH_ORIGIN:'https://plot.example',DATABASE_URL:database,PLOT_NAMESPACE:docs.namespace};const server=cloudApp(docs,env).listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
 try{
  assert.equal((await fetch(base+'/api/health').then(r=>r.json())).service,'plot-mobile');
  assert.equal((await fetch(base+'/api/pair')).status,404);
  assert.equal((await fetch(base+'/api/byte/markets',{method:'POST',headers:{'content-type':'application/json','sec-fetch-site':'same-origin','x-operator-token':''},body:'{}'})).status,403);
  assert.equal((await fetch(base+'/api/byte/status',{headers:{origin:'https://evil.example'}})).status,403);
  const status=await fetch(base+'/api/byte/status').then(r=>r.json());assert.equal(status.operatorMode,'wallet');assert.equal(status.manualOperations,false);
  const r=await fetch(base+'/api/auth/challenge',{method:'POST',headers:{'content-type':'application/json','x-forwarded-host':'evil.example'},body:JSON.stringify({address:'11111111111111111111111111111111'})}).then(r=>r.json());assert.ok(r.message.startsWith('plot.example wants'));assert.ok(r.message.includes('URI: https://plot.example'));
 }finally{await new Promise<void>(r=>server.close(()=>r()));}
}));

test('durable OAuth consumes callbacks across instances before network I/O and links once',options,()=>fixture(async docs=>{
 const points=new Points('',docs);await points.load();const login=await points.walletLogin('sql-oauth-wallet');let exchanges=0;
 const config={clientId:'fixture-client',clientSecret:'fixture-server-secret',origin:'https://plot.example'};
 const request:typeof fetch=async url=>{
  if(String(url).endsWith('/token')){
   exchanges++;await docs.update('twitch-auth',()=>({flows:{},pending:{}}),()=>undefined);
   return Response.json({access_token:'ephemeral-token',token_type:'bearer'});
  }
  if(String(url).endsWith('/validate'))return Response.json({client_id:config.clientId,user_id:'12345',login:'sql_fixture',expires_in:3600});
  if(String(url).endsWith('/users'))return Response.json({data:[{id:'12345',login:'sql_fixture',display_name:'SQL Fixture'}]});
  return new Response(null,{status:200});
 };
 const a=new CloudTwitchAuth(points,docs,config,request),b=new CloudTwitchAuth(points,docs,config,request),start=await a.start(login.token),state=new URL(start.url).searchParams.get('state')!;
 const callbacks=await Promise.allSettled([a.callback(state,start.cookie,'code'),b.callback(state,start.cookie,'code')]);assert.equal(exchanges,1);
 const success=callbacks.find(r=>r.status==='fulfilled');assert.ok(success&&success.status==='fulfilled');
 const ticket=success.value;await b.complete(login.token,ticket,start.cookie);await assert.rejects(a.complete(login.token,ticket,start.cookie));
 await points.load();assert.equal(points.me(login.token).twitch?.login,'sql_fixture');
 const saved=JSON.stringify(await docs.read('twitch-auth',()=>({})));assert.ok(!saved.includes('ephemeral-token'));assert.ok(!saved.includes(config.clientSecret));
}));

test('authenticated viewers enqueue channels outside the seed list once, without operator privileges',options,()=>fixture(async docs=>{
 const points=new Points('',docs);await points.load();const login=await points.walletLogin('11111111111111111111111111111111');
 const env={AUTH_ORIGIN:'https://plot.example',DATABASE_URL:database,PLOT_NAMESPACE:docs.namespace,PLOT_CHANNELS:'seed_only'};
 const originalFetch=globalThis.fetch;globalThis.fetch=async(input,init)=>String(input)==='https://gql.twitch.tv/gql'?Response.json({data:{user:JSON.parse(String(init?.body)).variables.channel==='missing_streamer'?null:{id:'123'},channel:{activePredictionEvents:[]}}}):originalFetch(input,init);
 const server=cloudApp(docs,env).listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
 const watch=(channel:string,token=login.token)=>fetch(base+'/api/byte/twitch/watch',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({channel})});
 try{
  assert.equal((await watch('new_streamer','invalid-session')).status,400);
  assert.equal((await watch('https://evil.example')).status,400);
  assert.equal((await watch('missing_streamer')).status,400);
  const results=await Promise.all([watch('NEW_STREAMER'),watch('new_streamer')]);
  for(const response of results){assert.equal(response.status,200);assert.equal((await response.json()).channel,'new_streamer');}
  const state=await docs.read('byte-twitch',()=>({channels:[] as string[]}));assert.deepEqual(state.channels,['new_streamer']);
  assert.equal((await fetch(base+'/api/byte/markets',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${login.token}`},body:'{}'})).status,403);
 }finally{globalThis.fetch=originalFetch;await new Promise<void>(r=>server.close(()=>r()));}
}));
