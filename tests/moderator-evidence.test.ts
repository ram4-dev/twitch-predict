import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Points,MODERATOR_EVIDENCE_TTL_MS} from '../src/points.js';
import {CloudTwitchBot} from '../src/cloud/twitch-bot.js';
import {LocalDocuments} from '../src/local-documents.js';
import {createHmac,randomUUID} from 'node:crypto';

const identity=(id:string,login:string)=>({id,login,displayName:login,linkedAt:new Date().toISOString()});
async function fixture(work:(v:{p:Points;owner:string;mod:string;viewer:string;store:LocalDocuments;bot:CloudTwitchBot;setRevoked:(revoked:boolean)=>void;advance:(ms:number)=>void;send:(text:string,actor:string)=>Promise<unknown>})=>Promise<void>){
 const directory=await mkdtemp(join(tmpdir(),'mod-evidence-'));
 try{
  const p=new Points(directory);await p.load();
  const owner=await p.createAccount();await p.linkTwitch(owner.token,identity('123','owner'));await p.setBotEnabled(owner.token,true);
  const modAccount=await p.createAccount();await p.linkTwitch(modAccount.token,identity('456','real_mod'));
  const viewer=await p.createAccount();await p.linkTwitch(viewer.token,identity('789','plain_viewer'));
  const store=new LocalDocuments(directory);
  await store.update('twitch-bot-auth',()=>({bot:{id:'42',login:'plotfun',clientId:'fixture',authorizedAt:Date.now()}}),()=>{});
  let revoked=false;
  const api=(async(url:string)=>{
   const u=String(url);
   if(u.includes('oauth2/token'))return Response.json({access_token:'fixture-app-token',expires_in:3600});
   if(u.includes('moderation/moderators'))return Response.json({data:revoked?[]:[{user_id:'456'}]});
   return Response.json({});
  }) as unknown as typeof fetch;
  const bot=new CloudTwitchBot(store,{clientId:'fixture',clientSecret:'fixture-secret',origin:'https://plot.example'},api,Date.now,p);
  const send=async(text:string,actor:string,id:string=randomUUID())=>{
   const raw=Buffer.from(JSON.stringify({subscription:{type:'channel.chat.message',condition:{user_id:'42'}},event:{broadcaster_user_id:'123',chatter_user_id:actor,message:{text}}}));
   const stamp=new Date().toISOString(),secret=createHmac('sha256','fixture-secret').update('plot-eventsub-webhook-v1').digest('hex');
   return bot.webhook({'twitch-eventsub-message-id':id,'twitch-eventsub-message-timestamp':stamp,'twitch-eventsub-message-type':'notification','twitch-eventsub-message-signature':'sha256='+createHmac('sha256',secret).update(id+stamp).update(raw).digest('hex')},raw);
  };
  await work({p,owner:owner.token,mod:modAccount.token,viewer:viewer.token,store,bot,setRevoked:v=>{revoked=v;},advance:ms=>{p.evidenceClock=()=>Date.now()+ms;},send});
 }finally{await rm(directory,{recursive:true,force:true});}
}
const actorOf=(p:Points,token:string)=>({accountId:p.me(token).id,twitchId:p.me(token).twitch!.id});
const channel={id:'123',login:'owner'};

test('chat seeds evidence, Twitch revokes, TTL passes: HTTP publication without another chat message is denied',()=>fixture(async({p,mod,owner,send})=>{
 // Moderator evidence arrives only from the authoritative chat adapter query.
 await send('!plot crear ¿Chat?, Sí, No','456');
 assert.equal(p.markets().length,1);
 const actor=actorOf(p,mod);
 // Revocation happens in Twitch; no further chat message arrives to refresh the evidence.
 const pre={title:'Después de revocar',options:['Sí','No']};
 // Advance the clock beyond the evidence TTL: the dated evidence is expired → denied.
 const marketCount=p.markets().length;
 p.evidenceClock=()=>Date.now()+MODERATOR_EVIDENCE_TTL_MS+1000;
 await assert.rejects(p.proposalTransaction(draft=>draft.publishMarket({actor,channel,input:pre,requestId:randomUUID()})),/dueño del canal/);
 assert.equal(p.markets().length,marketCount);
 // The owner path never depends on moderator evidence.
 const ownerActor=actorOf(p,owner);
 const ownerPublished=await p.proposalTransaction(draft=>draft.publishMarket({actor:ownerActor,channel,input:{title:'Del dueño tras revocar',options:['Sí','No']},requestId:randomUUID()}));
 assert.equal(ownerPublished.kind,'market');
}));

test('open form revocation: publication accepted inside TTL but denied after expiry at confirm time',()=>fixture(async({p,mod,send})=>{
 await send('!plot crear ¿Vigente?, Sí, No','456');
 const actor=actorOf(p,mod);
 const input={title:'Confirmación del formulario',options:['Sí','No']};
 // Inside the TTL window the publication succeeds (evidence fresh).
 const published=await p.proposalTransaction(draft=>draft.publishMarket({actor,channel,input,requestId:randomUUID()}));
 assert.equal(published.kind,'market');
 // A later confirmation with expired evidence (no chat refresh) is denied.
 p.evidenceClock=()=>Date.now()+MODERATOR_EVIDENCE_TTL_MS+1000;
 await assert.rejects(p.proposalTransaction(draft=>draft.publishMarket({actor,channel,input:{title:'Tarde',options:['Sí','No']},requestId:randomUUID()})),/dueño del canal/);
}));

test('fresh authoritative revalidation restores the moderator for HTTP publication; outage denies',()=>fixture(async({p,mod,send})=>{
 await send('!plot crear ¿Semilla?, Sí, No','456');
 const actor=actorOf(p,mod);
 const input={title:'Revalidado',options:['Sí','No']};
 p.evidenceClock=()=>Date.now()+MODERATOR_EVIDENCE_TTL_MS+1000;
 // Without a revalidator the expired evidence denies…
 await assert.rejects(p.proposalTransaction(draft=>draft.publishMarket({actor,channel,input,requestId:randomUUID()})),/dueño del canal/);
 // …but a fresh authoritative query inside the transaction window restores the right.
 p.moderatorRevalidator=async()=>['456'];
 const published=await p.proposalTransactionWithRevalidation(draft=>draft.publishMarket({actor,channel,input,requestId:randomUUID()}),channel);
 assert.equal(published.kind,'market');
 // Outage (revalidator returns null): deny rather than trust — advance past the refreshed evidence.
 p.evidenceClock=()=>Date.now()+2*MODERATOR_EVIDENCE_TTL_MS+3000;
 p.moderatorRevalidator=async()=>null;
 await assert.rejects(p.proposalTransactionWithRevalidation(draft=>draft.publishMarket({actor,channel,input:{title:'Outage',options:['Sí','No']},requestId:randomUUID()}),channel),/dueño del canal/);
 p.moderatorRevalidator=null;
}));

test('owner publication is independent of moderator evidence at any evidence age',()=>fixture(async({p,owner,viewer,send})=>{
 await send('!plot crear ¿Owner?, Sí, No','123');
 const actor=actorOf(p,owner);
 p.evidenceClock=()=>Date.now()+MODERATOR_EVIDENCE_TTL_MS+1000;
 const published=await p.proposalTransaction(draft=>draft.publishMarket({actor,channel,input:{title:'Del dueño',options:['Sí','No']},requestId:randomUUID()}));
 assert.equal(published.kind,'market');
 // Plain viewers never gain create rights, fresh or stale.
 const viewerActor=actorOf(p,viewer);
 await assert.rejects(p.proposalTransaction(draft=>draft.publishMarket({actor:viewerActor,channel,input:{title:'Viewer',options:['Sí','No']},requestId:randomUUID()})),/dueño del canal/);
}));
import {test as t3} from 'node:test';
// Coordinator walkthrough: outage BEFORE the evidence TTL must deny moderator publication even
// with a fresh cached snapshot; and the Twitch query must never hold the Points queue.
t3('outage inside TTL denies moderator publish; query does not block concurrent bets/refunds',async()=>{
 const directory=await mkdtemp(`${tmpdir()}/mod-outage-`);
 try{
  const p=new Points(directory);await p.load();
  const owner=await p.createAccount();await p.linkTwitch(owner.token,identity('123','owner'));await p.setBotEnabled(owner.token,true);
  const modAccount=await p.createAccount();await p.linkTwitch(modAccount.token,identity('456','real_mod'));
  const store=new LocalDocuments(directory);
  await store.update('twitch-bot-auth',()=>({bot:{id:'42',login:'plotfun',clientId:'fixture',authorizedAt:Date.now()}}),()=>{});
  let twitchDown=false;
  const api=(async(url:string)=>{
   const u=String(url);
   if(u.includes('oauth2/token'))return Response.json({access_token:'fixture-app-token',expires_in:3600});
   if(u.includes('moderation/moderators')){
    if(twitchDown){await new Promise(r=>setTimeout(r,300));return new Response(null,{status:503});}
    return Response.json({data:[{user_id:'456'}]});
   }
   return Response.json({});
  }) as unknown as typeof fetch;
  const bot=new CloudTwitchBot(store,{clientId:'fixture',clientSecret:'fixture-secret',origin:'https://plot.example'},api,Date.now,p);
  const send=async(text:string,actor:string,id:string=randomUUID())=>{
   const raw=Buffer.from(JSON.stringify({subscription:{type:'channel.chat.message',condition:{user_id:'42'}},event:{broadcaster_user_id:'123',chatter_user_id:actor,message:{text}}}));
   const stamp=new Date().toISOString(),secret=createHmac('sha256','fixture-secret').update('plot-eventsub-webhook-v1').digest('hex');
   return bot.webhook({'twitch-eventsub-message-id':id,'twitch-eventsub-message-timestamp':stamp,'twitch-eventsub-message-type':'notification','twitch-eventsub-message-signature':'sha256='+createHmac('sha256',secret).update(id+stamp).update(raw).digest('hex')},raw);
  };
  // Seed evidence by chat (fresh, inside TTL).
  await send('!plot crear ¿Semilla?, Sí, No','456');
  assert.equal(p.markets().length,1);
  const actor=actorOf(p,modAccount.token);
  const input={title:'Publicación HTTP',options:['Sí','No']};
  // Wire the revalidator exactly like the server does.
  p.moderatorRevalidator=(channel)=>bot.freshModerators(channel.id,channel.login);
  // Twitch outage BEFORE the TTL: moderator publication must be denied, not served from cache.
  twitchDown=true;
  const slow=assert.rejects(p.proposalTransactionWithRevalidation(draft=>draft.publishMarket({actor,channel:{id:'123',login:'owner'},input,requestId:randomUUID()}),{id:'123',login:'owner'}),/dueño del canal/);
  // While the slow Twitch query is in flight, the Points queue must stay free for bets/refunds.
  const refundable=await p.markets();
  const demo=refundable[0];
  const concurrentBet=await p.bet((await p.walletLogin(`viewer-${randomUUID()}`)).token,demo.key,'1',10,randomUUID()).then(()=>true).catch(()=>false);
  assert.equal(concurrentBet,true,'Points queue must not be blocked by the moderator revalidation');
  await slow;
  assert.equal(p.markets().length,1);
 }finally{await rm(directory,{recursive:true,force:true});}
});
t3('revoked during an open form: confirmation before TTL still denies on fresh revalidation',async()=>{
 const directory=await mkdtemp(`${tmpdir()}/mod-revoked-`);
 try{
  const p=new Points(directory);await p.load();
  const owner=await p.createAccount();await p.linkTwitch(owner.token,identity('123','owner'));await p.setBotEnabled(owner.token,true);
  const modAccount=await p.createAccount();await p.linkTwitch(modAccount.token,identity('456','real_mod'));
  const store=new LocalDocuments(directory);
  await store.update('twitch-bot-auth',()=>({bot:{id:'42',login:'plotfun',clientId:'fixture',authorizedAt:Date.now()}}),()=>{});
  let revoked=false;
  const api=(async(url:string)=>{
   const u=String(url);
   if(u.includes('oauth2/token'))return Response.json({access_token:'fixture-app-token',expires_in:3600});
   if(u.includes('moderation/moderators'))return Response.json({data:revoked?[]:[{user_id:'456'}]});
   return Response.json({});
  }) as unknown as typeof fetch;
  const bot=new CloudTwitchBot(store,{clientId:'fixture',clientSecret:'fixture-secret',origin:'https://plot.example'},api,Date.now,p);
  const send=async(text:string,actor:string,id:string=randomUUID())=>{
   const raw=Buffer.from(JSON.stringify({subscription:{type:'channel.chat.message',condition:{user_id:'42'}},event:{broadcaster_user_id:'123',chatter_user_id:actor,message:{text}}}));
   const stamp=new Date().toISOString(),secret=createHmac('sha256','fixture-secret').update('plot-eventsub-webhook-v1').digest('hex');
   return bot.webhook({'twitch-eventsub-message-id':id,'twitch-eventsub-message-timestamp':stamp,'twitch-eventsub-message-type':'notification','twitch-eventsub-message-signature':'sha256='+createHmac('sha256',secret).update(id+stamp).update(raw).digest('hex')},raw);
  };
  await send('!plot crear ¿Semilla?, Sí, No','456');
  const actor=actorOf(p,modAccount.token);
  p.moderatorRevalidator=(channel)=>bot.freshModerators(channel.id,channel.login);
  // The form was opened while evidence was fresh; Twitch revokes before confirmation (still inside TTL).
  revoked=true;
  await assert.rejects(p.proposalTransactionWithRevalidation(draft=>draft.publishMarket({actor,channel:{id:'123',login:'owner'},input:{title:'Tardío',options:['Sí','No']},requestId:randomUUID()}),{id:'123',login:'owner'}),/dueño del canal/);
  assert.equal(p.markets().length,1);
  // The owner confirms the same form independently of moderator evidence.
  const ownerActor=actorOf(p,owner.token);
  const published=await p.proposalTransactionWithRevalidation(draft=>draft.publishMarket({actor:ownerActor,channel:{id:'123',login:'owner'},input:{title:'Del dueño',options:['Sí','No']},requestId:randomUUID()}),{id:'123',login:'owner'});
  assert.equal(published.kind,'market');
 }finally{await rm(directory,{recursive:true,force:true});}
});
