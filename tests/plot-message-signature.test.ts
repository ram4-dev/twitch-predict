import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPrivateKey, sign } from 'node:crypto';
import { Keypair } from '@solana/web3.js';
import { verifySignedMessage } from '../mobile/src/lib/message-signature.js';

test('MWA message payload binds signature to exact bytes and connected wallet', () => {
  const wallet = Keypair.generate();
  const key = createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),Buffer.from(wallet.secretKey.subarray(0,32))]),format:'der',type:'pkcs8'});
  const message = Buffer.from('Plot sign in challenge');
  const signature = sign(null,message,key);
  const signed = Buffer.concat([message,signature]);
  assert.deepEqual(Buffer.from(verifySignedMessage(message,signed,wallet.publicKey)),signature);
  assert.throws(()=>verifySignedMessage(Buffer.from('other'),signed,wallet.publicKey));
  assert.throws(()=>verifySignedMessage(message,signed,Keypair.generate().publicKey));
  assert.throws(()=>verifySignedMessage(message,signed.subarray(0,-1),wallet.publicKey));
});
