import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {randomUUID} from 'node:crypto';
import {Documents} from '../src/cloud/documents.js';
import {PostgresMockPaymentProvider} from '../src/cloud/plot/payment.js';
import {PaymentReconciler} from '../src/cloud/plot/reconcile.js';
import {TwitchProjection} from '../src/cloud/plot/twitch.js';
import type {CreditReceipt,PlotChain} from '../src/cloud/plot/chain.js';
const url=process.env.PLOT_STAGING_DATABASE_URL;
test('Postgres mock survives restart and duplicate reconciliation credits once', {skip:!url},async()=>{
 const d=new Documents(url!,`plot_test_${randomUUID()}`);await d.migrate();try{
  let receipt:CreditReceipt|null=null,submissions=0;
  const chain:PlotChain={async findPaymentReceipt(){return receipt;},async submitCredit(input){submissions++;receipt={...input,signature:null,finalized:true};return 'test-signature';}};
  let provider=new PostgresMockPaymentProvider(d.pool,d.namespace);let service=new PaymentReconciler(d.pool,d.namespace,provider,chain);
  await service.create({id:'purchase',wallet:'wallet',amount:'600'});await provider.confirm('purchase','wallet');
  provider=new PostgresMockPaymentProvider(d.pool,d.namespace);service=new PaymentReconciler(d.pool,d.namespace,provider,chain);
  await Promise.all([service.reconcile('purchase'),service.reconcile('purchase')]);await service.reconcile('purchase');
  assert.equal(submissions,1);assert.equal((await provider.getOrder('purchase'))?.status,'paid');
  const stored=await d.pool.query('SELECT signature FROM plot_private.plot_payment_orders WHERE namespace=$1 AND id=$2',[d.namespace,'purchase']);assert.equal(stored.rows[0].signature,'test-signature');
  await assert.rejects(service.create({id:'purchase',wallet:'other',amount:'600'}));
 }finally{await d.pool.query('DELETE FROM plot_private.plot_mock_payments WHERE namespace=$1',[d.namespace]);await d.pool.query('DELETE FROM plot_private.plot_payment_orders WHERE namespace=$1',[d.namespace]);await d.close();}
});
test('Twitch rejects unverified broadcaster and deduplicates late events', {skip:!url},async()=>{
 const d=new Documents(url!,`plot_test_${randomUUID()}`);await d.migrate();try{
  const p=new TwitchProjection(d.pool,d.namespace),input={broadcaster:'b',prediction:'p',outcomes:['yes','no'],closesAt:'2030-01-01T00:00:00Z',timeoutAt:'2030-01-02T00:00:00Z'};
  await assert.rejects(p.register({wallet:'w',twitch:{id:'other'}},input));await p.register({wallet:'w',twitch:{id:'b'}},input);
  const end={id:'end',broadcaster:'b',prediction:'p',kind:'resolve' as const,winner:'yes',source:'helix' as const};
  await p.ingest(end);await p.ingest(end);await p.ingest({...end,id:'lock',kind:'lock',winner:undefined});
  const {rows}=await d.pool.query('SELECT phase,winner FROM plot_private.plot_twitch_markets WHERE namespace=$1',[d.namespace]);assert.deepEqual(rows[0],{phase:'resolved',winner:'yes'});
  await assert.rejects(p.ingest({...end,winner:'no'}));
 }finally{await d.pool.query('DELETE FROM plot_private.plot_chain_commands WHERE namespace=$1',[d.namespace]);await d.pool.query('DELETE FROM plot_private.plot_twitch_events WHERE namespace=$1',[d.namespace]);await d.pool.query('DELETE FROM plot_private.plot_twitch_markets WHERE namespace=$1',[d.namespace]);await d.close();}
});

test('HTTP order, duplicate confirmation and reconciliation through cloud app', {skip:!url||!process.env.PORTLESS_URL},async()=>{
 const {cloudApp}=await import('../src/cloud/app.js');const d=new Documents(url!,`plot_test_${randomUUID()}`);await d.migrate();
 let receipt:CreditReceipt|null=null,submissions=0;
 const chain:PlotChain={async findPaymentReceipt(){return receipt;},async submitCredit(input){submissions++;receipt={...input,signature:'fixture',finalized:true};return 'fixture';}};
 const mock=new PostgresMockPaymentProvider(d.pool,d.namespace),payments=new PaymentReconciler(d.pool,d.namespace,mock,chain);
 const {Router}=await import('express');const sponsor=Router();sponsor.get('/probe',(_req,res)=>res.json({ok:true}));
 const app=cloudApp(d,{AUTH_ORIGIN:'https://plot.example',DATABASE_URL:url!,PLOT_NAMESPACE:d.namespace},{mock,payments,intentsRouter:sponsor,accountRead:async wallet=>({wallet,balance:'600',positions:[],readStatus:'finalized'}),allowMockConfirmation:true,actor:async req=>{if(req.get('authorization')!=='Bearer fixture')throw new Error('unauthorized');return {id:'user',wallet:'wallet',twitch:null};}});
 const server=app.listen(Number(process.env.PORT),'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
 const base=process.env.PORTLESS_URL!;const post=(path:string,body:unknown={})=>fetch(`${base}/api/plot/v1${path}`,{method:'POST',headers:{authorization:'Bearer fixture','content-type':'application/json'},body:JSON.stringify(body)});
 try{
  const account=await fetch(`${base}/api/plot/v1/account`,{headers:{authorization:'Bearer fixture'}});assert.equal(account.status,200);assert.equal((await account.json() as {balance:string}).balance,'600');
  assert.equal((await fetch(`${base}/api/plot/v1/intents/probe`)).status,200);
  const order=await post('/orders',{idempotencyKey:'purchase',package:'small'});assert.equal(order.status,200);assert.equal((await order.json() as {amount:string}).amount,'600');
  assert.equal((await post('/orders/purchase/confirm')).status,200);assert.equal((await post('/orders/purchase/confirm')).status,200);
  assert.equal((await post('/orders/purchase/reconcile')).status,200);assert.equal((await post('/orders/purchase/reconcile')).status,200);assert.equal(submissions,1);
 }finally{app.locals.liveMarkets.close();await new Promise<void>(resolve=>server.close(()=>resolve()));await d.pool.query('DELETE FROM plot_private.plot_mock_payments WHERE namespace=$1',[d.namespace]);await d.pool.query('DELETE FROM plot_private.plot_payment_orders WHERE namespace=$1',[d.namespace]);await d.close();}
});

test('worker locks before resolving and cancels on timeout with Twitch offline', {skip:!url},async()=>{
 const {reconcileTwitchMarkets,runTwitchCycle}=await import('../src/cloud/plot/twitch.js');
 const d=new Documents(url!,`plot_test_${randomUUID()}`);await d.migrate();try{
  const p=new TwitchProjection(d.pool,d.namespace),input={broadcaster:'b',prediction:'p',outcomes:['yes','no'],closesAt:'2020-01-01T00:00:00Z',timeoutAt:'2099-01-01T00:00:00Z'};
  await p.register({wallet:'w',twitch:{id:'b'}},input);await p.ingest({id:'end',broadcaster:'b',prediction:'p',kind:'resolve',winner:'yes',source:'helix'});
  let phase:'open'|'locked'|'resolved'|'canceled'='open';const actions:string[]=[];
  const chain={async read(){return {phase};},async lock(){actions.push('lock');phase='locked';},async resolve(){actions.push('resolve');phase='resolved';},async cancel(){actions.push('cancel');phase='canceled';}};
  await reconcileTwitchMarkets(d.pool,d.namespace,chain);await reconcileTwitchMarkets(d.pool,d.namespace,chain);assert.deepEqual(actions,['lock','resolve']);
  phase='open';await assert.rejects(runTwitchCycle({async poll(){throw new Error('offline');}},p,d.pool,d.namespace,chain));assert.equal(phase,'open'); // Ambiguous prior lock is never re-sent.
  phase='open';await reconcileTwitchMarkets(d.pool,d.namespace,chain,Date.parse('2100-01-01'));assert.equal(phase,'canceled');
 }finally{await d.pool.query('DELETE FROM plot_private.plot_chain_commands WHERE namespace=$1',[d.namespace]);await d.pool.query('DELETE FROM plot_private.plot_twitch_events WHERE namespace=$1',[d.namespace]);await d.pool.query('DELETE FROM plot_private.plot_twitch_markets WHERE namespace=$1',[d.namespace]);await d.close();}
});

test('signed EventSub HTTP and nullable mobile market DTO', {skip:!url||!process.env.PORTLESS_URL},async()=>{
 const {cloudApp}=await import('../src/cloud/app.js');const {createHmac}=await import('node:crypto');
 const d=new Documents(url!,`plot_test_${randomUUID()}`);await d.migrate();const projection=new TwitchProjection(d.pool,d.namespace);
 await projection.register({wallet:'w',twitch:{id:'b'}},{broadcaster:'b',prediction:'p',outcomes:['yes','no'],closesAt:'2030-01-01T00:00:00Z',timeoutAt:'2030-01-02T00:00:00Z'});
 const secret='fixture-secret-only',app=cloudApp(d,{AUTH_ORIGIN:'https://plot.example',DATABASE_URL:url!,PLOT_NAMESPACE:d.namespace,PLOT_ONCHAIN_TWITCH_ENABLED:'true',PLOT_TWITCH_EVENTSUB_SECRET:secret});
 const server=app.listen(Number(process.env.PORT),'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
 try{
  const base=process.env.PORTLESS_URL!,time=new Date().toISOString(),id='message-one';
  const body=JSON.stringify({subscription:{type:'channel.prediction.end',version:'1',condition:{broadcaster_user_id:'b'}},event:{id:'p',broadcaster_user_id:'b',status:'resolved',winning_outcome_id:'yes'}});
  const sig='sha256='+createHmac('sha256',secret).update(id+time).update(body).digest('hex');
  const headers={'content-type':'application/json','twitch-eventsub-message-id':id,'twitch-eventsub-message-timestamp':time,'twitch-eventsub-message-signature':sig,'twitch-eventsub-message-type':'notification'};
  const webhook=()=>fetch(`${base}/api/plot/v1/twitch/eventsub`,{method:'POST',headers,body});
  assert.equal((await webhook()).status,204);assert.equal((await webhook()).status,204);
  assert.equal((await fetch(`${base}/api/plot/v1/twitch/eventsub`,{method:'POST',headers:{...headers,'twitch-eventsub-message-signature':'bad'},body})).status,403);
  const response=await fetch(`${base}/api/plot/v1/markets`);assert.equal(response.status,200);
  const result=await response.json() as {markets:{id:string;winnerId:string;chainStatus:null;streamerFee:null;marketIdentity:string;options:{stake:null;optionIndex:null}[]}[]};
  assert.equal(result.markets[0].id,'b:p');assert.equal(result.markets[0].winnerId,'yes');assert.equal(result.markets[0].chainStatus,null);assert.equal(result.markets[0].streamerFee,null);assert.equal(result.markets[0].options[0].stake,null);assert.equal(result.markets[0].options[0].optionIndex,null);assert.match(result.markets[0].marketIdentity,/^[0-9a-f]{64}$/);
 }finally{app.locals.liveMarkets.close();await new Promise<void>(resolve=>server.close(()=>resolve()));await d.pool.query('DELETE FROM plot_private.plot_twitch_events WHERE namespace=$1',[d.namespace]);await d.pool.query('DELETE FROM plot_private.plot_twitch_markets WHERE namespace=$1',[d.namespace]);await d.close();}
});

test('Helix requires scoped broadcaster token and preserves labels without treating Twitch points as PLOT', {skip:!url},async()=>{
 const {HelixPredictionSource}=await import('../src/cloud/plot/twitch-adapter.js');const d=new Documents(url!,`plot_test_${randomUUID()}`);await d.migrate();try{
  const p=new TwitchProjection(d.pool,d.namespace);await p.register({wallet:'w',twitch:{id:'b'}},{broadcaster:'b',prediction:'p',outcomes:['yes','no'],closesAt:'2030-01-01T00:00:00Z',timeoutAt:'2030-01-02T00:00:00Z'});
  const request:typeof fetch=async input=>String(input).includes('/validate')?Response.json({client_id:'client',user_id:'b',scopes:['channel:read:predictions']}):Response.json({data:[{id:'p',broadcaster_id:'b',status:'RESOLVED',title:'Match',outcomes:[{id:'yes',title:'Sí',channel_points:999},{id:'no',title:'No'}],winning_outcome_id:'yes'}]});
  const source=new HelixPredictionSource(d.pool,d.namespace,'client','fixture-token',request),events=await source.poll();assert.equal(events[0].winner,'yes');await p.ingest(events[0]);
  const {rows}=await d.pool.query('SELECT title,outcome_labels FROM plot_private.plot_twitch_markets WHERE namespace=$1',[d.namespace]);assert.deepEqual(rows[0],{title:'Match',outcome_labels:{yes:'Sí',no:'No'}});
  await assert.rejects(new HelixPredictionSource(d.pool,d.namespace,'other','fixture-token',request).poll());
 }finally{await d.pool.query('DELETE FROM plot_private.plot_chain_commands WHERE namespace=$1',[d.namespace]);await d.pool.query('DELETE FROM plot_private.plot_twitch_events WHERE namespace=$1',[d.namespace]);await d.pool.query('DELETE FROM plot_private.plot_twitch_markets WHERE namespace=$1',[d.namespace]);await d.close();}
});

test('market HTTP enriches only verified option mappings', {skip:!url||!process.env.PORTLESS_URL},async()=>{
 const {cloudApp}=await import('../src/cloud/app.js');const d=new Documents(url!,`plot_test_${randomUUID()}`);await d.migrate();
 const projection=new TwitchProjection(d.pool,d.namespace);await projection.register({wallet:'w',twitch:{id:'b'}},{broadcaster:'b',prediction:'p',outcomes:['yes','no'],closesAt:'2030-01-01T00:00:00Z',timeoutAt:'2030-01-02T00:00:00Z'});
 const mock=new PostgresMockPaymentProvider(d.pool,d.namespace),chain:PlotChain={async findPaymentReceipt(){return null;},async submitCredit(){return 'fixture';}},payments=new PaymentReconciler(d.pool,d.namespace,mock,chain);
 const app=cloudApp(d,{AUTH_ORIGIN:'https://plot.example',DATABASE_URL:url!,PLOT_NAMESPACE:d.namespace,PLOT_ONCHAIN_TWITCH_ENABLED:'true',PLOT_TWITCH_EVENTSUB_SECRET:'fixture-secret-only'},{mock,payments,allowMockConfirmation:false,actor:async()=>({id:'u',wallet:'w',twitch:null}),chainMarketRead:async()=>({chainStatus:'resolved',options:[{id:'yes',optionIndex:0,stake:'600'},{id:'no',optionIndex:1,stake:'400'}],treasuryFee:'20',streamerFee:'20'})});
 const server=app.listen(Number(process.env.PORT),'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));try{
  const response=await fetch(`${process.env.PORTLESS_URL}/api/plot/v1/markets`),result=await response.json() as {markets:{chainStatus:string;treasuryFee:string;options:{optionIndex:number;stake:string}[]}[]};
  assert.equal(result.markets[0].chainStatus,'resolved');assert.equal(result.markets[0].treasuryFee,'20');assert.deepEqual(result.markets[0].options.map(o=>[o.optionIndex,o.stake]),[[0,'600'],[1,'400']]);
 }finally{app.locals.liveMarkets.close();await new Promise<void>(resolve=>server.close(()=>resolve()));await d.pool.query('DELETE FROM plot_private.plot_twitch_markets WHERE namespace=$1',[d.namespace]);await d.close();}
});

test('chain worker persists ambiguous command and does not retransmit after restart', {skip:!url},async()=>{
 const {reconcileTwitchMarkets}=await import('../src/cloud/plot/twitch.js');const d=new Documents(url!,`plot_test_${randomUUID()}`);await d.migrate();try{
  const p=new TwitchProjection(d.pool,d.namespace);await p.register({wallet:'w',twitch:{id:'b'}},{broadcaster:'b',prediction:'p',outcomes:['yes','no'],closesAt:'2020-01-01T00:00:00Z',timeoutAt:'2099-01-01T00:00:00Z'});
  let attempts=0;const chain={async read(){return {phase:'open' as const};},async lock(){attempts++;throw new Error('ambiguous');},async resolve(){},async cancel(){}};
  await assert.rejects(reconcileTwitchMarkets(d.pool,d.namespace,chain));await reconcileTwitchMarkets(d.pool,d.namespace,chain);assert.equal(attempts,1);
  const rows=await d.pool.query('SELECT operation,signature FROM plot_private.plot_chain_commands WHERE namespace=$1',[d.namespace]);assert.deepEqual(rows.rows,[{operation:'lock',signature:null}]);
 }finally{await d.pool.query('DELETE FROM plot_private.plot_chain_commands WHERE namespace=$1',[d.namespace]);await d.pool.query('DELETE FROM plot_private.plot_twitch_markets WHERE namespace=$1',[d.namespace]);await d.close();}
});
