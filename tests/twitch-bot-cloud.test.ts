import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHmac} from 'node:crypto';
import {Documents} from '../src/cloud/documents.js';
import {CloudTwitchBot} from '../src/cloud/twitch-bot.js';
import {Points} from '../src/points.js';
import {cloudApp} from '../src/cloud/app.js';
import type {AddressInfo} from 'node:net';
const database=process.env.PLOT_STAGING_DATABASE_URL;
const options={skip:!database};
const config={clientId:'test-client',clientSecret:'test-secret',origin:'https://plot.example'};
const stateOf=(url:string)=>new URL(url).searchParams.get('state')!;
async function fixture(work:(v:{docs:Documents;bot:CloudTwitchBot;points:Points;token:string;sent:{broadcaster_id:string;message:string}[];setIdentity:(id:string,login:string,scopes:string[])=>void;subscriptions:Record<string,unknown>[];clock:{now:number}})=>Promise<void>){
 const docs=new Documents(database!,`bot-${randomUUID()}`);await docs.migrate();const points=new Points('',docs);await points.load();const a=await points.walletLogin('wallet-a');await points.linkTwitch(a.token,{id:'123',login:'streamer',displayName:'Streamer',linkedAt:new Date().toISOString()});
 let identity={client_id:config.clientId,user_id:'42',login:'plotfun',scopes:['user:read:chat','user:write:chat','user:bot'],expires_in:3600};
 const sent:{broadcaster_id:string;message:string}[]=[],subscriptions:Record<string,unknown>[]=[],clock={now:Date.now()};
 const request:typeof fetch=async(input,init)=>{const url=String(input);if(url.endsWith('/token'))return Response.json({access_token:'fixture-token',expires_in:3600});if(url.endsWith('/validate'))return Response.json(identity);if(url.includes('/eventsub/subscriptions')){
  if(init?.method==='POST'){const sub=JSON.parse(String(init.body));subscriptions.push({...sub,id:String(subscriptions.length+1),status:'enabled'});return Response.json({data:[]},{status:202});}
  if(init?.method==='DELETE'){const id=new URL(url).searchParams.get('id');const index=subscriptions.findIndex(s=>s.id===id);if(index>=0)subscriptions.splice(index,1);return new Response(null,{status:204});}
  return Response.json({data:subscriptions,pagination:{}});
 }if(url.endsWith('/chat/messages')){sent.push(JSON.parse(String(init?.body)));return Response.json({data:[{is_sent:true}]});}throw new Error('Unexpected mock URL');};
 const bot=new CloudTwitchBot(docs,config,request,()=>clock.now);
 try{await work({docs,bot,points,token:a.token,sent,setIdentity:(id,login,scopes)=>{identity={...identity,user_id:id,login,scopes};},subscriptions,clock});}
 finally{for(const table of ['documents','leases','request_limits'])await docs.pool.query(`DELETE FROM plot_private.${table} WHERE namespace=$1`,[docs.namespace]);await docs.close();}
}
async function authorizeBot(bot:CloudTwitchBot){const s=await bot.start('account');await bot.callback(stateOf(s.url),s.cookie,'code');}
function signed(body:unknown,id:string=randomUUID(),now=Date.now()){
 const raw=Buffer.from(JSON.stringify(body)),stamp=new Date(now).toISOString(),secret=createHmac('sha256',config.clientSecret).update('plot-eventsub-webhook-v1').digest('hex');
 return {raw,headers:{'twitch-eventsub-message-id':id,'twitch-eventsub-message-timestamp':stamp,'twitch-eventsub-message-type':'notification','twitch-eventsub-message-signature':'sha256='+createHmac('sha256',secret).update(id+stamp).update(raw).digest('hex')}};
}
test('durable OAuth binds each channel grant to its wallet, browser and linked identity',options,()=>fixture(async({bot,points,token,setIdentity})=>{
 await authorizeBot(bot);assert.equal((await bot.status()).available,true);
 const flow=await bot.start('channel',token);assert.equal(new URL(flow.url).searchParams.get('scope'),'channel:bot');await assert.rejects(bot.callback(stateOf(flow.url),'wrong','code'),/navegador/);
 setIdentity('123','streamer',['channel:bot']);const result=await bot.callback(stateOf(flow.url),flow.cookie,'code');assert.equal(result.kind,'channel');if(result.kind!=='channel')throw new Error();
 const other=await points.walletLogin('wallet-b');await assert.rejects(bot.complete(other.token,result.ticket!,flow.cookie),/cuenta cambió/);
 await bot.complete(token,result.ticket!,flow.cookie);await points.load();assert.deepEqual(points.botChannels(),['streamer']);await assert.rejects(bot.complete(token,result.ticket!,flow.cookie));
 await points.unlinkTwitch(token);assert.equal((await bot.status(token)).enabled,false);
}));
test('rejects wrong bot account, missing scopes, callback replay and wrong broadcaster',options,()=>fixture(async({bot,token,setIdentity})=>{
 const wrong=await bot.start('account');setIdentity('99','personal',['user:read:chat','user:write:chat','user:bot']);await assert.rejects(bot.callback(stateOf(wrong.url),wrong.cookie,'code'),/plotfun/);assert.equal((await bot.status()).available,false);
 const missing=await bot.start('account');setIdentity('42','plotfun',[]);await assert.rejects(bot.callback(stateOf(missing.url),missing.cookie,'code'),/permisos/);await assert.rejects(bot.callback(stateOf(missing.url),missing.cookie,'code'),/venció/);
 const channel=await bot.start('channel',token);setIdentity('999','other',['channel:bot']);await assert.rejects(bot.callback(stateOf(channel.url),channel.cookie,'code'),/mismo canal/);
}));
test('signed chat events enqueue durable replies once; worker subscribes, greets, announces and stops after disable',options,()=>fixture(async({bot,token,sent,setIdentity,subscriptions,clock})=>{
 await authorizeBot(bot);const flow=await bot.start('channel',token);setIdentity('123','streamer',['channel:bot']);const done=await bot.callback(stateOf(flow.url),flow.cookie,'code');if(done.kind!=='channel')throw new Error();await bot.complete(token,done.ticket!,flow.cookie);
 const snapshot=()=>[{prediction:{id:'p1',channel:'streamer',title:'¿Gana?',status:'ACTIVE' as const,createdAt:new Date(clock.now).toISOString(),predictionWindowSeconds:600,outcomes:[{id:'yes',title:'Sí'},{id:'no',title:'No'}]},market:{state:'created',byteMarketId:'market1'}}];
 await bot.sync(snapshot);assert.equal(subscriptions.length,1);await bot.sync(snapshot);assert.equal(sent.length,1);assert.match(sent[0].message,/conectado/);assert.match(sent[0].message,/https:\/\/plot\.example\/join\/twitch\/streamer/);
 clock.now+=2000;await bot.sync(snapshot);assert.equal(sent.length,2);assert.match(sent[1].message,/Nueva predicción/);assert.match(sent[1].message,/\/join\/twitch\/streamer/);clock.now+=2000;await bot.sync(snapshot);assert.equal(sent.length,2);
 const event={subscription:{type:'channel.chat.message',condition:{user_id:'42'}},event:{broadcaster_user_id:'123',chatter_user_id:'999',message:{text:'!plot'}}},signature=signed(event,'event-1',clock.now);
 assert.equal((await bot.webhook(signature.headers,signature.raw)).status,204);await bot.webhook(signature.headers,signature.raw);await bot.sync(snapshot);assert.equal(sent.length,3);assert.match(sent[2].message,/las predicciones/);assert.match(sent[2].message,/\/join\/twitch\/streamer/);
 const bad={...signature.headers,'twitch-eventsub-message-signature':'bad'};assert.equal((await bot.webhook(bad,signature.raw)).status,403);
 const old=signed(event,'old',clock.now-700_000);assert.equal((await bot.webhook(old.headers,old.raw)).status,403);
 await bot.disable(token);clock.now+=31000;const after=signed(event,'after',clock.now);await bot.webhook(after.headers,after.raw);await bot.sync(snapshot);assert.equal(subscriptions.length,0);assert.equal(sent.length,3);
}));
test('HTTP webhook endpoint preserves raw-body signature and rejects tampering before touching chat',options,()=>fixture(async({docs,bot,token,setIdentity,sent,clock})=>{
 await authorizeBot(bot);const flow=await bot.start('channel',token);setIdentity('123','streamer',['channel:bot']);const done=await bot.callback(stateOf(flow.url),flow.cookie,'code');if(done.kind!=='channel')throw new Error();await bot.complete(token,done.ticket!,flow.cookie);await bot.sync(()=>[]);await bot.sync(()=>[]);
 const app=cloudApp(docs,{AUTH_ORIGIN:config.origin,DATABASE_URL:database,PLOT_NAMESPACE:docs.namespace,TWITCH_CLIENT_ID:config.clientId,TWITCH_CLIENT_SECRET:config.clientSecret});const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
 try{const url=`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/twitch/bot/webhook`;const s=signed({subscription:{type:'channel.chat.message',condition:{user_id:'42'}},event:{broadcaster_user_id:'123',chatter_user_id:'88',message:{text:'!plot'}}});
 const response=await fetch(url,{method:'POST',headers:{...s.headers,'Content-Type':'application/json'},body:s.raw});assert.equal(response.status,204);
 const forged=await fetch(url,{method:'POST',headers:{...s.headers,'Content-Type':'application/json'},body:Buffer.from('{}')});assert.equal(forged.status,403);clock.now+=2000;await bot.sync(()=>[]);assert.equal(sent.length,2);
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));app.locals.liveMarkets.close();}
}));
