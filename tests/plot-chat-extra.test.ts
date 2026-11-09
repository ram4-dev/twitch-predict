import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Points} from '../src/points.js';
import {parsePlotCommand} from '../src/plot-chat.js';

async function fixture(work:(v:{p:Points;viewer:string;owner:string})=>Promise<void>){
 const {mkdtemp}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const directory=await mkdtemp(join(tmpdir(),'plot-extra-'));
 try{
  const p=new Points(directory);await p.load();
  const identity=(id:string,login:string)=>({id,login,displayName:login,linkedAt:new Date().toISOString()});
  const owner=await p.walletLogin('owner-wallet');await p.linkTwitch(owner.token,identity('123','owner'));await p.setBotEnabled(owner.token,true);
  const viewerAccount=await p.createAccount();await p.linkTwitch(viewerAccount.token,identity('456','viewer'));
  await work({p,viewer:viewerAccount.token,owner:owner.token});
 }finally{await import('node:fs/promises').then(fs=>fs.rm(directory,{recursive:true,force:true}));}
}
test('multiple simultaneous markets: ids, listing, ambiguity guard and isolated cancellation',()=>fixture(async({p,viewer})=>{
 const created=await Promise.all([
  p.plotCommand('123','123',parsePlotCommand('!plot crear ¿Ganamos?, Sí, No')!,'create-a'),
  p.plotCommand('123','123',parsePlotCommand('!plot crear ¿Segundo mercado?, Rojo, Azul')!,'create-b')
 ]);
 assert.notEqual(created[0].key,created[1].key);
 const plotMarkets=p.markets().filter((m:{source?:string})=>m.source==='plot');
 const codes=plotMarkets.map((m:{shortId?:string})=>m.shortId!);
 assert.equal(codes.length,2);assert.equal(new Set(codes).size,2);
 await p.chatBet('456',created[0].key,'1','bet-a');await p.chatBet('456',created[1].key,'1','bet-b');
 assert.equal(p.me(viewer).balance,9800);
 // Ambiguous shortcuts are refused without debiting or mutating anything.
 await assert.rejects(p.plotCommand('123','123',{kind:'cancel'},'cancel-ambiguous'),/Indicá el código/);
 await assert.rejects(p.plotCommand('123','123',{kind:'lock'},'lock-ambiguous'),/Indicá el código/);
 await p.plotCommand('123','123',parsePlotCommand(`!plot cancelar ${codes[0]}`)!,'cancel-a');
 assert.equal(p.me(viewer).balance,9900);
 const cancelledKey=plotMarkets.find((m:{shortId?:string})=>m.shortId===codes[0])!.key,keptKey=plotMarkets.find((m:{shortId?:string})=>m.shortId===codes[1])!.key;
 const phases=[...p.markets().map((m:{key:string;phase:string})=>[m.key,m.phase] as const)];
 assert.equal(phases.find(([k])=>k===cancelledKey)![1],'void');
 assert.equal(phases.find(([k])=>k===keptKey)![1],'open');
 // Unique remaining target allows the shortcut again.
 await p.plotCommand('123','123',{kind:'lock'},'lock-b');
 assert.equal(p.markets().find((m:{key:string})=>m.key===keptKey)!.phase,'locked');
 const listed=await p.plotCommand('123','123',{kind:'list'},'list-1');
 assert.match(listed.text,/esperando resultado/);
 // Unknown code in the channel is refused without mutation.
 await assert.rejects(p.plotCommand('123','123',{kind:'cancel',id:'ZZ99'},'cancel-unknown'),/código ZZ99/);
}));
test('moderator may create but never close, resolve or cancel; new chat event bets again',()=>fixture(async({p,viewer})=>{
 await p.plotCommand('123','123',parsePlotCommand('!plot crear ¿Gano?, Sí, No')!,'create-1');
 const key=p.markets()[0].key;
 await p.chatBet('456',key,'1','bet-1');assert.equal(p.me(viewer).balance,9900);
 await assert.rejects(p.plotCommand('123','456',parsePlotCommand('!plot crear ¿Viewer?, Sí, No')!,'viewer-create'),/dueño/);
 await p.chatBet('456',key,'1','bet-2');
 assert.equal(p.me(viewer).balance,9800);
 await assert.rejects(p.plotCommand('123','456',{kind:'cancel',id:p.markets()[0].shortId},'mod-cancel'),/dueño/);
}));
test('viewers with a linked Twitch identity can bet and list via plotCommand; owner-only admin holds',()=>fixture(async({p,viewer})=>{
 await p.plotCommand('123','123',parsePlotCommand('!plot crear ¿Viewer apuesta?, Sí, No')!,'create-1');
 // Viewer lists markets directly through plotCommand (not chatBet).
 const listed=await p.plotCommand('123','456',{kind:'list'},'viewer-list');
 assert.match(listed.text,/¿Viewer apuesta\?/);
 // Viewer bets directly through plotCommand.
 const market=p.markets()[0];
 await p.plotCommand('123','456',{kind:'bet',id:market.shortId,option:1},'viewer-bet');
 assert.equal(p.me(viewer).balance,9900);
 // A viewer without admin rights still cannot lock/resolve/cancel.
 await assert.rejects(p.plotCommand('123','456',{kind:'lock',id:market.shortId},'viewer-lock'),/dueño/);
 await assert.rejects(p.plotCommand('123','456',{kind:'cancel',id:market.shortId},'viewer-cancel'),/dueño/);
 // Unlinked chatter (no identity) cannot bet or list.
 await assert.rejects(p.plotCommand('123','999',{kind:'bet',id:market.shortId,option:1},'unlinked-bet'),/Vinculá tu cuenta de Twitch/);
}));

test('publication replay: same requestId+payload returns the same receipt; changed payload rejected; replay after bet+cancel does not double refund',()=>fixture(async({p,owner})=>{
 const actor={accountId:p.me(owner).id,twitchId:'123'};
 const channel={id:'123',login:'owner'};
 const input={title:'¿Replay?',options:['Sí','No']};
 const first=await p.proposalTransaction(draft=>draft.publishMarket({actor,channel,input,requestId:'req-1'}));
 const replay=await p.proposalTransaction(draft=>draft.publishMarket({actor,channel,input,requestId:'req-1'}));
 assert.deepEqual(replay,first);assert.equal(p.markets().filter(m=>m.source==='plot').length,1);
 // Same requestId with different payload is rejected as reuse.
 await assert.rejects(p.proposalTransaction(draft=>draft.publishMarket({actor,channel,input:{title:'Distinta',options:['Sí','No']},requestId:'req-1'})),/reutilizado/);
 // A viewer bets, the owner cancels (automatic refund), then the replay must NOT reopen the market nor re-credit.
 await p.chatBet('456',first.key,'1','bet-before-cancel');
 await p.plotCommand('123','123',{kind:'cancel',id:first.shortId},'cancel-1');
 // Replaying the original publication requestId must return the original receipt, not reopen.
 const replay2=await p.proposalTransaction(draft=>draft.publishMarket({actor,channel,input,requestId:'req-1'}));
 assert.deepEqual(replay2,first);
 assert.equal(p.markets().find(m=>m.key===first.key)!.phase,'void');
 assert.equal(p.markets().filter(m=>m.source==='plot').length,1);
}));

test('publication replay: same requestId+payload returns the same receipt; changed payload rejected; replay after bet+cancel does not double refund',()=>fixture(async({p,owner})=>{
 const actor={accountId:p.me(owner).id,twitchId:'123'};
 const channel={id:'123',login:'owner'};
 const input={title:'¿Replay?',options:['Sí','No']};
 const first=await p.proposalTransaction(draft=>draft.publishMarket({actor,channel,input,requestId:'req-1'}));
 const replay=await p.proposalTransaction(draft=>draft.publishMarket({actor,channel,input,requestId:'req-1'}));
 assert.deepEqual(replay,first);assert.equal(p.markets().filter(m=>m.source==='plot').length,1);
 // Same requestId with different payload is rejected as reuse.
 await assert.rejects(p.proposalTransaction(draft=>draft.publishMarket({actor,channel,input:{title:'Distinta',options:['Sí','No']},requestId:'req-1'})),/reutilizado/);
 // A viewer bets, the owner cancels (automatic refund), then the replay must NOT reopen the market nor re-credit.
 await p.chatBet('456',first.key,'1','bet-before-cancel');
 await p.plotCommand('123','123',{kind:'cancel',id:first.shortId},'cancel-1');
 // Replaying the original publication requestId must return the original receipt, not reopen.
 const replay2=await p.proposalTransaction(draft=>draft.publishMarket({actor,channel,input,requestId:'req-1'}));
 assert.deepEqual(replay2,first);
 assert.equal(p.markets().find(m=>m.key===first.key)!.phase,'void');
 assert.equal(p.markets().filter(m=>m.source==='plot').length,1);
}));
