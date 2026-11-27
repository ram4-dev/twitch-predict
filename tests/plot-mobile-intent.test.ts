import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { Keypair, Transaction, SystemProgram } from '@solana/web3.js';
import { PlotIntentController, type PlotIntentApi, type PlotRequest } from '../mobile/src/lib/plot-intent-client.js';
import { PlotWalletSigner } from '../mobile/src/lib/plot-transaction-signer.js';
import { parsePlotAccount } from '../mobile/src/lib/plot-account-client.js';
const request: PlotRequest = { wallet:'test-wallet',operation:'place_prediction',parameters:{marketIdentity:'ab'.repeat(32),option:0,amount:'600',sequence:'1'} };
function storage() { const m = new Map<string,string>(); return { async getItem(k:string) { return m.get(k) ?? null; }, async setItem(k:string,v:string) { m.set(k,v); } }; }
test('ambiguous submission survives restart and blocks a fresh key until reconciled', async () => {
 const store=storage(), keys:string[]=[]; let submissions=0, status:'submitted'|'confirmed'='submitted';
 const api:PlotIntentApi={ async prepare(key) { keys.push(key); return {id:'intent',transaction:'YWJj',lastValidBlockHeight:42,status:'prepared'}; }, async submit() { submissions++; throw new Error('ambiguous'); }, async reconcile() { return status; } };
 const signer={ async sign() { return 'c2ln'; } };
 const first=new PlotIntentController(store,api,signer,'endpoint-wallet'); await first.start('same-key',request);
 await assert.rejects(() => first.signAndSubmit());
 const reopened=new PlotIntentController(store,api,signer,'endpoint-wallet'); assert.equal((await reopened.state())?.stage,'submitting');
 await assert.rejects(() => reopened.start('new-key',request)); assert.equal((await reopened.reconcile()).stage,'submitted');
 status='confirmed'; assert.equal((await reopened.reconcile()).stage,'confirmed'); assert.equal(submissions,1); assert.deepEqual(keys,['same-key','same-key']);
});
test('lost preparation is retried only with the persisted idempotency key', async () => {
 const store=storage(), keys:string[]=[]; let attempts=0;
 const api:PlotIntentApi={async prepare(key) { keys.push(key); if (++attempts===1) throw new Error('lost'); return {id:'i',transaction:'YWJj',lastValidBlockHeight:3,status:'prepared'}; }, async submit(){}, async reconcile(){return 'confirmed';}};
 const client=new PlotIntentController(store,api,{async sign(){return 'c2ln';}},'s');
 await assert.rejects(()=>client.start('original',request)); await client.resumePreparation(); assert.deepEqual(keys,['original','original']);
});
test('wallet signer requires matching signer and unchanged message', async () => {
 const user=Keypair.generate(), sponsor=Keypair.generate(), recipient=Keypair.generate();
 const tx=new Transaction({feePayer:sponsor.publicKey,recentBlockhash:Keypair.generate().publicKey.toBase58()}).add(SystemProgram.transfer({fromPubkey:user.publicKey,toPubkey:recipient.publicKey,lamports:1}));
 const encoded=tx.serialize({requireAllSignatures:false,verifySignatures:false}).toString('base64');
 const good=new PlotWalletSigner({async connect(){return {publicKey:user.publicKey};},async signTransaction(t){t.partialSign(user);return t;}});
 assert.ok(await good.sign(encoded,user.publicKey.toBase58()));
 const bad=new PlotWalletSigner({async connect(){return {publicKey:user.publicKey};},async signTransaction(t){t.instructions[0].data[0]^=1;t.partialSign(user);return t;}});
 await assert.rejects(()=>bad.sign(encoded,user.publicKey.toBase58()));
});
test('account rejects another wallet and preserves confirming amounts', () => {
 const data={wallet:'wallet',balance:null,readStatus:'confirming',positions:[{marketId:'m',optionId:'y',stake:'600',payout:null,claimed:false,chainStatus:'open'}]};
 assert.equal(parsePlotAccount(data,'wallet').balance,null); assert.throws(()=>parsePlotAccount(data,'other'));
 assert.throws(()=>parsePlotAccount({...data,balance:'-1'},'wallet'));
});
