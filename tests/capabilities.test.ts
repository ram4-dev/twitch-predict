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
