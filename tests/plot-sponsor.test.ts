import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { Keypair, Transaction, TransactionInstruction } from '@solana/web3.js';
import { Pool } from 'pg';
import { PlotSponsor, type SponsorDependencies, type SponsorRequest } from '../src/plot/sponsor.js';

const url = process.env.PLOT_SPONSOR_TEST_DATABASE_URL;
test('persistent sponsor binds messages, serializes budgets and retries identical bytes', { skip: !url }, async () => {
  const schema = 'sponsor_test_' + randomUUID().replaceAll('-', '');
  const admin = new Pool({ connectionString: url });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
  const sponsor = Keypair.generate(), user = Keypair.generate(), program = Keypair.generate().publicKey;
  const discriminator = Buffer.from('12345678');
  const sends: Buffer[] = [];
  let failSend = true;
  const deps: SponsorDependencies = {
    async build() { return { transaction: new Transaction({ feePayer: sponsor.publicKey, recentBlockhash: Keypair.generate().publicKey.toBase58() }).add(new TransactionInstruction({programId: program, keys: [{pubkey:user.publicKey,isSigner:true,isWritable:true}],data: Buffer.concat([discriminator,Buffer.from([1])])})), lastValidBlockHeight: 100, rentLamports: 20n, newAccounts: 1 }; },
    async fee() { return 5n; },
    async send(raw) { sends.push(raw); if (failSend) throw new Error('ambiguous RPC'); },
    async outcome() { return 'unknown'; },
    async finalizedBlockHeight() { return 101; },
  };
  const policy = {programId:program,maxFee:5n,maxRent:20n,maxGlobal:25n,maxPerUser:25n,maxNewAccounts:1,maxAccountsPerUser:2,maxAccountsGlobal:2,maxRequestsPerHour:5,discriminators:{place_prediction:discriminator,claim:Buffer.from('87654321')}};
  const service = new PlotSponsor(pool,sponsor,policy,deps);
  try {
    await service.initialize();
    const req: SponsorRequest = {userId:'u', idempotencyKey:'one', wallet:user.publicKey.toBase58(),operation:'place_prediction',parameters:{amount:'600'}};
    const [a,b] = await Promise.all([service.prepare(req),service.prepare(req)]);
    assert.equal(a.id,b.id);
    await assert.rejects(service.prepare({...req,parameters:{amount:'400'}}),/Idempotency/);
    await assert.rejects(service.prepare({...req,idempotencyKey:'two'}),/budget/);
    const unsigned = Transaction.from(Buffer.from(a.transaction,'base64'));
    await assert.rejects(service.submit('u',a.id,unsigned.serialize({requireAllSignatures:false,verifySignatures:false}).toString('base64')),/no firmó/);
    const tx = Transaction.from(Buffer.from(a.transaction,'base64')); tx.partialSign(user);
    const revoked = new PlotSponsor(pool,sponsor,{...policy,programId:Keypair.generate().publicKey},deps);
    await assert.rejects(revoked.submit('u',a.id,tx.serialize({requireAllSignatures:false}).toString('base64')),/not allowed/);
    const altered = Transaction.from(tx.serialize({requireAllSignatures:false})); altered.instructions[0].data[8] = 2;
    await assert.rejects(service.submit('u',a.id,altered.serialize({requireAllSignatures:false,verifySignatures:false}).toString('base64')),/modificó/);
    await assert.rejects(service.submit('other',a.id,tx.serialize({requireAllSignatures:false}).toString('base64')),/not found/);
    await assert.rejects(service.submit('u',a.id,tx.serialize({requireAllSignatures:false}).toString('base64')),/ambiguous/);
    assert.equal(await service.reconcile('u',a.id),'submitted');
    failSend = false;
    const restarted = new PlotSponsor(pool,sponsor,policy,deps);
    const sig = await restarted.submit('u',a.id,tx.serialize({requireAllSignatures:false}).toString('base64'));
    assert.ok(sig); assert.equal(sends.length,2); assert.deepEqual(sends[0],sends[1]);
    deps.outcome = async () => 'confirmed';
    assert.equal(await restarted.reconcile('u',a.id),'confirmed');
    await assert.rejects(service.prepare({...req,idempotencyKey:'three'}),/budget/);
    const expanded = new PlotSponsor(pool,sponsor,{...policy,maxGlobal:50n,maxPerUser:50n},deps);
    const pending = await expanded.prepare({...req,idempotencyKey:'unsigned'});
    assert.equal(await expanded.expireUnsigned('u',pending.id),'expired_absent');
    await assert.rejects(expanded.submit('u',pending.id,tx.serialize({requireAllSignatures:false}).toString('base64')),/terminal/);
    const replacement = await expanded.prepare({...req,idempotencyKey:'replacement'});
    assert.notEqual(replacement.id,pending.id);
    const limited = new PlotSponsor(pool,sponsor,{...policy,maxGlobal:100n,maxPerUser:100n,maxRequestsPerHour:1},deps);
    await assert.rejects(limited.prepare({...req,idempotencyKey:'rate'}),/budget/);
    const badProgram = new PlotSponsor(pool,sponsor,{...policy,programId:Keypair.generate().publicKey,maxGlobal:100n,maxPerUser:100n},deps);
    await assert.rejects(badProgram.prepare({...req,idempotencyKey:'bad-program'}),/not allowed/);
  } finally { await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); }
});
