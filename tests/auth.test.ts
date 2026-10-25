import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {getAddressDecoder} from '@solana/kit';
import {Points} from '../src/points.js';
import {Auth} from '../src/auth.js';
import {parseSignInMessageText,createSignInMessageText} from '@solana/wallet-standard-util';
import {demoPrediction} from '../src/mirror.js';
function wallet(){const key=generateKeyPairSync('ed25519');const bytes=key.publicKey.export({format:'der',type:'spki'});return {address:getAddressDecoder().decode(bytes.subarray(-32)),signature:(message:string)=>sign(null,Buffer.from(message),key.privateKey).toString('base64')};}
async function fixture(run:(p:Points,a:Auth,dir:string,tick:(ms:number)=>void)=>Promise<void>){const dir=await mkdtemp(`${tmpdir()}/phantom-auth-`);let clock=Date.now();try{const p=new Points(dir);await p.load();await run(p,new Auth(p,()=>clock),dir,ms=>{clock+=ms;});}finally{await rm(dir,{recursive:true,force:true});}}
const origin='https://twitch-predict.localhost:1357';
test('login message follows SIWS grammar accepted by Phantom, including ASCII statement',()=>fixture(async(_p,a)=>{
  const w=wallet();const c=a.challenge(w.address,origin);
  const parsed=parseSignInMessageText(c.message);assert.ok(parsed);
  assert.equal(parsed.domain,new URL(origin).host);assert.equal(parsed.uri,origin);assert.equal(parsed.address,w.address);
  assert.match(parsed.statement!,/^[\x20-\x7e]+$/);
  assert.equal(createSignInMessageText(parsed),c.message);
  assert.match(parsed.nonce!,/^[a-zA-Z0-9]{8,}$/);
  assert.equal(Date.parse(parsed.expirationTime!)-Date.parse(parsed.issuedAt!),300000);
}));
test('wallet signature identifies one persistent account across sessions without a second welcome grant',()=>fixture(async(p,a,dir)=>{
  const w=wallet();const c=a.challenge(w.address,origin);const first=await a.authenticate(c.challengeId,w.signature(c.message),origin);
  const market=await p.accept(demoPrediction(),true);await p.bet(first.token,market.key,'victory',300,randomUUID());
  const c2=a.challenge(w.address,origin);const second=await a.authenticate(c2.challengeId,w.signature(c2.message),origin);
  assert.equal(second.account.id,first.account.id);assert.equal(p.me(second.token).balance,9700);assert.equal(p.me(first.token).bets.length,1);
  const restored=new Points(dir);await restored.load();assert.equal(restored.me(second.token).wallet,w.address);assert.equal(restored.me(first.token).balance,9700);
}));
test('extension handoff binds wallet and existing points/history, then cannot be replayed',()=>fixture(async(p,a)=>{
  const anon=await p.createAccount();const market=await p.accept(demoPrediction(),true);await p.bet(anon.token,market.key,'victory',500,randomUUID());
  const extensionId='a'.repeat(32),state='b'.repeat(64);const flow=a.start(extensionId,state,anon.token);const w=wallet();const c=a.challenge(w.address,origin,flow.flowId);
  const web=await a.authenticate(c.challengeId,w.signature(c.message),origin);assert.equal(web.account.id,anon.account.id);assert.equal(web.account.balance,9500);assert.equal(p.me(web.token).bets.length,1);
  await assert.rejects(a.complete(flow.flowId,'c'.repeat(64),web.handoff!.code,extensionId),/válida/);
  await assert.rejects(a.complete(flow.flowId,state,web.handoff!.code,'d'.repeat(32)),/válida/);
  const ext=await a.complete(flow.flowId,state,web.handoff!.code,extensionId);assert.equal(ext.account.id,web.account.id);assert.notEqual(ext.token,web.token);assert.equal(p.me(ext.token).balance,9500);
  assert.throws(()=>p.me(anon.token),/Sesión/);await assert.rejects(a.complete(flow.flowId,state,web.handoff!.code,extensionId),/venció/);
}));
test('wrong signature, wrong origin, expired nonce and replay cannot log in',()=>fixture(async(p,a,_dir,tick)=>{
  const w=wallet(),other=wallet();const c=a.challenge(w.address,origin);
  await assert.rejects(a.authenticate(c.challengeId,other.signature(c.message),origin),/firma/);
  await assert.rejects(a.authenticate(c.challengeId,w.signature(c.message),'https://other.localhost'),/Origen/);
  const result=await a.authenticate(c.challengeId,w.signature(c.message),origin);assert.equal(p.me(result.token).wallet,w.address);
  await assert.rejects(a.authenticate(c.challengeId,w.signature(c.message),origin),/venció/);
  const expired=a.challenge(w.address,origin);tick(300001);await assert.rejects(a.authenticate(expired.challengeId,w.signature(expired.message),origin),/venció/);
}));
test('concurrent proofs cannot mint duplicate accounts or overwrite an existing wallet account',()=>fixture(async(p,a)=>{
  const w=wallet();const c=a.challenge(w.address,origin);const proofs=await Promise.allSettled([a.authenticate(c.challengeId,w.signature(c.message),origin),a.authenticate(c.challengeId,w.signature(c.message),origin)]);assert.equal(proofs.filter(r=>r.status==='fulfilled').length,1);
  const first=proofs.find(r=>r.status==='fulfilled');if(first?.status!=='fulfilled')throw new Error('No result');
  const anon=await p.createAccount();const flow=a.start('a'.repeat(32),'b'.repeat(64),anon.token);const c2=a.challenge(w.address,origin,flow.flowId);const known=await a.authenticate(c2.challengeId,w.signature(c2.message),origin);assert.equal(known.account.id,first.value.account.id);assert.notEqual(known.account.id,anon.account.id);assert.equal(p.me(anon.token).balance,10000);
}));
