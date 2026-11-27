import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Connection, Keypair, Transaction, SystemProgram } from '@solana/web3.js';
import { devnetSponsorRpc } from '../src/plot/sponsor-rpc.js';

test('RPC adapter rejects wrong genesis and requires finalized evidence', async () => {
  let genesis = 'wrong';
  let confirmation: 'confirmed' | 'finalized' = 'confirmed';
  const connection = {
    async getGenesisHash() { return genesis; },
    async getFeeForMessage() { return { value: 5000 }; },
    async getSignatureStatuses() { return { value: [{ confirmationStatus: confirmation, err: null }] }; },
    async getBlockHeight() { return 42; },
    async sendRawTransaction() { return 'signature'; },
  } as unknown as Connection;
  await assert.rejects(devnetSponsorRpc(connection), /not devnet/);
  genesis = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
  const rpc = await devnetSponsorRpc(connection);
  const signer = Keypair.generate();
  const message = new Transaction({feePayer:signer.publicKey,recentBlockhash:Keypair.generate().publicKey.toBase58()}).add(SystemProgram.transfer({fromPubkey:signer.publicKey,toPubkey:Keypair.generate().publicKey,lamports:1})).serializeMessage();
  assert.equal(await rpc.fee(message),5000n);
  assert.equal(await rpc.outcome('signature', 100),'unknown');
  confirmation = 'finalized';
  assert.equal(await rpc.outcome('signature', 100),'confirmed');
  assert.equal(await rpc.finalizedBlockHeight(),42);
});
