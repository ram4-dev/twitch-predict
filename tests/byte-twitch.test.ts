import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {ByteService} from '../src/byte.js';
import {ByteTwitchMirror} from '../src/byte-twitch.js';
import {BYTE_PROGRAM,type ByteMarket} from '../src/byte-model.js';
import type {Prediction} from '../src/prediction.js';
async function fixture(run:(f:{mirror:ByteTwitchMirror;byte:ByteService;set(p:Prediction):void;prediction:Prediction;market():ByteMarket;counts:{create:number;resolve:number;invalidate:number};restart():Promise<ByteTwitchMirror>;advance(ms:number):void})=>Promise<void>,short=false,ambiguous=false,rateLimit=false){
 const dir=await mkdtemp(`${tmpdir()}/byte-mirror-`);let prediction:Prediction={id:'twitch-id',channel:'eggsterr',title:'EVEN OR ODD KILLS',status:'ACTIVE',createdAt:new Date().toISOString(),predictionWindowSeconds:short?60:600,outcomes:[{id:'even',title:'EVENNNNZ :D'},{id:'odd',title:'ODDSTERR :O'}]};
 let market:ByteMarket,offset=0;const counts={create:0,resolve:0,invalidate:0};
 const transport:typeof fetch=async(url,options)=>{
  if(String(url).endsWith('/api/bets/open'))return Response.json({enabled:true,sol:{cluster:'devnet',programId:BYTE_PROGRAM,maxBet:100000000,maxPool:2000000000}});
  if(options?.method==='POST'){
   const body=JSON.parse(String(options.body));
   if(String(url).endsWith('/resolve')){counts.resolve++;market.status='resolved';market.winner=body.winner;market.bettable=false;}
   else if(String(url).endsWith('/invalidate')){counts.invalidate++;market.status='invalid';market.bettable=false;}
   else{counts.create++;if(rateLimit&&counts.create===1)return Response.json({}, {status:429});if(ambiguous)throw new Error('timeout');market={id:'pm_mirror',title:body.title,options:body.options,currency:'sol',status:'open',bettable:true,resolvable:false,openMs:Date.now(),closeMs:Date.now()+body.windowSecs*1000,chain:{market:'11111111111111111111111111111111',settled:false},pools:[0,0],total:0,bettors:0,winner:null,invalidReason:null};}
  }
  return Response.json({market});
 };
 const source={active:async()=>prediction.status==='ACTIVE'?[prediction]:[],prediction:async()=>prediction};
 const byte=new ByteService(dir,'test-only-key',undefined,transport);await byte.load();
 const mirror=new ByteTwitchMirror(dir,byte,source,()=>Date.now()+offset);await mirror.load();
 try{await run({mirror,byte,prediction,set:p=>{prediction=p;},market:()=>market,counts,advance:ms=>{offset+=ms;},restart:async()=>{const b=new ByteService(dir,'test-only-key',undefined,transport);await b.load();const m=new ByteTwitchMirror(dir,b,source,()=>Date.now()+offset);await m.load();return m;}});}finally{await rm(dir,{recursive:true,force:true});}
}
test('one Twitch ID creates one Byte market, survives restart and maps reordered outcome IDs to the correct winner',()=>fixture(async f=>{
 await Promise.all([f.mirror.watch('eggsterr'),f.mirror.watch('eggsterr')]);assert.equal(f.counts.create,1);assert.deepEqual(f.market().options,['EVENNNNZ :D','ODDSTERR :O']);
 const restarted=await f.restart();await restarted.watch('eggsterr');assert.equal(f.counts.create,1);
 f.market().closeMs=Date.now()-1;f.set({...f.prediction,status:'RESOLVED',winningOutcomeId:'odd',outcomes:[...f.prediction.outcomes].reverse()});await restarted.sync();assert.equal(f.counts.resolve,1);assert.equal(f.market().winner,1);
 await restarted.sync();assert.equal(f.counts.resolve,1);
}));
test('short or closed windows do not create an extended market',()=>fixture(async f=>{const state=await f.mirror.watch('eggsterr');assert.equal(f.counts.create,0);assert.match(state.predictions[0].market.error!,/60 segundos/);},true));
test('early lock refunds rather than keeping chain bets open past Twitch; manual override is rejected',()=>fixture(async f=>{
 await f.mirror.watch('eggsterr');await assert.rejects(f.byte.settle(f.market().id,null,'Override manual no autorizado'),/Twitch/);
 f.set({...f.prediction,status:'LOCKED'});await f.mirror.sync();assert.equal(f.counts.invalidate,1);assert.equal(f.market().status,'invalid');
}));
test('ambiguous upstream creation is never duplicated by polling or restart',()=>fixture(async f=>{
 const first=await f.mirror.watch('eggsterr');assert.equal(first.predictions[0].market.state,'failed');await f.mirror.watch('eggsterr');const restarted=await f.restart();await restarted.watch('eggsterr');assert.equal(f.counts.create,1);
},false,true));

test('429 rejection retries safely with a shorter window after restart',()=>fixture(async f=>{
 const first=await f.mirror.watch('eggsterr');assert.equal(first.predictions[0].market.state,'failed');assert.match(first.predictions[0].market.error!,/límite/);assert.equal(first.predictions[0].market.rateLimited,true);assert.equal(first.predictions[0].market.byteMarketId,undefined);
 const restarted=await f.restart();assert.equal((await restarted.watch('eggsterr')).predictions[0].market.rateLimited,true);assert.equal(f.counts.create,1);
 f.advance(31000);await restarted.watch('eggsterr');assert.equal(f.counts.create,2);const recovered=(await restarted.watch('eggsterr')).predictions[0];assert.equal(recovered.market.state,'created');assert.equal(recovered.market.rateLimited,false);
},false,false,true));

for(const status of ['RESOLVED','CANCELED'] as const)test(`429 preview tracks lock and ${status} after disappearing from active Twitch events`,()=>fixture(async f=>{
 await f.mirror.watch('eggsterr');f.advance(601000);
 f.set({...f.prediction,status:'LOCKED',lockedAt:new Date().toISOString()});
 const locked=await f.restart();await locked.sync();const first=locked.snapshot('eggsterr')[0];assert.equal(first.prediction.status,'LOCKED');assert.equal(first.market.rateLimited,true);assert.equal(first.market.byteMarketId,undefined);
 f.set({...f.prediction,status,winningOutcomeId:status==='RESOLVED'?'odd':null,endedAt:new Date().toISOString(),outcomes:[...f.prediction.outcomes].reverse()});
 const settled=await f.restart();await settled.sync();const final=settled.snapshot('eggsterr')[0];assert.equal(final.prediction.status,status);assert.equal(final.market.state,'resolved');assert.equal(final.market.rateLimited,true);assert.equal(final.market.error,null);
 const restored=await f.restart();await restored.sync();assert.equal(restored.snapshot('eggsterr')[0].prediction.status,status);assert.deepEqual(f.counts,{create:1,resolve:0,invalidate:0});
},false,false,true));
