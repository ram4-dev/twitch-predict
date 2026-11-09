import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Points} from '../src/points.js';
import {parsePlotCommand} from '../src/plot-chat.js';

async function fixture(work:(v:{p:Points;viewer:string})=>Promise<void>){
 const {mkdtemp}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const directory=await mkdtemp(join(tmpdir(),'plot-extra-'));
 try{
  const p=new Points(directory);await p.load();
  const identity=(id:string,login:string)=>({id,login,displayName:login,linkedAt:new Date().toISOString()});
  const owner=await p.walletLogin('owner-wallet');await p.linkTwitch(owner.token,identity('123','owner'));await p.setBotEnabled(owner.token,true);
  const viewerAccount=await p.createAccount();await p.linkTwitch(viewerAccount.token,identity('456','viewer'));
  await work({p,viewer:viewerAccount.token});
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
