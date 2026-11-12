import {FundingChainFixture as Chain} from './fixtures/funding-chain.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {Keypair,Transaction} from '@solana/web3.js';
import {Points} from '../src/points.js';
import {Funding} from '../src/funding.js';
import {fundingAmount,fundingPackageAmount,POINT_PACKAGES,USDC_DEVNET,USDC_MAINNET,MAINNET_GENESIS,type PublicFundingOrder} from '../src/funding-model.js';
import {DEVNET_GENESIS} from '../src/byte-model.js';
import {demoPrediction} from '../src/mirror.js';
import {usdcAccount,usdcTransfer,TOKEN_PROGRAM,ASSOCIATED_PROGRAM} from '../src/funding-transfer.js';

async function setup(){
  const dir=await mkdtemp(`${tmpdir()}/points-funding-`),points=new Points(dir);await points.load();
  const wallet=Keypair.generate(),treasury=Keypair.generate(),account=await points.walletLogin(wallet.publicKey.toBase58()),chain=new Chain();
  const options={chain,treasury,enabled:true,price:async()=>'150.125'};
  return {dir,points,wallet,treasury,token:account.token,chain,funding:new Funding(points,{},options),options};
}
function sign(order:PublicFundingOrder,wallet:Keypair){const tx=Transaction.from(Buffer.from(order.transaction,'base64'));tx.sign(wallet);return tx.serialize().toString('base64');}

test('conversion preserves base units and floors points and withdrawals without floating point',()=>{
  assert.deepEqual(fundingAmount('deposit','USDC','1.234567','1'),{points:1234,units:'1234567'});
  assert.deepEqual(fundingAmount('deposit','SOL','0.1','150.125'),{points:15012,units:'100000000'});
  assert.deepEqual(fundingAmount('withdraw','USDC','1000','1'),{points:1000,units:'1000000'});
  assert.deepEqual(fundingAmount('withdraw','SOL','1000','150'),{points:1000,units:'6666666'});
  for(const amount of ['-1','NaN','1e3','0','1.0000001','1000000000'])assert.throws(()=>fundingAmount('deposit','USDC',amount,'1'));
  assert.throws(()=>fundingAmount('withdraw','USDC','1.5','1'));
});
test('USDC purchase verifies signatures and finalized bytes, credits once across restart and uses the betting balance',async()=>{
  const s=await setup();try{
    const order=await s.funding.quote(s.token,'deposit','USDC','2');
    const tx=Transaction.from(Buffer.from(order.transaction,'base64'));
    assert(tx.instructions[1].keys.some(k=>k.pubkey.toBase58()===USDC_DEVNET));
    const result=await s.funding.submit(s.token,order.id,sign(order,s.wallet));assert.equal(result.status,'pending');assert.equal(s.points.me(s.token).balance,10000);
    s.chain.finalize(result.signature!);await s.funding.submit(s.token,order.id);await s.funding.submit(s.token,order.id);
    assert.equal(s.points.me(s.token).balance,12000);assert.equal(s.points.me(s.token).ledger.filter(l=>l.kind==='deposit').length,1);
    const reloaded=new Points(s.dir);await reloaded.load();const funding=new Funding(reloaded,{},s.options);await funding.submit(s.token,order.id);assert.equal(reloaded.me(s.token).balance,12000);
    const market=await reloaded.accept(demoPrediction(),true);await reloaded.bet(s.token,market.key,market.outcomes[0].id,11000,crypto.randomUUID());assert.equal(reloaded.me(s.token).balance,1000);
    assert(!('signedTransaction' in funding.list(s.token)[0]));assert(!('accountId' in funding.list(s.token)[0]));
  }finally{await rm(s.dir,{recursive:true,force:true});}
});
test('withdrawal reserves the same balance, rejects overspending and refunds a finalized failure once',async()=>{
  const s=await setup();try{
    const first=await s.funding.quote(s.token,'withdraw','SOL','7000'),second=await s.funding.quote(s.token,'withdraw','USDC','7000');
    const result=await s.funding.submit(s.token,first.id);assert.equal(result.status,'pending');assert.equal(s.points.me(s.token).balance,3000);
    await assert.rejects(s.funding.submit(s.token,second.id),/Saldo insuficiente/);assert.equal(s.chain.broadcasts,1);
    s.chain.finalize(result.signature!,true);await s.funding.submit(s.token,first.id);await s.funding.submit(s.token,first.id);assert.equal(s.points.me(s.token).balance,10000);
    assert.equal(s.points.me(s.token).ledger.filter(l=>l.kind==='withdraw-refund').length,1);
  }finally{await rm(s.dir,{recursive:true,force:true});}
});
test('uncertain broadcast remains reserved, reuses the signature after restart, and expires only after finalized height',async()=>{
  const s=await setup();try{
    s.chain.failSend=true;const order=await s.funding.quote(s.token,'withdraw','USDC','1000');const pending=await s.funding.submit(s.token,order.id);
    assert.equal(pending.status,'pending');assert.equal(s.points.me(s.token).balance,9000);
    const reloaded=new Points(s.dir);await reloaded.load();const funding=new Funding(reloaded,{},s.options);
    const retry=await funding.submit(s.token,order.id);assert.equal(retry.signature,pending.signature);assert.equal(reloaded.me(s.token).balance,9000);
    s.chain.height=101;assert.equal((await funding.submit(s.token,order.id)).status,'expired');assert.equal(reloaded.me(s.token).balance,10000);
  }finally{await rm(s.dir,{recursive:true,force:true});}
});
test('modified or unsigned purchases and foreign accounts cannot send or credit funds',async()=>{
  const s=await setup();try{
    const order=await s.funding.quote(s.token,'deposit','SOL','0.1');
    const altered=Transaction.from(Buffer.from(order.transaction,'base64'));altered.instructions[0].data[4]^=1;altered.sign(s.wallet);
    await assert.rejects(s.funding.submit(s.token,order.id,altered.serialize().toString('base64')),/no coincide/);
    await assert.rejects(s.funding.submit(s.token,order.id,order.transaction),/no coincide/);
    const other=await s.points.walletLogin(Keypair.generate().publicKey.toBase58());assert.throws(()=>s.funding.submit(other.token,order.id),/inexistente/);
    assert.equal(s.chain.broadcasts,0);assert.equal(s.points.me(s.token).balance,10000);
  }finally{await rm(s.dir,{recursive:true,force:true});}
});
test('simultaneous submits have one reservation and one broadcast; concurrent orders cannot overspend',async()=>{
  const s=await setup();try{
    const order=await s.funding.quote(s.token,'withdraw','USDC','6000');
    await Promise.all([s.funding.submit(s.token,order.id),s.funding.submit(s.token,order.id)]);assert.equal(s.chain.broadcasts,1);assert.equal(s.points.me(s.token).balance,4000);
    s.chain.finalize(s.funding.list(s.token)[0].signature!);await s.funding.submit(s.token,order.id);assert.equal(s.points.me(s.token).balance,4000);
  }finally{await rm(s.dir,{recursive:true,force:true});}
});
test('disabled treasury and RPC network mismatches fail closed',async()=>{
  const s=await setup();try{
    assert.equal(new Funding(s.points,{}).config().enabled,false);
    await assert.rejects(new Funding(s.points,{}).quote(s.token,'deposit','USDC','1'),/habilitados/);
    s.chain.genesis='mainnet';await assert.rejects(s.funding.quote(s.token,'deposit','USDC','1'),/devnet/);
  }finally{await rm(s.dir,{recursive:true,force:true});}
});
test('USDC instruction encodes the token ABI, destination account, signer and six decimals',()=>{
  const sender=Keypair.fromSeed(new Uint8Array(32).fill(1)).publicKey,recipient=Keypair.fromSeed(new Uint8Array(32).fill(2)).publicKey;
  const [create,transfer]=usdcTransfer(sender,recipient,1234567n);
  assert(create.programId.equals(ASSOCIATED_PROGRAM));assert.equal(create.data.toString('hex'),'01');assert(create.keys[1].pubkey.equals(usdcAccount(recipient)));
  assert(transfer.programId.equals(TOKEN_PROGRAM));assert.equal(transfer.data.toString('hex'),'0c87d612000000000006');assert(transfer.keys[0].pubkey.equals(usdcAccount(sender)));assert(transfer.keys[2].pubkey.equals(usdcAccount(recipient)));assert(transfer.keys[3].isSigner);
});
test('a failed disk commit never sends a withdrawal or reserves points',async()=>{
  const s=await setup();try{
    const order=await s.funding.quote(s.token,'withdraw','USDC','1000');await mkdir(`${s.dir}/points.json.tmp`);
    await assert.rejects(s.funding.submit(s.token,order.id));assert.equal(s.chain.broadcasts,0);assert.equal(s.points.me(s.token).balance,10000);
    await rm(`${s.dir}/points.json.tmp`,{recursive:true});await s.funding.submit(s.token,order.id);assert.equal(s.points.me(s.token).balance,9000);
  }finally{await rm(s.dir,{recursive:true,force:true});}
});
test('the default SOL price source checks its currency and response freshness',async t=>{
  const s=await setup();try{
    const price=t.mock.method(globalThis,'fetch',async(input:unknown)=>{
      assert.equal(String(input),'https://api.coinbase.com/v2/prices/SOL-USDC/spot');
      return Response.json({data:{amount:'150',base:'SOL',currency:'USDC'}},{headers:{date:new Date().toUTCString()}});
    });
    const funding=new Funding(s.points,{}, {chain:s.chain,treasury:s.treasury,enabled:true});
    assert.equal((await funding.quote(s.token,'deposit','SOL','0.01')).points,1500);
    price.mock.mockImplementation(async()=>Response.json({data:{amount:'150',base:'SOL',currency:'USDC'}},{headers:{date:new Date(Date.now()-120000).toUTCString()}}));
    await assert.rejects(funding.quote(s.token,'deposit','SOL','0.01'),/actualizada/);
  }finally{t.mock.restoreAll();await rm(s.dir,{recursive:true,force:true});}
});
test('mainnet selects Circle mainnet USDC, verifies genesis, and cannot withdraw a devnet-funded balance',async()=>{
  const s=await setup();try{
    s.chain.genesis=MAINNET_GENESIS;
    const mainnet=new Funding(s.points,{POINTS_NETWORK:'mainnet-beta'},s.options);
    assert.equal(mainnet.config().network,'mainnet-beta');
    const quote=await mainnet.quote(s.token,'deposit','USDC','1');
    const tx=Transaction.from(Buffer.from(quote.transaction,'base64'));assert(tx.instructions[1].keys.some(k=>k.pubkey.toBase58()===USDC_MAINNET));
    s.chain.genesis=DEVNET_GENESIS;
    await assert.rejects(s.funding.quote(s.token,'withdraw','USDC','1000'),/otra red/);
    assert.throws(()=>s.funding.submit(s.token,quote.id),/otra red/);
    assert.equal(s.chain.broadcasts,0);
  }finally{await rm(s.dir,{recursive:true,force:true});}
});

test('packages keep advertised points and round SOL payment up to the nearest lamport',async()=>{
  for(const pack of POINT_PACKAGES){
    assert.deepEqual(fundingPackageAmount('USDC',pack.id,'1'),{points:pack.points,units:String(pack.points*1000)});
    const sol=fundingPackageAmount('SOL',pack.id,'150.125');
    const numerator=BigInt(pack.points)*1_000_000_000n*1_000_000n,denominator=150125000n*1000n;
    assert(BigInt(sol.units)*denominator>=numerator);
    assert((BigInt(sol.units)-1n)*denominator<numerator);
  }
  assert.throws(()=>fundingPackageAmount('SOL','unknown','150'));
  const s=await setup();try{
    const order=await s.funding.quote(s.token,'deposit','SOL',{packageId:'points-1000'});
    assert.equal(order.points,1000);
    const submitted=await s.funding.submit(s.token,order.id,sign(order,s.wallet));
    s.chain.finalize(submitted.signature!);await s.funding.submit(s.token,order.id);
    assert.equal(s.points.me(s.token).balance,11000);
    await assert.rejects(s.funding.quote(s.token,'withdraw','USDC',{packageId:'points-1000'}),/comprar/);
  }finally{await rm(s.dir,{recursive:true,force:true});}
});
