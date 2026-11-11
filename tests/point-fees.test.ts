import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {Points} from '../src/points.js';
import {pointFees} from '../src/point-fees.js';
import {demoPrediction} from '../src/mirror.js';

async function fixture(work:(p:Points,dir:string)=>Promise<void>){
 const dir=await mkdtemp(`${tmpdir()}/point-fees-`);
 try{const p=new Points(dir);await p.load();await work(p,dir);}finally{await rm(dir,{recursive:true,force:true});}
}
const identity=(id:string,login:string)=>({id,login,displayName:login,linkedAt:new Date().toISOString()});
const action=(p:Points,token:string,key:string,kind:'lock'|'resolve'|'cancel'|'distribute',winnerId?:string)=>p.streamerAction(token,{key,action:kind,winnerId,requestId:randomUUID()});
const state=(p:Points)=>JSON.parse(p.exportStateJson());

test('integer commission shares round down symmetrically and every point stays assigned',()=>{
 for(const pool of [...Array.from({length:301},(_,i)=>i),1000,10001,Number.MAX_SAFE_INTEGER]){
  const fee=pointFees(pool),share=Number(BigInt(pool)*2n/100n);
  assert.equal(fee.streamer,share);assert.equal(fee.platform,share);
  assert.equal(BigInt(fee.streamer)+BigInt(fee.platform)+BigInt(fee.winners),BigInt(pool));
 }
 assert.deepEqual(pointFees(1000),{version:1,pool:1000,streamer:20,platform:20,winners:960});
 for(const bad of [-1,.1,Infinity,NaN,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>pointFees(bad));
});

test('settlement credits 2% to owner and Plot, reserves 96% for winners, and retries never double-credit',()=>fixture(async(p,dir)=>{
 const owner=await p.walletLogin('owner');await p.assignStreamer('demo_streamer','owner');
 const a=await p.walletLogin('winner-a'),b=await p.walletLogin('winner-b'),loser=await p.walletLogin('loser');
 const market=await p.accept(demoPrediction(),true);
 await p.bet(a.token,market.key,'victory',100,randomUUID());await p.bet(b.token,market.key,'victory',300,randomUUID());await p.bet(loser.token,market.key,'defeat',600,randomUUID());
 await action(p,owner.token,market.key,'lock');
 const before=p.exportStateJson(),preview=p.previewSettlement(owner.token,market.key,'victory');
 assert.equal(p.exportStateJson(),before);assert.deepEqual(preview.fees,pointFees(1000));
 assert.equal(preview.bets.reduce((sum,b)=>sum+b.payout,0),960);
 const intent={key:market.key,action:'resolve' as const,winnerId:'victory',requestId:randomUUID()};
 await Promise.all([p.streamerAction(owner.token,intent),p.streamerAction(owner.token,intent)]);
 assert.equal(p.me(owner.token).balance,10020);assert.equal(p.me(owner.token).streamerEarnings,20);
 assert.equal(state(p).platformRevenue.balance,20);assert.equal(state(p).platformRevenue.credits.length,1);
 await Promise.allSettled([p.claim(a.token,market.key,randomUUID()),action(p,owner.token,market.key,'distribute')]);
 assert.equal(p.me(a.token).balance,10140);assert.equal(p.me(b.token).balance,10420);assert.equal(p.me(loser.token).balance,9400);
 assert.equal([owner,a,b,loser].reduce((sum,u)=>sum+p.me(u.token).balance,0)+state(p).platformRevenue.balance,40000);
 const restored=new Points(dir);await restored.load();await restored.streamerAction(owner.token,intent);
 assert.equal(restored.me(owner.token).streamerEarnings,20);assert.equal(state(restored).platformRevenue.balance,20);
}));

test('canceled and no-winning-bet markets refund all stakes without charging either share',()=>fixture(async p=>{
 const owner=await p.walletLogin('owner');await p.assignStreamer('demo_streamer','owner');const viewer=await p.walletLogin('viewer');
 for(const winner of [undefined,'defeat']){
  const m=await p.accept(demoPrediction(),true);await p.bet(viewer.token,m.key,'victory',1000,randomUUID());await action(p,owner.token,m.key,'lock');
  assert.equal(p.previewSettlement(owner.token,m.key,winner??null).fees,undefined);
  await action(p,owner.token,m.key,winner?'resolve':'cancel',winner);
  assert.equal(p.market(m.key).phase,'void');assert.equal(p.me(viewer.token).balance,10000);assert.equal(p.market(m.key).fees,undefined);
 }
 assert.equal(state(p).platformRevenue,undefined);assert.equal(p.me(owner.token).streamerEarnings,0);
}));

test('fees for an unregistered broadcaster stay reserved until verified Twitch ownership, then release once',()=>fixture(async p=>{
 const viewer=await p.walletLogin('viewer'),raw={...demoPrediction(),channel:'future_streamer'};
 const m=await p.accept(raw);await p.bet(viewer.token,m.key,'victory',1000,randomUUID());
 await p.accept({...raw,status:'RESOLVED',winningOutcomeId:'victory'});
 assert.equal(state(p).pendingStreamerFees[m.key].amount,20);
 const wrong=await p.loginWithTwitch(identity('8801','unrelated'));assert.equal(p.me(wrong.token).streamerEarnings,0);
 const owner=await p.loginWithTwitch(identity('8802','future_streamer'));
 assert.equal(p.me(owner.token).balance,10020);assert.equal(p.me(owner.token).streamerEarnings,20);assert.deepEqual(state(p).pendingStreamerFees,{});
 await p.loginWithTwitch(identity('8802','future_streamer'));assert.equal(p.me(owner.token).streamerEarnings,20);
 await p.accept({...raw,status:'RESOLVED',winningOutcomeId:'victory'});assert.equal(state(p).platformRevenue.balance,20);
}));

test('failed settlement storage commits no fee or payout; retry succeeds once',()=>fixture(async(p,dir)=>{
 const owner=await p.walletLogin('owner');await p.assignStreamer('demo_streamer','owner');const viewer=await p.walletLogin('viewer');
 const m=await p.accept(demoPrediction(),true);await p.bet(viewer.token,m.key,'victory',1000,randomUUID());await action(p,owner.token,m.key,'lock');
 const before=p.exportStateJson(),intent={key:m.key,action:'resolve' as const,winnerId:'victory',requestId:randomUUID()};
 await rename(`${dir}/points.json`,`${dir}/backup`);await mkdir(`${dir}/points.json`);
 await assert.rejects(p.streamerAction(owner.token,intent));assert.equal(p.exportStateJson(),before);
 await rm(`${dir}/points.json`,{recursive:true});await rename(`${dir}/backup`,`${dir}/points.json`);
 await p.streamerAction(owner.token,intent);assert.equal(p.me(owner.token).streamerEarnings,20);assert.equal(state(p).platformRevenue.balance,20);
}));

test('already settled legacy payouts are not recalculated or retroactively charged',()=>fixture(async(p,dir)=>{
 const viewer=await p.walletLogin('viewer'),raw=demoPrediction(),m=await p.accept(raw,true);
 await p.bet(viewer.token,m.key,'victory',1000,randomUUID());
 const saved=state(p);saved.markets[m.key].phase='resolved';saved.markets[m.key].prediction.status='RESOLVED';saved.markets[m.key].prediction.winningOutcomeId='victory';saved.markets[m.key].winnerId='victory';saved.bets[0].payout=1000;
 await writeFile(`${dir}/points.json`,JSON.stringify(saved));const restored=new Points(dir);await restored.load();
 await restored.accept({...raw,status:'RESOLVED',winningOutcomeId:'victory'},true);
 assert.equal(restored.market(m.key).fees,undefined);assert.equal(state(restored).platformRevenue,undefined);
 await restored.claim(viewer.token,m.key,randomUUID());assert.equal(restored.me(viewer.token).balance,10000);
 const disk=JSON.parse(await readFile(`${dir}/points.json`,'utf8'));assert.equal(disk.bets[0].payout,1000);
}));

test('a known Twitch owner keeps royalties across unlink/rename; a reused login cannot claim them',()=>fixture(async p=>{
 const owner=await p.walletLogin('known-owner');await p.linkTwitch(owner.token,identity('8810','known_streamer'));
 const viewer=await p.walletLogin('viewer'),raw={...demoPrediction(),channel:'known_streamer'};
 const m=await p.accept(raw);assert.equal(m.ownerTwitchId,'8810');await p.bet(viewer.token,m.key,'victory',1000,randomUUID());
 await p.unlinkTwitch(owner.token);const impostor=await p.loginWithTwitch(identity('8811','known_streamer'));
 await p.accept({...raw,status:'RESOLVED',winningOutcomeId:'victory'});
 assert.equal(p.me(impostor.token).streamerEarnings,0);assert.equal(state(p).pendingStreamerFees[m.key].twitchId,'8810');
 await p.linkTwitch(owner.token,identity('8810','renamed_streamer'));
 assert.equal(p.me(owner.token).streamerEarnings,20);assert.deepEqual(state(p).pendingStreamerFees,{});
}));
