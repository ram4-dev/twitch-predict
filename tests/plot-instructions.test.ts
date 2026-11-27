import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Keypair, PublicKey } from '@solana/web3.js';
import { buildIdlPlotInstruction, type PlotIdl } from '../src/plot/instructions.js';

test('constructs claim and existing-position prediction from pinned experimental IDL', () => {
  const idl = JSON.parse(readFileSync(new URL('./fixtures/plot/idl-4128bee.json', import.meta.url),'utf8')) as PlotIdl;
  const program = new PublicKey(idl.address), owner = Keypair.generate().publicKey, mint = Keypair.generate().publicKey;
  const params = { owner,mint,marketIdentity:new Uint8Array(32).fill(7),existingPosition:true };
  const claim = buildIdlPlotInstruction(idl,program,{...params,operation:'claim'});
  assert.equal(claim.data.toString('hex'),'3ec6d6c1d59f6cd2');
  assert.equal(claim.keys.length,8); assert.ok(claim.keys[0].pubkey.equals(owner));
  const place = buildIdlPlotInstruction(idl,program,{...params,operation:'place_prediction',option:1,amount:600n,sequence:2n});
  assert.equal(place.data.readBigUInt64LE(9),600n); assert.equal(place.data.readBigUInt64LE(17),2n);
  assert.throws(() => buildIdlPlotInstruction(idl,program,{...params,existingPosition:false,operation:'place_prediction',option:1,amount:600n,sequence:2n}),/rent/);
  const altered = structuredClone(idl); altered.instructions.find(i=>i.name==='claim')!.accounts[0].signer = false;
  assert.throws(() => buildIdlPlotInstruction(altered,program,{...params,operation:'claim'}),/layout/);
});

test('constructs sponsored position creation against the provisional ae18a73 IDL', () => {
  const idl = JSON.parse(readFileSync(new URL('./fixtures/plot/idl-ae18a73.json', import.meta.url),'utf8')) as PlotIdl;
  const program = new PublicKey(idl.address), owner = Keypair.generate().publicKey, payer = Keypair.generate().publicKey;
  const ix = buildIdlPlotInstruction(idl,program,{operation:'place_prediction',owner,payer,mint:Keypair.generate().publicKey,marketIdentity:new Uint8Array(32).fill(4),existingPosition:false,option:1,amount:600n,sequence:0n});
  assert.ok(ix.keys[0].pubkey.equals(owner)); assert.ok(ix.keys[0].isSigner); assert.equal(ix.keys[0].isWritable,false);
  assert.ok(ix.keys[1].pubkey.equals(payer)); assert.ok(ix.keys[1].isSigner); assert.ok(ix.keys[1].isWritable);
  assert.throws(() => buildIdlPlotInstruction(idl,program,{operation:'place_prediction',owner,payer:owner,mint:Keypair.generate().publicKey,marketIdentity:new Uint8Array(32),existingPosition:false,option:1,amount:600n,sequence:0n}),/Distinct/);
});
