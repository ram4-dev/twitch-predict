import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import express from 'express';
import {PublicKey} from '@solana/web3.js';
import {ByteService,ByteError} from '../src/byte.js';
import {BYTE_PROGRAM,DEVNET_GENESIS,solToLamports,type ByteMarket} from '../src/byte-model.js';
import {placeBetInstruction} from '../src/byte-wallet.js';
import {byteRouter} from '../src/byte-router.js';
import {Points} from '../src/points.js';

const chainMarket='11111111111111111111111111111111';
const config={enabled:true,sol:{cluster:'devnet',programId:BYTE_PROGRAM,maxBet:100_000_000,maxPool:2_000_000_000}};
const input=()=>({title:'¿Gana la próxima partida?',options:['Sí','No'],windowSecs:60,currency:'sol',channel:'fixture_streamer',rules:'Se resuelve con el resultado final de la próxima partida y el VOD.',requestId:randomUUID()});
const market=():ByteMarket=>({id:'pm_fixture',title:input().title,options:['Sí','No'],currency:'sol',status:'open',bettable:true,resolvable:false,openMs:Date.now(),closeMs:Date.now()+60000,chain:{market:chainMarket,settled:false},pools:[0,0],total:0,bettors:0,winner:null,invalidReason:null});
async function fixture(run:(dir:string)=>Promise<void>){const dir=await mkdtemp(`${tmpdir()}/byte-test-`);try{await run(dir);}finally{await rm(dir,{recursive:true,force:true});}}
test('devnet uses the complete 32-byte genesis hash reported by the live RPC',()=>{assert.equal(new PublicKey(DEVNET_GENESIS).toBytes().length,32);assert.equal(DEVNET_GENESIS,'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG');});
test('SOL parsing and instruction encode exact units, documented discriminator, PDAs and signer roles',()=>{
  assert.equal(solToLamports('0.100000001'),100000001n);
  for(const value of ['1e-2','-1','0','0.000000001','0.1234567891','01','0,1'])assert.throws(()=>solToLamports(value));
  const bettor='BUKuDvwaLNjBSe9QhXEYvedBz9NBucvkFVwQ2GJX7cQQ';
  const ix=placeBetInstruction(chainMarket,bettor,1,123456789n,42n);
  assert.equal(ix.programId.toBase58(),BYTE_PROGRAM);assert.equal(ix.data.length,33);
  assert.deepEqual([...ix.data.subarray(0,8)],[222,62,67,220,63,166,126,33]);assert.equal(ix.data[8],1);
  assert.equal(ix.data.readBigUInt64LE(9),123456789n);assert.equal(ix.data.readBigUInt64LE(17),42n);assert.equal(ix.data.readBigUInt64LE(25),0n);
  assert.deepEqual(ix.keys.map(k=>[k.isSigner,k.isWritable]),[[false,true],[false,true],[false,true],[true,true],[false,false]]);
  const [vault]=PublicKey.findProgramAddressSync([Buffer.from('vault'),new PublicKey(chainMarket).toBuffer()],ix.programId);assert.ok(vault.equals(ix.keys[1].pubkey));
  const nonce=Buffer.alloc(8);nonce.writeBigUInt64LE(42n);const [bet]=PublicKey.findProgramAddressSync([Buffer.from('bet'),new PublicKey(chainMarket).toBuffer(),new PublicKey(bettor).toBuffer(),nonce],ix.programId);assert.ok(bet.equals(ix.keys[2].pubkey));
});
test('creation is serialized, authenticated only upstream, idempotent and durable; rules stay off-chain',()=>fixture(async dir=>{
  let creations=0;const m=market();const transport:typeof fetch=async(url,options)=>{
    if(String(url).endsWith('/api/bets/open')){assert.equal(new Headers(options?.headers).get('authorization'),null);return Response.json(config);}
    assert.equal(new Headers(options?.headers).get('authorization'),'Bearer test-only-key');
    if(options?.method==='POST'){creations++;const body=JSON.parse(String(options.body));assert.equal(body.channel,undefined);assert.equal(body.rules,undefined);assert.equal(body.requestId,undefined);return Response.json({market:m},{status:201});}
    return Response.json({market:m});
  };
  const service=new ByteService(dir,'test-only-key',undefined,transport);await service.load();const i=input();
  const [a,b]=await Promise.all([service.create(i),service.create(i)]);assert.equal(a.id,b.id);assert.equal(creations,1);assert.equal(a.notes?.channel,i.channel);
  const reloaded=new ByteService(dir,'test-only-key',undefined,transport);await reloaded.load();assert.equal((await reloaded.create(i)).notes?.rules,i.rules);assert.equal(creations,1);
  await assert.rejects(reloaded.create({...i,title:'Una pregunta distinta'}),/otros datos/);
}));
test('ambiguous creation blocks a new UUID after restart and supports explicit reconciliation',()=>fixture(async dir=>{
  let posts=0;const m=market();
  const transport:typeof fetch=async(url,options)=>{if(String(url).endsWith('/api/bets/open'))return Response.json(config);if(options?.method==='POST'){posts++;throw new TypeError('connection reset');}return Response.json({market:m});};
  const service=new ByteService(dir,'test-only',undefined,transport);await service.load();const i=input();await assert.rejects(service.create(i),/confirmar/);
  const reloaded=new ByteService(dir,'test-only',undefined,transport);await reloaded.load();await assert.rejects(reloaded.create(i),/incierto/);await assert.rejects(reloaded.create({...i,requestId:randomUUID()}),/incierta/);assert.equal(posts,1);
  const recovered=await reloaded.reconcile(i.requestId,m.id);assert.equal(recovered.notes?.rules,i.rules);assert.equal(reloaded.operations().length,0);assert.equal((await reloaded.create(i)).id,m.id);assert.equal(posts,1);
}));
test('missing key, partner limits, unsafe config and malformed market cannot report success',()=>fixture(async dir=>{
  const missing=new ByteService(dir,'');await missing.load();await assert.rejects(missing.create(input()),/BYTE_API_KEY/);
  const limit=new ByteService(dir,'test-only',undefined,async url=>String(url).endsWith('/api/bets/open')?Response.json(config):Response.json({error:'test-only must never leak'},{status:429}));await limit.load();
  await assert.rejects(limit.create(input()),(error:unknown)=>error instanceof ByteError&&error.status===429&&!error.message.includes('test-only'));
  const wrongNetwork=new ByteService(dir,'test-only',undefined,async()=>Response.json({...config,sol:{...config.sol,cluster:'mainnet-beta'}}));await wrongNetwork.load();await assert.rejects(wrongNetwork.create(input()),/devnet esperado/);
  const malformed=new ByteService(dir,'test-only',undefined,async url=>String(url).endsWith('/api/bets/open')?Response.json(config):Response.json({market:{...market(),pools:[0]}}));await malformed.load();await assert.rejects(malformed.create(input()),/no verificable/);assert.equal(malformed.operations().length,1);
}));
test('resolution enforces close, persists evidence, retries the same outcome and rejects changing it',()=>fixture(async dir=>{
  let m=market(),resolutions=0;const transport:typeof fetch=async(url,options)=>{
    const path=String(url);if(path.endsWith('/api/bets/open'))return Response.json(config);
    if(path.endsWith('/resolve')){resolutions++;m={...m,status:'resolved',winner:0,bettable:false,resolvable:false};return Response.json({market:m});}
    if(options?.method==='POST')return Response.json({market:m},{status:201});return Response.json({market:m});
  };
  const service=new ByteService(dir,'test-only',undefined,transport);await service.load();await service.create(input());
  await assert.rejects(service.settle(m.id,0,'VOD minuto 12:31, victoria.'),/Esperá al cierre/);assert.equal(resolutions,0);
  m.closeMs=Date.now()-1;m.resolvable=true;m.bettable=false;
  await service.settle(m.id,0,'VOD minuto 12:31, victoria.');await service.settle(m.id,0,'VOD minuto 12:31, victoria.');assert.equal(resolutions,1);
  await assert.rejects(service.settle(m.id,1,'VOD minuto 12:31, derrota.'),/otro resultado/);
  const reloaded=new ByteService(dir,'test-only',undefined,transport);await reloaded.load();assert.equal((await reloaded.get(m.id)).notes?.resolution?.evidence,'VOD minuto 12:31, victoria.');
}));
test('operator routes require local bridge or an explicitly allowed authenticated wallet',()=>fixture(async dir=>{
  const points=new Points(dir);await points.load();const service=new ByteService(dir,'test-only',undefined,async()=>Response.json(config));await service.load();
  const app=express();app.use(express.json());app.use('/api/byte',byteRouter(service,points,'bridge-only',{BYTE_OPERATOR_WALLETS:'allowed-wallet'}));
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
  const origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  try{
    const anonymous=await fetch(origin+'/api/byte/markets',{method:'POST',headers:{'content-type':'application/json','sec-fetch-site':'same-origin','x-operator-token':'bridge-only'},body:JSON.stringify(input())});assert.equal(anonymous.status,403);
    const wrong=await points.walletLogin('other-wallet');const denied=await fetch(origin+'/api/byte/operations',{headers:{'sec-fetch-site':'same-origin',authorization:`Bearer ${wrong.token}`}});assert.equal(denied.status,403);
    const allowed=await points.walletLogin('allowed-wallet');const granted=await fetch(origin+'/api/byte/operations',{headers:{'sec-fetch-site':'same-origin',authorization:`Bearer ${allowed.token}`}});assert.equal(granted.status,200);
    const crossSite=await fetch(origin+'/api/byte/operations',{headers:{'sec-fetch-site':'cross-site',authorization:`Bearer ${allowed.token}`}});assert.equal(crossSite.status,403);
    const rpc=await fetch(origin+'/api/byte/rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'requestAirdrop',params:[]})});assert.equal(rpc.status,403);
    const status=await(await fetch(origin+'/api/byte/status')).text();assert.ok(!status.includes('test-only'));assert.ok(!status.includes('bridge-only'));
  }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
}));
