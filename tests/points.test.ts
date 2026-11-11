import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {Points,STARTING_POINTS} from '../src/points.js';
import {demoPrediction} from '../src/mirror.js';
async function fixture(run:(points:Points,dir:string)=>Promise<void>){const dir=await mkdtemp(`${tmpdir()}/points-test-`);try{const p=new Points(dir);await p.load();await run(p,dir);}finally{await rm(dir,{recursive:true,force:true});}}
test('separate accounts debit atomically, settle a shared pool, persist and cannot claim twice',()=>fixture(async(p,dir)=>{
  const a=await p.walletLogin(`fixture-${randomUUID()}`),b=await p.walletLogin(`fixture-${randomUUID()}`);const source=demoPrediction();const m=await p.accept(source,true);
  assert.equal(m.totalPoints,0);assert.equal(p.me(a.token).balance,STARTING_POINTS);
  const id=randomUUID();await Promise.all(Array.from({length:5},()=>p.bet(a.token,m.key,'victory',300,id)));
  await p.bet(b.token,m.key,'defeat',700,randomUUID());assert.equal(p.market(m.key).totalPoints,1000);assert.equal(p.me(a.token).balance,9700);
  await assert.rejects(p.bet(a.token,m.key,'defeat',300,id),/reutilizado/);
  await p.demoResolve(m.key,'victory');assert.equal(p.me(a.token).claimable,1000);assert.equal(p.me(b.token).claimable,0);
  const claimId=randomUUID();await Promise.all(Array.from({length:5},()=>p.claim(a.token,m.key,claimId)));
  assert.equal(p.me(a.token).balance,10700);assert.equal(p.me(b.token).balance,9300);
  await assert.rejects(p.claim(a.token,m.key,randomUUID()),/pendientes/);
  const loaded=new Points(dir);await loaded.load();assert.equal(loaded.me(a.token).balance,10700);assert.equal(loaded.me(a.token).bets[0].claimed,true);
  await loaded.claim(a.token,m.key,claimId);assert.equal(loaded.me(a.token).balance,10700);
  assert.equal(loaded.me(a.token).balance+loaded.me(b.token).balance,2*STARTING_POINTS);
}));
test('concurrent spend never overdraws, rejects fractional/negative points and bad identities',()=>fixture(async p=>{
  const a=await p.walletLogin(`fixture-${randomUUID()}`);const m=await p.accept(demoPrediction(),true);
  const results=await Promise.allSettled([p.bet(a.token,m.key,'victory',7000,randomUUID()),p.bet(a.token,m.key,'defeat',7000,randomUUID())]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(p.me(a.token).balance,3000);
  for(const amount of [-1,0,.5,NaN,Infinity,1_000_001])await assert.rejects(p.bet(a.token,m.key,'victory',amount,randomUUID()));
  await assert.rejects(p.bet('invalid',m.key,'victory',1,randomUUID()),/Sesión/);
  await assert.rejects(p.bet(a.token,m.key,'unknown',1,randomUUID()),/Opción/);
  assert.equal(p.market(m.key).totalPoints,7000);
}));
test('integer payouts conserve the whole pool; cancellation and zero winners refund all stakes',()=>fixture(async p=>{
  const a=await p.walletLogin(`fixture-${randomUUID()}`),b=await p.walletLogin(`fixture-${randomUUID()}`),c=await p.walletLogin(`fixture-${randomUUID()}`);const m=await p.accept(demoPrediction(),true);
  await p.bet(a.token,m.key,'victory',1,randomUUID());await p.bet(b.token,m.key,'victory',2,randomUUID());await p.bet(c.token,m.key,'defeat',7,randomUUID());
  await p.demoResolve(m.key,'victory');assert.equal(p.me(a.token).claimable+p.me(b.token).claimable,10);
  for(const winner of [null,'defeat']){const m2=await p.accept(demoPrediction(),true);await p.bet(a.token,m2.key,'victory',100,randomUUID());await p.demoResolve(m2.key,winner);assert.equal(p.market(m2.key).phase,'void');assert.equal(p.me(a.token).bets.find(b=>b.marketKey===m2.key)?.payout,100);}
}));
test('source locks, deadline and stale verification reject bets; terminal results cannot regress',()=>fixture(async(p,dir)=>{
  const account=await p.walletLogin(`fixture-${randomUUID()}`);const source=demoPrediction();const m=await p.accept(source);
  await p.bet(account.token,m.key,'victory',100,randomUUID());await p.accept({...source,status:'LOCKED'});
  await assert.rejects(p.bet(account.token,m.key,'defeat',100,randomUUID()),/cerrada/);
  await p.accept(source);assert.equal(p.market(m.key).phase,'locked');
  await p.accept({...source,status:'RESOLVED',winningOutcomeId:'victory'});await p.accept({...source,status:'CANCELED'});assert.equal(p.market(m.key).phase,'resolved');
  await assert.rejects(p.accept({...source,status:'RESOLVED',winningOutcomeId:'defeat'}),/otro ganador/);
  await assert.rejects(p.accept({...source,title:'changed'}),/identidad/);
  const second=await p.accept(demoPrediction());const raw=JSON.parse(await readFile(`${dir}/points.json`,'utf8'));raw.markets[second.key].sourceCheckedAt=new Date(Date.now()-60_000).toISOString();await writeFile(`${dir}/points.json`,JSON.stringify(raw));const loaded=new Points(dir);await loaded.load();
  await assert.rejects(loaded.bet(account.token,second.key,'victory',1,randomUUID()),/actualizar/);
  const expired={...demoPrediction(),createdAt:new Date(Date.now()-2000).toISOString(),predictionWindowSeconds:1};await assert.rejects(p.accept(expired),/abierta/);
}));

test('failed disk commit cannot debit points and the operation queue recovers',()=>fixture(async(p,dir)=>{
  const a=await p.walletLogin(`fixture-${randomUUID()}`);const m=await p.accept(demoPrediction(),true);
  await rename(`${dir}/points.json`,`${dir}/points.backup`);await mkdir(`${dir}/points.json`);
  const id=randomUUID();await assert.rejects(p.bet(a.token,m.key,'victory',200,id));
  assert.equal(p.me(a.token).balance,10000);assert.equal(p.market(m.key).totalPoints,0);
  await rm(`${dir}/points.json`,{recursive:true});await rename(`${dir}/points.backup`,`${dir}/points.json`);
  await p.bet(a.token,m.key,'victory',200,id);assert.equal(p.me(a.token).balance,9800);
}));

test('registered streamers cannot make new HTTP or chat bets, while viewers keep betting',()=>fixture(async p=>{
  const owner=await p.walletLogin('streamer-wallet');await p.linkTwitch(owner.token,{id:'91001',login:'owner',displayName:'Owner',linkedAt:new Date().toISOString()});await p.setBotEnabled(owner.token,true);
  const created=await p.plotCommand('91001','91001',{kind:'create',title:'¿Ganamos?',options:['Sí','No']},'create-policy-market');
  const other=await p.accept(demoPrediction(),true);const before=p.me(owner.token);
  for(const market of [{key:created.key,outcome:'1'},{key:other.key,outcome:'victory'}]){
    await assert.rejects(p.bet(owner.token,market.key,market.outcome,100,randomUUID()),/streamer/);
    await assert.rejects(p.chatBet('91001',market.key,market.outcome,randomUUID()),/streamer/);
  }
  await assert.rejects(p.plotCommand('91001','91001',{kind:'bet',id:p.market(created.key).shortId,option:1},'owner-chat-bet'),/streamer/);
  assert.deepEqual(p.me(owner.token),before);assert.equal(p.market(created.key).totalPoints,0);
  const viewer=await p.createAccount();await p.linkTwitch(viewer.token,{id:'91002',login:'viewer',displayName:'Viewer',linkedAt:new Date().toISOString()});
  await p.bet(viewer.token,created.key,'1',100,randomUUID());await p.chatBet('91002',created.key,'2',randomUUID());
  assert.equal(p.me(viewer.token).balance,9800);assert.equal(p.market(created.key).totalPoints,200);
}));

test('a viewer becoming a streamer can replay an old receipt without debiting again',()=>fixture(async p=>{
  const account=await p.walletLogin('later-streamer');const market=await p.accept(demoPrediction(),true),id=randomUUID();
  const receipt=await p.bet(account.token,market.key,'victory',100,id);
  await p.linkTwitch(account.token,{id:'91003',login:'new_streamer',displayName:'New streamer',linkedAt:new Date().toISOString()});
  assert.deepEqual(await p.bet(account.token,market.key,'victory',100,id),receipt);
  await assert.rejects(p.bet(account.token,market.key,'victory',100,randomUUID()),/streamer/);
  assert.equal(p.me(account.token).balance,9900);assert.equal(p.market(market.key).totalPoints,100);
}));

test('no winning bets keep the void/refund policy and expose an explicit cancellation reason',()=>fixture(async p=>{
 const owner=await p.walletLogin('resolve-owner');await p.linkTwitch(owner.token,{id:'97020',login:'resolve_owner',displayName:'Owner',linkedAt:new Date().toISOString()});
 await p.setBotEnabled(owner.token,true);
 const viewer=await p.loginWithTwitch({id:'97021',login:'resolve_viewer',displayName:'Viewer',linkedAt:new Date().toISOString()});
 for(const withBet of [false,true]){
  const {key}=await p.plotCommand('97020','97020',{kind:'create',title:'¿Resultado?',options:['Sí','No']},randomUUID());
  if(withBet)await p.bet(viewer.token,key,'1',100,randomUUID());
  await p.streamerAction(owner.token,{key,action:'lock',requestId:randomUUID()});
  const preview=p.previewSettlement(owner.token,key,'2');assert.equal(preview.phase,'void');
  assert.match(preview.reason!,withBet?/No hubo apuestas a la opción ganadora/:/no recibió apuestas/);
  const action={key,action:'resolve' as const,winnerId:'2',requestId:randomUUID()};
  await p.streamerAction(owner.token,action);await p.streamerAction(owner.token,action);
  const market=p.market(key);assert.equal(market.phase,'void');assert.equal(market.winnerId,'2');
  assert.equal(market.reason,preview.reason);assert.equal(p.me(viewer.token).balance,10000);
  assert.equal(p.me(viewer.token).ledger.filter(l=>l.marketKey===key&&l.kind==='refund').length,withBet?1:0);
 }
}));
