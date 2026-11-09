import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHmac,randomUUID} from 'node:crypto';
import {Points} from '../src/points.js';
import {parsePlotCommand} from '../src/plot-chat.js';
import {CloudTwitchBot} from '../src/cloud/twitch-bot.js';
import {LocalDocuments} from '../src/local-documents.js';
const identity=(id:string,login:string)=>({id,login,displayName:login,linkedAt:new Date().toISOString()});
async function fixture(work:(v:{p:Points;directory:string;owner:string;viewer:string;other:string;bot:CloudTwitchBot;store:LocalDocuments})=>Promise<void>){
 const directory=await mkdtemp(join(tmpdir(),'plot-chat-'));
 try{
  const p=new Points(directory);await p.load();const owner=await p.walletLogin('owner-wallet');await p.linkTwitch(owner.token,identity('123','owner'));await p.setBotEnabled(owner.token,true);
  const other=await p.walletLogin('other-wallet');await p.linkTwitch(other.token,identity('789','other'));await p.setBotEnabled(other.token,true);
  const viewer=await p.createAccount();await p.linkTwitch(viewer.token,identity('456','viewer'));
  const store=new LocalDocuments(directory);await store.update('twitch-bot-auth',()=>({bot:{id:'42',login:'plotfun',clientId:'fixture',authorizedAt:Date.now()}}),()=>{});
  const bot=new CloudTwitchBot(store,{clientId:'fixture',clientSecret:'fixture-secret',origin:'https://plot.example'},async()=>{throw new Error('Native commands must not call Twitch prediction APIs');},Date.now,p);
  await work({p,directory,owner:owner.token,viewer:viewer.token,other:other.token,bot,store});
 }finally{await rm(directory,{recursive:true,force:true});}
}
const create=()=>parsePlotCommand('!plot crear ¿Gano la partida?')!;
test('Plot command syntax supports defaults, custom options and rejects invalid questions and actions',()=>{
 assert.deepEqual(create(),{kind:'create',title:'¿Gano la partida?',options:['Sí','No']});
 assert.deepEqual(parsePlotCommand('!PLOT crear Ganador, Rojo, Azul, Verde'),{kind:'create',title:'Ganador',options:['Rojo','Azul','Verde']});
 for(const text of ['!plot crear','!plot crear A, Sí','!plot crear A, Sí, sí','!plot crear A, | No','!plot resolver 0','!plot cerrar 1','!plot cancelar extra','!plot crear A, 1, 2, 3, 4, 5, 6, 7'])assert.throws(()=>parsePlotCommand(text));
 assert.equal(parsePlotCommand('!plot ayuda'),undefined);assert.equal(parsePlotCommand('!plot'),undefined);
});
test('native markets persist, stay independent of Twitch freshness, and creation replays are idempotent',()=>fixture(async({p,directory})=>{
 const results=await Promise.all(Array.from({length:4},()=>p.plotCommand('123','123',create(),'same-event')));
 assert.equal(new Set(results.map(r=>r.key)).size,1);assert.equal(p.markets().length,1);
 const market=p.market(results[0].key);assert.equal(market.source,'plot');assert.equal(market.demo,false);assert.equal(market.canBet,true);assert.deepEqual(p.pendingSources(),[]);
 await assert.rejects(p.plotCommand('123','123',create(),'other-event'),/pendiente/);
 await assert.rejects(p.plotCommand('123','123',{kind:'cancel'},'same-event'),/reutilizado/);
 const state=JSON.parse(await readFile(join(directory,'points.json'),'utf8'));state.markets[market.key].sourceCheckedAt='2000-01-01T00:00:00.000Z';await writeFile(join(directory,'points.json'),JSON.stringify(state));
 const restored=new Points(directory);await restored.load();assert.equal(restored.market(market.key).canBet,true);assert.deepEqual(restored.pendingSources(),[]);
}));
test('only linked broadcaster with enabled bot can manage their own native markets',()=>fixture(async({p,owner})=>{
 await assert.rejects(p.plotCommand('123','456',create(),'viewer-event'),/dueño/);
 await assert.rejects(p.plotCommand('123','789',create(),'other-owner-event'),/dueño/);
 await p.plotCommand('123','123',create(),'owner-event');
 await assert.rejects(p.plotCommand('789','789',{kind:'lock'},'other-lock'),/No hay/);
 const account=p.enabledBotChannels().find(c=>c.id==='123');assert.ok(account);
 await p.setBotEnabled(owner,false);await assert.rejects(p.plotCommand('123','123',{kind:'cancel'},'disabled-bot'),/dueño/);assert.equal(p.markets()[0].canBet,true);
}));
test('native chat bets settle and claim with existing point conservation and receipt protections',()=>fixture(async({p,viewer,owner})=>{
 const {key}=await p.plotCommand('123','123',create(),'create');
 await p.chatBet('456',key,'1','bet-viewer');await p.chatBet('123',key,'2','bet-owner');
 await assert.rejects(p.plotCommand('123','123',{kind:'resolve',option:1},'too-early'),/cerrá/);
 await p.plotCommand('123','123',{kind:'lock'},'lock');
 await assert.rejects(p.plotCommand('123','123',{kind:'resolve',option:6},'invalid'),/no existe/);
 await assert.rejects(p.chatBet('456',key,'1','after-close'),/cerrada/);
 await p.plotCommand('123','123',{kind:'resolve',option:1},'resolve');
 assert.equal(p.market(key).winnerId,'1');assert.equal(p.market(key).phase,'resolved');
 const paid=await p.claim(viewer,key,randomUUID()) as {paid:number};assert.equal(paid.paid,200);assert.equal(p.me(viewer).balance,10100);assert.equal(p.me(owner).balance,9900);
 await p.plotCommand('123','123',{kind:'resolve',option:1},'resolve');
 await assert.rejects(p.plotCommand('123','123',{kind:'resolve',option:2},'change-winner'),/No hay/);
}));
test('canceling a native market returns the existing stake through claim',()=>fixture(async({p,viewer})=>{
 const {key}=await p.plotCommand('123','123',create(),'create');await p.chatBet('456',key,'2','bet');
 await p.plotCommand('123','123',{kind:'cancel'},'cancel');assert.equal(p.market(key).phase,'void');assert.equal((await p.claim(viewer,key,'claim') as {paid:number}).paid,100);assert.equal(p.me(viewer).balance,10000);
}));
function message(text:string,actor='123',id:string=randomUUID()){
 const raw=Buffer.from(JSON.stringify({subscription:{type:'channel.chat.message',condition:{user_id:'42'}},event:{broadcaster_user_id:'123',chatter_user_id:actor,message:{text}}}));
 const stamp=new Date().toISOString(),secret=createHmac('sha256','fixture-secret').update('plot-eventsub-webhook-v1').digest('hex');
 return {raw,headers:{'twitch-eventsub-message-id':id,'twitch-eventsub-message-timestamp':stamp,'twitch-eventsub-message-type':'notification','twitch-eventsub-message-signature':'sha256='+createHmac('sha256',secret).update(id+stamp).update(raw).digest('hex')}};
}
test('signed chat events create, bet, close and resolve without Twitch predictions; duplicate events do not repeat effects',()=>fixture(async({p,bot,store,viewer})=>{
 const send=async(text:string,actor='123',id:string=randomUUID())=>{const e=message(text,actor,id);return bot.webhook(e.headers,e.raw);};
 await Promise.all([send('!plot crear ¿Gano?','123','create'),send('!plot crear ¿Gano?','123','create')]);assert.equal(p.markets().length,1);
 await send('!yes','456','bet');await send('!yes','456','bet');assert.equal(p.me(viewer).balance,9900);
 await send('!plot cerrar','456','unauthorized');assert.equal(p.markets()[0].canBet,true);
 await send('!plot cerrar');await send('!plot resolver 1');assert.equal(p.markets()[0].winnerId,'1');
 const runtime=await store.read('twitch-bot-runtime',()=>({outbox:{} as Record<string,{text:string}>}));
 assert.equal(Object.keys(runtime.outbox).filter(k=>k==='command:create').length,1);
 assert.match(runtime.outbox['command:create'].text,/100 puntos/);assert.match(runtime.outbox['command:unauthorized'].text,/dueño/);
 const bad=message('!plot cancelar');bad.headers['twitch-eventsub-message-signature']='invalid';assert.equal((await bot.webhook(bad.headers,bad.raw)).status,403);
}));

test('native betting expires on time even with no Twitch updates',()=>fixture(async({p,directory})=>{
 const {key}=await p.plotCommand('123','123',create(),'create');
 const state=JSON.parse(await readFile(join(directory,'points.json'),'utf8'));state.markets[key].prediction.createdAt=new Date(Date.now()-180000).toISOString();await writeFile(join(directory,'points.json'),JSON.stringify(state));
 const restored=new Points(directory);await restored.load();assert.equal(restored.market(key).canBet,false);assert.equal(restored.market(key).phase,'locked');
 await assert.rejects(restored.chatBet('456',key,'1','expired-bet'),/cerrada/);
 await restored.plotCommand('123','123',{kind:'resolve',option:1},'resolve');assert.equal(restored.market(key).prediction.status,'RESOLVED');
}));
