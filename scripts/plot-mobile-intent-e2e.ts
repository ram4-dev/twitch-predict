/** Fixture integration: PLOT_SPONSOR_CHECKOUT=<path> portless <name> tsx scripts/plot-mobile-intent-e2e.ts */
import { strict as assert } from 'node:assert';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import express from 'express';
import { Keypair, Transaction, SystemProgram } from '@solana/web3.js';
import { plotTransport } from '../mobile/src/lib/plot-account-client.js';
import { PlotHttpIntentApi, PlotIntentController } from '../mobile/src/lib/plot-intent-client.js';
import { PlotWalletSigner } from '../mobile/src/lib/plot-transaction-signer.js';
const checkout = process.env.PLOT_SPONSOR_CHECKOUT, base = process.env.PORTLESS_URL, port = Number(process.env.PORT);
if (!checkout || !base || !port) throw new Error('PLOT_SPONSOR_CHECKOUT and Portless are required');
const { createPlotSponsorRouter } = await import(pathToFileURL(resolve(checkout, 'src/plot/sponsor-router.ts')).href);
const user = Keypair.generate(), sponsor = Keypair.generate();
const tx = new Transaction({feePayer:sponsor.publicKey,recentBlockhash:Keypair.generate().publicKey.toBase58()}).add(SystemProgram.transfer({fromPubkey:user.publicKey,toPubkey:Keypair.generate().publicKey,lamports:1}));
const encoded = tx.serialize({requireAllSignatures:false,verifySignatures:false}).toString('base64');
let status = 'prepared', submissions = 0; const keys: string[] = [];
const service = {
  async prepare(r: { idempotencyKey: string }) { keys.push(r.idempotencyKey); return {id:'fixture-intent',transaction:encoded,lastValidBlockHeight:42,status}; },
  async submit(_user: string, _id: string, raw: string) { const signed=Transaction.from(Buffer.from(raw,'base64')); assert.ok(signed.verifySignatures(false)); assert.ok(signed.signatures.some(s=>s.publicKey.equals(user.publicKey)&&s.signature)); submissions++; status='submitted'; throw new Error('ambiguous fixture'); },
  async getIntent() { return {id:'fixture-intent',status,signature:null,lastValidBlockHeight:42}; },
  async reconcile() { status='confirmed'; }, async expireUnsigned() {},
};
const app=express(); app.use(express.json()); app.use('/api/plot/v1/intents',createPlotSponsorRouter(service,async (req: express.Request)=>req.get('authorization')==='Bearer fixture-session'?'fixture-user':null));
const server=app.listen(port,'127.0.0.1'); await new Promise<void>(r=>server.once('listening',r));
const values=new Map<string,string>(); const store={async getItem(k:string){return values.get(k)??null;},async setItem(k:string,v:string){values.set(k,v);}};
try {
  const api=new PlotHttpIntentApi(plotTransport(base,async()=> 'fixture-session'));
  const signer=new PlotWalletSigner({async connect(){return {publicKey:user.publicKey};},async signTransaction(t){t.partialSign(user);return t;}});
  const client=new PlotIntentController(store,api,signer,'fixture');
  await client.start('fixture-key',{wallet:user.publicKey.toBase58(),operation:'place_prediction',parameters:{marketIdentity:'ab'.repeat(32),option:0,amount:'600',sequence:'0'}});
  await assert.rejects(()=>client.signAndSubmit());
  const reopened=new PlotIntentController(store,api,signer,'fixture'); assert.equal((await reopened.state())?.stage,'submitting');
  assert.equal((await reopened.reconcile()).stage,'confirmed'); assert.equal(submissions,1); assert.deepEqual(keys,['fixture-key','fixture-key']);
  console.log('PASS: fixture sponsor router, signature, ambiguous submission, reopen and reconciliation; no chain transaction');
} finally { await new Promise<void>(r=>server.close(()=>r())); }
