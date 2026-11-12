import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Keypair,Transaction} from '@solana/web3.js';
import type {AddressInfo} from 'node:net';
import {Documents} from '../src/cloud/documents.js';
import {cloudApp} from '../src/cloud/app.js';
import {Points} from '../src/points.js';
import {Funding} from '../src/funding.js';
import {FundingChainFixture} from './fixtures/funding-chain.js';
const database=process.env.PLOT_STAGING_DATABASE_URL;
test('SQL instances reserve one balance across competing withdrawals and reconcile a finalized failure once',{skip:!database},async()=>{
  const docs=new Documents(database!,`funding-${randomUUID()}`);await docs.migrate();
  try{
    const a=new Points('',docs);await a.load();const wallet=Keypair.generate(),login=await a.walletLogin(wallet.publicKey.toBase58());
    const chain=new FundingChainFixture(),options={chain,treasury:Keypair.generate(),enabled:true,price:async()=>'150'};
    const fa=new Funding(a,{},options),qa=await fa.quote(login.token,'withdraw','USDC','6000');
    const b=new Points('',docs);await b.load();const fb=new Funding(b,{},options),qb=await fb.quote(login.token,'withdraw','SOL','6000');
    const results=await Promise.allSettled([fa.submit(login.token,qa.id),fb.submit(login.token,qb.id)]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(chain.broadcasts,1);
    const reader=new Points('',docs);await reader.load();assert.equal(reader.me(login.token).balance,4000);
    const pending=reader.fundingOrders(login.token).find(o=>o.status==='pending')!;chain.finalize(pending.signature!,true);
    const c=new Points('',docs),d=new Points('',docs);await Promise.all([c.load(),d.load()]);
    await Promise.all([new Funding(c,{},options).submit(login.token,pending.id),new Funding(d,{},options).submit(login.token,pending.id)]);
    await reader.load();assert.equal(reader.me(login.token).balance,10000);assert.equal(reader.me(login.token).ledger.filter(l=>l.kind==='withdraw-refund').length,1);
  }finally{await docs.pool.query('DELETE FROM plot_private.documents WHERE namespace=$1',[docs.namespace]);await docs.close();}
});
test('SQL instances credit a signed deposit exactly once and preserve it across fresh requests',{skip:!database},async()=>{
  const docs=new Documents(database!,`funding-${randomUUID()}`);await docs.migrate();
  try{
    const a=new Points('',docs);await a.load();const wallet=Keypair.generate(),login=await a.walletLogin(wallet.publicKey.toBase58());
    const chain=new FundingChainFixture(),options={chain,treasury:Keypair.generate(),enabled:true,price:async()=>'150'},fa=new Funding(a,{},options);
    const order=await fa.quote(login.token,'deposit','USDC','2');const tx=Transaction.from(Buffer.from(order.transaction,'base64'));tx.sign(wallet);
    const result=await fa.submit(login.token,order.id,tx.serialize().toString('base64'));chain.finalize(result.signature!);
    const b=new Points('',docs),c=new Points('',docs);await Promise.all([b.load(),c.load()]);
    await Promise.all([new Funding(b,{},options).submit(login.token,order.id),new Funding(c,{},options).submit(login.token,order.id)]);
    const reader=new Points('',docs);await reader.load();assert.equal(reader.me(login.token).balance,12000);assert.equal(reader.me(login.token).ledger.filter(l=>l.kind==='deposit').length,1);
  }finally{await docs.pool.query('DELETE FROM plot_private.documents WHERE namespace=$1',[docs.namespace]);await docs.close();}
});
test('cloud mounts funding routes, requires identity and fails closed without a treasury',{skip:!database},async()=>{
  const docs=new Documents(database!,`funding-http-${randomUUID()}`);await docs.migrate();
  const env={AUTH_ORIGIN:'https://plot.example',DATABASE_URL:database,PLOT_NAMESPACE:docs.namespace,POINTS_PAYMENTS_ENABLED:'true'};
  const server=cloudApp(docs,env).listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
  try{
    const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const config=await fetch(`${base}/api/funding/config`).then(r=>r.json());assert.equal(config.enabled,false);assert.equal(config.treasury,null);
    assert.equal((await fetch(`${base}/api/funding/orders`)).status,401);
    const anonymous=await fetch(`${base}/api/funding/quote`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({direction:'withdraw',currency:'USDC',amount:'1000'})});assert.equal(anonymous.status,401);
    assert.equal((await fetch(`${base}/api/funding/config`,{headers:{origin:'https://foreign.example'}})).status,403);
    const points=new Points('',docs);await points.load();const login=await points.walletLogin(Keypair.generate().publicKey.toBase58());
    const response=await fetch(`${base}/api/funding/quote`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${login.token}`},body:JSON.stringify({direction:'withdraw',currency:'USDC',amount:'1000'})});assert.equal(response.status,400);assert.match((await response.json()).error,/tesorería/);
  }finally{
    await new Promise<void>(resolve=>server.close(()=>resolve()));
    await docs.pool.query('DELETE FROM plot_private.documents WHERE namespace=$1',[docs.namespace]);await docs.pool.query('DELETE FROM plot_private.request_limits WHERE namespace=$1',[docs.namespace]);await docs.close();
  }
});
