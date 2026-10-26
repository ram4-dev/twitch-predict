import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,rename,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {Points,type StreamerAction} from '../src/points.js';
import {demoPrediction} from '../src/mirror.js';
async function fixture(run:(p:Points,dir:string)=>Promise<void>){const dir=await mkdtemp(`${tmpdir()}/settlement-`);try{const p=new Points(dir);await p.load();await run(p,dir);}finally{await rm(dir,{recursive:true,force:true});}}
function action(p:Points,token:string,key:string,kind:StreamerAction['action'],winnerId?:string){return p.streamerAction(token,{key,action:kind,winnerId,requestId:randomUUID()});}
test('streamer authorization, wallet snapshots, preview, locking and immutable result survive restart',()=>fixture(async(p,dir)=>{
  const owner=await p.walletLogin('owner'),a=await p.walletLogin('wallet-a'),b=await p.walletLogin('wallet-b');
  const source=demoPrediction(),m=await p.accept(source);
  await p.assignStreamer(source.channel,'owner');await assert.rejects(p.assignStreamer(source.channel,'wallet-a'),/asignada/);
  await assert.rejects(action(p,a.token,m.key,'lock'),/permisos/);assert.equal(p.streamerConsole(a.token).markets.length,0);
  await p.bet(a.token,m.key,'victory',1,randomUUID());await p.bet(a.token,m.key,'victory',2,randomUUID());await p.bet(b.token,m.key,'defeat',7,randomUUID());
  assert.equal(p.streamerConsole(owner.token).markets[0].bets[0].wallet,'wallet-a');
  assert.throws(()=>p.previewSettlement(owner.token,m.key,'victory'),/Cerrá/);await assert.rejects(action(p,owner.token,m.key,'resolve','victory'),/Cerrá/);
  await action(p,owner.token,m.key,'lock');await p.accept(source);assert.equal(p.market(m.key).canBet,false);
  await assert.rejects(p.bet(a.token,m.key,'victory',5,randomUUID()),/cerrada/);
  const preview=p.previewSettlement(owner.token,m.key,'victory');assert.equal(preview.bets.reduce((n,b)=>n+b.payout,0),10);assert.equal(p.me(a.token).claimable,0);
  await action(p,owner.token,m.key,'resolve','victory');await p.accept({...source,status:'RESOLVED',winningOutcomeId:'defeat'});assert.equal(p.market(m.key).winnerId,'victory');
  await assert.rejects(action(p,owner.token,m.key,'resolve','defeat'),/resuelto/);
  const loaded=new Points(dir);await loaded.load();assert.equal(loaded.market(m.key).settlement?.wallet,'owner');assert.equal(loaded.me(a.token).claimable,10);assert.equal(loaded.streamerConsole(owner.token).markets[0].bets.length,3);
}));
test('batch distribution and consumer claims race safely, credit offline wallets once and conserve pool',()=>fixture(async(p,dir)=>{
  const owner=await p.walletLogin('owner'),a=await p.walletLogin('wallet-a'),b=await p.walletLogin('wallet-b'),c=await p.walletLogin('wallet-c');
  const source=demoPrediction(),m=await p.accept(source,true);await p.assignStreamer(source.channel,'owner');
  await p.bet(a.token,m.key,'victory',100,randomUUID());await p.bet(b.token,m.key,'victory',300,randomUUID());await p.bet(c.token,m.key,'defeat',600,randomUUID());
  await action(p,owner.token,m.key,'lock');await action(p,owner.token,m.key,'resolve','victory');
  const request={key:m.key,action:'distribute' as const,requestId:randomUUID()};
  await Promise.allSettled([p.claim(a.token,m.key,randomUUID()),p.streamerAction(owner.token,request),p.streamerAction(owner.token,request)]);
  assert.equal(p.me(a.token).balance,10150);assert.equal(p.me(b.token).balance,10450);assert.equal(p.me(c.token).balance,9400);
  assert.equal(p.streamerConsole(owner.token).markets[0].pending,0);assert.equal(p.streamerConsole(owner.token).markets[0].credited,1000);
  await assert.rejects(p.claim(b.token,m.key,randomUUID()),/pendientes/);assert.equal((await action(p,owner.token,m.key,'distribute')).paid,0);
  const loaded=new Points(dir);await loaded.load();await loaded.streamerAction(owner.token,request);assert.equal(loaded.me(b.token).balance,10450);assert.equal(loaded.me(b.token).ledger.filter(l=>l.kind==='distribution').length,1);
  assert.equal([a,b,c].reduce((n,x)=>n+loaded.me(x.token).balance,0),30000);
}));
test('cancel and no winning bets refund every wallet and repeated distributions are harmless',()=>fixture(async p=>{
  const owner=await p.walletLogin('owner'),a=await p.walletLogin('a');await p.assignStreamer('demo_streamer','owner');
  for(const kind of ['cancel','resolve'] as const){const m=await p.accept(demoPrediction(),true);await p.bet(a.token,m.key,'victory',200,randomUUID());await action(p,owner.token,m.key,'lock');await action(p,owner.token,m.key,kind,'defeat');assert.equal(p.market(m.key).phase,'void');await action(p,owner.token,m.key,'distribute');await action(p,owner.token,m.key,'distribute');assert.equal(p.me(a.token).balance,10000);}
}));
test('Twitch automatic resolution is visible to streamer and can be distributed without changing winner',()=>fixture(async p=>{
  const owner=await p.walletLogin('owner'),a=await p.walletLogin('a');const source=demoPrediction();await p.assignStreamer(source.channel,'owner');const m=await p.accept(source);
  await p.bet(a.token,m.key,'victory',300,randomUUID());await p.accept({...source,status:'RESOLVED',winningOutcomeId:'victory'});
  assert.equal(p.market(m.key).settlement?.source,'twitch');await assert.rejects(action(p,owner.token,m.key,'cancel'),/resuelto/);await action(p,owner.token,m.key,'distribute');assert.equal(p.me(a.token).balance,10000);
}));
test('failed batch persistence credits nobody and successful retry credits exactly once',()=>fixture(async(p,dir)=>{
  const owner=await p.walletLogin('owner'),a=await p.walletLogin('a');const source=demoPrediction();await p.assignStreamer(source.channel,'owner');const m=await p.accept(source,true);await p.bet(a.token,m.key,'victory',500,randomUUID());await p.demoResolve(m.key,'victory');
  await rename(`${dir}/points.json`,`${dir}/points.backup`);await mkdir(`${dir}/points.json`);await assert.rejects(action(p,owner.token,m.key,'distribute'));assert.equal(p.me(a.token).balance,9500);assert.equal(p.me(a.token).claimable,500);
  await rm(`${dir}/points.json`,{recursive:true});await rename(`${dir}/points.backup`,`${dir}/points.json`);await action(p,owner.token,m.key,'distribute');assert.equal(p.me(a.token).balance,10000);
}));
