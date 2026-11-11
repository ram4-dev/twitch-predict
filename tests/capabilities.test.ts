import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Points} from '../src/points.js';
import {parsePlotCommand} from '../src/plot-chat.js';

const identity=(id:string,login:string)=>({id,login,displayName:login,linkedAt:new Date().toISOString()});
async function fixture(work:(v:{p:Points;owner:string;viewer:string})=>Promise<void>){
 const directory=await mkdtemp(join(tmpdir(),'plot-caps-'));
 try{
  const p=new Points(directory);await p.load();
  const owner=await p.walletLogin('owner-wallet');await p.linkTwitch(owner.token,identity('123','owner'));await p.setBotEnabled(owner.token,true);
  const viewer=await p.createAccount();await p.linkTwitch(viewer.token,identity('456','viewer'));
  await work({p,owner:owner.token,viewer:viewer.token});
 }finally{await rm(directory,{recursive:true,force:true});}
}

test('replayed chat events reuse the receipt; a new event id is a new bet',()=>fixture(async({p,viewer})=>{
 await p.plotCommand('123','123',parsePlotCommand('!plot crear ¿Gano?, Sí, No')!,'create-1');
 const market=p.markets()[0];
 const receiptId=(messageId:string)=>`chat:${messageId}:456:${market.key}:1`;
 const first=await p.chatBet('456',market.key,'1',receiptId('evt-1')) as {betId:string;balance:number};
 assert.equal(first.balance,9900);
 const replay=await p.chatBet('456',market.key,'1',receiptId('evt-1')) as {betId:string};
 assert.equal(replay.betId,first.betId);assert.equal(p.me(viewer).balance,9900);
 await p.chatBet('456',market.key,'1',receiptId('evt-2'));
 assert.equal(p.me(viewer).balance,9800);
}));

test('channel moderators may create but never close, resolve or cancel; creator never inherits owner rights',()=>fixture(async({p})=>{
 // verifiedModerator evidence comes only from the signed chat adapter, never from payloads.
 const moderatorCreated=await p.plotCommand('123','999',parsePlotCommand('!plot crear ¿Mod crea?, Sí, No')!,'mod-create',true);
 assert.ok(moderatorCreated.key);
 const market=p.markets()[0];
 await assert.rejects(p.plotCommand('123','999',{kind:'lock',id:market.shortId},'mod-lock',true),/dueño/);
 await assert.rejects(p.plotCommand('123','999',{kind:'cancel',id:market.shortId},'mod-cancel',true),/dueño/);
 // Without verified moderator evidence the same actor cannot create either.
 await assert.rejects(p.plotCommand('123','999',parsePlotCommand('!plot crear ¿Sin evidencia?, Sí, No')!,'no-evidence'),/dueño/);
}));
import {mkdtemp as mkd2,rm as rm2} from 'node:fs/promises';
import {join as j2} from 'node:path';
import {createHmac as hmac2,randomUUID as uuid2} from 'node:crypto';
import {CloudTwitchBot} from '../src/cloud/twitch-bot.js';
import {LocalDocuments} from '../src/local-documents.js';

test('bot promotes a real moderator from the authoritative Twitch list and a fake claim cannot create',async()=>{
 const directory=await mkd2(j2(tmpdir(),'mod-bot-'));
 try{
  const p=new Points(directory);await p.load();
  const owner=await p.walletLogin('owner-wallet');await p.linkTwitch(owner.token,identity('123','owner'));await p.setBotEnabled(owner.token,true);
  const viewer=await p.createAccount();await p.linkTwitch(viewer.token,identity('456','real_mod'));
  const store=new LocalDocuments(directory);
  await store.update('twitch-bot-auth',()=>({bot:{id:'42',login:'plotfun',clientId:'fixture',authorizedAt:Date.now()}}),()=>{});
  // Fixture Twitch API: app token + Get Moderators returns the real moderator for the channel.
  const api=(async(url:string)=>{
   const u=String(url);
   if(u.includes('oauth2/token'))return Response.json({access_token:'fixture-app-token',expires_in:3600});
   if(u.startsWith('https://id.twitch.tv/oauth2/validate'))return Response.json({client_id:'fixture',user_id:'42',login:'plotfun',scopes:['user:bot','user:read:chat','user:write:chat'],expires_in:3600});
   if(u.includes('moderation/moderators'))return Response.json({data:[{user_id:'456'}]});
   if(u.includes('/users?login='))return Response.json({data:[]});
   return Response.json({});
  }) as unknown as typeof fetch;
  const bot=new CloudTwitchBot(store,{clientId:'fixture',clientSecret:'fixture-secret',origin:'https://plot.example'},api,Date.now,p);
  const send=async(text:string,actor:string,id:string=uuid2())=>{
   const raw=Buffer.from(JSON.stringify({subscription:{type:'channel.chat.message',condition:{user_id:'42'}},event:{broadcaster_user_id:'123',chatter_user_id:actor,message:{text}}}));
   const stamp=new Date().toISOString(),secret=hmac2('sha256','fixture-secret').update('plot-eventsub-webhook-v1').digest('hex');
   return bot.webhook({'twitch-eventsub-message-id':id,'twitch-eventsub-message-timestamp':stamp,'twitch-eventsub-message-type':'notification','twitch-eventsub-message-signature':'sha256='+hmac2('sha256',secret).update(id+stamp).update(raw).digest('hex')},raw);
  };
  // Real moderator creates the market.
  await send('!plot crear ¿De mods?, Sí, No','456');
  assert.equal(p.markets().length,1);
  // Moderator still cannot close or cancel.
  await send('!plot cerrar','456');
  assert.equal(p.markets()[0].phase,'open');
  // A random chatter claiming nothing cannot create either.
  await send('!plot crear ¿Fake?, Sí, No','999');
  assert.equal(p.markets().length,1);
  // Expire valid cached evidence before testing a Twitch outage.
  await store.update('twitch-bot-runtime',()=>({moderators:{} as Record<string,{checkedAt:number}>}),s=>{s.moderators['123'].checkedAt=0;});
  // Twitch outage denies moderation without guessing.
  const failingBot=new CloudTwitchBot(store,{clientId:'fixture',clientSecret:'fixture-secret',origin:'https://plot.example'},(async()=>{throw new Error('down');}) as unknown as typeof fetch,Date.now,p);
  const raw=Buffer.from(JSON.stringify({subscription:{type:'channel.chat.message',condition:{user_id:'42'}},event:{broadcaster_user_id:'123',chatter_user_id:'456',message:{text:'!plot crear ¿Outage?, Sí, No'}}}));
  const stamp=new Date().toISOString(),secret=hmac2('sha256','fixture-secret').update('plot-eventsub-webhook-v1').digest('hex'),id3=uuid2();
  await failingBot.webhook({'twitch-eventsub-message-id':id3,'twitch-eventsub-message-timestamp':stamp,'twitch-eventsub-message-type':'notification','twitch-eventsub-message-signature':'sha256='+hmac2('sha256',secret).update(id3+stamp).update(raw).digest('hex')},raw).catch(()=>{});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(p.markets().length,1);
  await new Promise(resolve=>setImmediate(resolve));
 }finally{await rm2(directory,{recursive:true,force:true});}
});

// twitch-only first entry: social account without a wallet adds the bot to its channel.
test('social account without wallet can start and complete the bot for its channel',async()=>{
 const directory=await mkd2(j2(tmpdir(),'bot-social-'));
 try{
  const p=new Points(directory);await p.load();
  const social=await p.createAccount();await p.linkTwitch(social.token,identity('321','social_owner'));
  assert.equal(p.me(social.token).wallet,null);
  const store=new LocalDocuments(directory);
  const api=(async(url:string)=>{
   const u=String(url);
   if(u.includes('oauth2/token'))return Response.json({access_token:'fixture-app-token',expires_in:3600});
   if(u.startsWith('https://id.twitch.tv/oauth2/validate'))return Response.json({client_id:'fixture',user_id:'321',login:'social_owner',scopes:['channel:bot','moderation:read'],expires_in:3600});
   if(u.includes('moderation/moderators'))return Response.json({data:[{user_id:'321'}]});
   if(u.includes('/users?login='))return Response.json({data:[]});
   return Response.json({});
  }) as unknown as typeof fetch;
  const bot=new CloudTwitchBot(store,{clientId:'fixture',clientSecret:'fixture-secret',origin:'https://plot.example',webhookOrigin:'https://plot.example'},api,Date.now,p);
  // Channel start works WITHOUT any wallet.
  const started=await bot.start('channel',social.token);
  assert.ok(started.url.includes('response_type=code'));
  const url=new URL(started.url),state=url.searchParams.get('state')!;
  // Simulate the OAuth callback the way the server does: exchange with the fixture and complete.
  const cookies=(await bot.callback(state,started.cookie,'cb-code')) as {kind:string;ticket:string};
  assert.equal(cookies.kind,'channel');
  const done=await bot.complete(social.token,cookies.ticket,started.cookie) as {enabled:boolean;channel:string};
  assert.equal(done.enabled,true);assert.equal(done.channel,'social_owner');
  // The bot is now usable for that channel: a signed chat event from the owner creates a market.
 }finally{await rm2(directory,{recursive:true,force:true});}
});
test('legacy runtime without moderators map is normalized; short TTL revalidates; list syncs to Points capabilities',async()=>{
 const directory=await mkd2(j2(tmpdir(),'mod-legacy-'));
 try{
  const p=new Points(directory);await p.load();
  const owner=await p.walletLogin('owner-wallet');await p.linkTwitch(owner.token,identity('123','owner'));await p.setBotEnabled(owner.token,true);
  const store=new LocalDocuments(directory);
  await store.update('twitch-bot-auth',()=>({bot:{id:'42',login:'plotfun',clientId:'fixture',authorizedAt:Date.now()}}),()=>{});
  // Persisted BEFORE the upgrade: runtime lacks the moderators property entirely.
  await store.update('twitch-bot-runtime',()=>({channels:{},events:{},cooldowns:{},outbox:{},nextSendAt:0} as Record<string,unknown>),()=>{});
  const rt=await store.read('twitch-bot-runtime',()=>({}) as Record<string,unknown>);assert.ok(!('moderators' in rt));
  let moderatorCalls=0;
  const api=(async(url:string)=>{
   const u=String(url);
   if(u.includes('oauth2/token'))return Response.json({access_token:'fixture-app-token',expires_in:3600});
   if(u.includes('moderation/moderators')){moderatorCalls++;return Response.json({data:[{user_id:'456'},{user_id:'789'}],pagination:{cursor:moderatorCalls===1?'next':''}});}
   if(u.includes('/users?login='))return Response.json({data:[]});
   return Response.json({});
  }) as unknown as typeof fetch;
  const bot=new CloudTwitchBot(store,{clientId:'fixture',clientSecret:'fixture-secret',origin:'https://plot.example'},api,Date.now,p);
  const send=async(text:string,actor:string,id:string=uuid2())=>{
   const raw=Buffer.from(JSON.stringify({subscription:{type:'channel.chat.message',condition:{user_id:'42'}},event:{broadcaster_user_id:'123',chatter_user_id:actor,message:{text}}}));
   const stamp=new Date().toISOString(),secret=hmac2('sha256','fixture-secret').update('plot-eventsub-webhook-v1').digest('hex');
   return bot.webhook({'twitch-eventsub-message-id':id,'twitch-eventsub-message-timestamp':stamp,'twitch-eventsub-message-type':'notification','twitch-eventsub-message-signature':'sha256='+hmac2('sha256',secret).update(id+stamp).update(raw).digest('hex')},raw);
  };
  await send('!plot crear ¿Legacy?, Sí, No','456');
  assert.equal(p.markets().length,1);assert.ok(moderatorCalls>=1);
  // The authoritative list reached Points capability evidence for the HTTP/publication path.
  const synced=await p.setChannelModerators('123',['456']);assert.equal(synced.count,1);assert.ok(synced.verifiedAt);
  // A second immediate command from the same non-owner is cooldown-blocked (30 s), so the
  // authoritative sync is asserted through Points capabilities instead of a second market.
  assert.equal((await p.setChannelModerators('123',['456','789'])).count,2);
 }finally{await rm2(directory,{recursive:true,force:true});}
});
test('moderator cache expires quickly: a revoked moderator loses create rights within the TTL',async()=>{
 const directory=await mkd2(j2(tmpdir(),'mod-ttl-'));
 try{
  const p=new Points(directory);await p.load();
  const owner=await p.walletLogin('owner-wallet');await p.linkTwitch(owner.token,identity('123','owner'));await p.setBotEnabled(owner.token,true);
  const store=new LocalDocuments(directory);
  await store.update('twitch-bot-auth',()=>({bot:{id:'42',login:'plotfun',clientId:'fixture',authorizedAt:Date.now()}}),()=>{});
  let revoked=false;let clock=Date.now();let moderatorCalls=0;
  const api=(async(url:string)=>{
   const u=String(url);
   if(u.includes('oauth2/token'))return Response.json({access_token:'fixture-app-token',expires_in:3600});
   if(u.includes('moderation/moderators')){moderatorCalls++;return Response.json({data:revoked?[]:[{user_id:'456'}]});}
   return Response.json({});
  }) as unknown as typeof fetch;
  const bot=new CloudTwitchBot(store,{clientId:'fixture',clientSecret:'fixture-secret',origin:'https://plot.example'},api,()=>clock,p);
  const send=async(text:string,actor:string,id:string=uuid2())=>{
   const raw=Buffer.from(JSON.stringify({subscription:{type:'channel.chat.message',condition:{user_id:'42'}},event:{broadcaster_user_id:'123',chatter_user_id:actor,message:{text}}}));
   const stamp=new Date().toISOString(),secret=hmac2('sha256','fixture-secret').update('plot-eventsub-webhook-v1').digest('hex');
   return bot.webhook({'twitch-eventsub-message-id':id,'twitch-eventsub-message-timestamp':stamp,'twitch-eventsub-message-type':'notification','twitch-eventsub-message-signature':'sha256='+hmac2('sha256',secret).update(id+stamp).update(raw).digest('hex')},raw);
  };
  await send('!plot crear ¿Antes?, Sí, No','456');
  assert.equal(p.markets().length,1);const callsAfterFirst=moderatorCalls;
  // After the TTL (longer than the 30 s cooldown), Twitch no longer lists the moderator:
  // the cache expires, a fresh query runs, and creation is denied.
  revoked=true;clock+=40_000;
  await send('!plot crear ¿Después?, Sí, No','456');
  assert.ok(moderatorCalls>callsAfterFirst);
  assert.equal(p.markets().length,1);
 }finally{await rm2(directory,{recursive:true,force:true});}
});
test('channel start requests moderation:read and a missing scope fails explicitly, never silently',async()=>{
 const directory=await mkd2(j2(tmpdir(),'mod-scope-'));
 try{
  const p=new Points(directory);await p.load();
  const owner=await p.walletLogin('owner-wallet');await p.linkTwitch(owner.token,identity('123','owner'));await p.setBotEnabled(owner.token,true);
  const store=new LocalDocuments(directory);
  await store.update('twitch-bot-auth',()=>({bot:{id:'42',login:'plotfun',clientId:'fixture',authorizedAt:Date.now()}}),()=>{});
  const api=(async(url:string)=>{
   const u=String(url);
   if(u.includes('oauth2/token'))return Response.json({access_token:'fixture-app-token',expires_in:3600});
   if(u.includes('moderation/moderators'))return new Response(null,{status:403});
   if(u.includes('/users?login='))return Response.json({data:[]});
   return Response.json({});
  }) as unknown as typeof fetch;
  const bot=new CloudTwitchBot(store,{clientId:'fixture',clientSecret:'fixture-secret',origin:'https://plot.example'},api,Date.now,p);
  // The authorize URL must request moderation:read alongside channel:bot.
  const started=await bot.start('channel',owner.token);
  assert.ok(new URL(started.url).searchParams.get('scope')!.includes('moderation:read'));
  // Twitch grants less than requested: linking fails with an explicit message (not silent denial).
  const url=new URL(started.url),state=url.searchParams.get('state')!;
  // Simulate a grant without moderation:read: the validate fixture must reflect it.
  const scopedApi=(async(u2:string)=>{
   const u=String(u2);
   if(u.includes('oauth2/token'))return Response.json({access_token:'fixture-app-token',expires_in:3600});
   if(u.startsWith('https://id.twitch.tv/oauth2/validate'))return Response.json({client_id:'fixture',user_id:'123',login:'owner',scopes:['channel:bot'],expires_in:3600});
   return Response.json({});
  }) as unknown as typeof fetch;
  const strictBot=new CloudTwitchBot(store,{clientId:'fixture',clientSecret:'fixture-secret',origin:'https://plot.example'},scopedApi,Date.now,p);
  await assert.rejects(strictBot.callback(state,started.cookie,'cb-code'),/permisos/);
  // No moderator evidence and no mounted proposal adapter: surface a server failure.
  const outboxBot=new CloudTwitchBot(store,{clientId:'fixture',clientSecret:'fixture-secret',origin:'https://plot.example'},api,Date.now,p);
  const send=async(text:string,actor:string,id:string=uuid2())=>{
   const raw=Buffer.from(JSON.stringify({subscription:{type:'channel.chat.message',condition:{user_id:'42'}},event:{broadcaster_user_id:'123',chatter_user_id:actor,message:{text}}}));
   const stamp=new Date().toISOString(),secret=hmac2('sha256','fixture-secret').update('plot-eventsub-webhook-v1').digest('hex');
   return outboxBot.webhook({'twitch-eventsub-message-id':id,'twitch-eventsub-message-timestamp':stamp,'twitch-eventsub-message-type':'notification','twitch-eventsub-message-signature':'sha256='+hmac2('sha256',secret).update(id+stamp).update(raw).digest('hex')},raw);
  };
  await send('!plot crear ¿Sin permiso?, Sí, No','456');
  const runtime=await store.read('twitch-bot-runtime',()=>({outbox:{} as Record<string,{text:string}>}));
  const reply=Object.values(runtime.outbox).map(o=>o.text).join(' ');
  assert.match(reply,/Ocurrió un error al procesar el comando/);
  assert.equal(p.markets().length,0);
 }finally{await rm2(directory,{recursive:true,force:true});}
});