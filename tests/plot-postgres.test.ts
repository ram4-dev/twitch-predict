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
  const chain:PlotChain={async findPaymentReceipt(){return receipt;},async submitCredit(input){submissions++;receipt={...input,signature:'test-signature',finalized:true};return 'test-signature';}};
  let provider=new PostgresMockPaymentProvider(d.pool,d.namespace);let service=new PaymentReconciler(d.pool,d.namespace,provider,chain);
  await service.create({id:'purchase',wallet:'wallet',amount:'600'});await provider.confirm('purchase','wallet');
  provider=new PostgresMockPaymentProvider(d.pool,d.namespace);service=new PaymentReconciler(d.pool,d.namespace,provider,chain);
  await Promise.all([service.reconcile('purchase'),service.reconcile('purchase')]);await service.reconcile('purchase');
  assert.equal(submissions,1);assert.equal((await provider.getOrder('purchase'))?.status,'paid');
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
 }finally{await d.pool.query('DELETE FROM plot_private.plot_twitch_events WHERE namespace=$1',[d.namespace]);await d.pool.query('DELETE FROM plot_private.plot_twitch_markets WHERE namespace=$1',[d.namespace]);await d.close();}
});

test('HTTP order, duplicate confirmation and reconciliation through cloud app', {skip:!url||!process.env.PORTLESS_URL},async()=>{
 const {cloudApp}=await import('../src/cloud/app.js');const d=new Documents(url!,`plot_test_${randomUUID()}`);await d.migrate();
 let receipt:CreditReceipt|null=null,submissions=0;
 const chain:PlotChain={async findPaymentReceipt(){return receipt;},async submitCredit(input){submissions++;receipt={...input,signature:'fixture',finalized:true};return 'fixture';}};
 const mock=new PostgresMockPaymentProvider(d.pool,d.namespace),payments=new PaymentReconciler(d.pool,d.namespace,mock,chain);
 const app=cloudApp(d,{AUTH_ORIGIN:'https://plot.example',DATABASE_URL:url!,PLOT_NAMESPACE:d.namespace},{mock,payments,allowMockConfirmation:true,actor:async req=>{if(req.get('authorization')!=='Bearer fixture')throw new Error('unauthorized');return {id:'user',wallet:'wallet',twitch:null};}});
 const server=app.listen(Number(process.env.PORT),'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
 const base=process.env.PORTLESS_URL!;const post=(path:string,body:unknown={})=>fetch(`${base}/api/plot/v1${path}`,{method:'POST',headers:{authorization:'Bearer fixture','content-type':'application/json'},body:JSON.stringify(body)});
 try{
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
  phase='open';await assert.rejects(runTwitchCycle({async poll(){throw new Error('offline');}},p,d.pool,d.namespace,chain));assert.equal(phase,'locked');
  phase='open';await reconcileTwitchMarkets(d.pool,d.namespace,chain,Date.parse('2100-01-01'));assert.equal(phase,'canceled');
 }finally{await d.pool.query('DELETE FROM plot_private.plot_twitch_events WHERE namespace=$1',[d.namespace]);await d.pool.query('DELETE FROM plot_private.plot_twitch_markets WHERE namespace=$1',[d.namespace]);await d.close();}
});
