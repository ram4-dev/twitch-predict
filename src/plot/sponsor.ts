import { createHash, randomUUID } from 'node:crypto';
import { Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { Pool, type PoolClient } from 'pg';
import { requireTransactionSigner, validateWalletTransaction } from '../plot-wallet-validation.js';

export type SponsorOperation = 'place_prediction' | 'claim';
export interface SponsorRequest { userId: string; idempotencyKey: string; wallet: string; operation: SponsorOperation; parameters: unknown }
export interface PreparedIntent { id: string; transaction: string; lastValidBlockHeight: number; status: string }
/** Builder and estimator are server-owned. They must validate identity, authorization, chain,
 * account derivations, amounts, market state, and calculate a conservative rent bound via RPC. */
export interface SponsorDependencies {
  build(request: SponsorRequest): Promise<{ transaction: Transaction; lastValidBlockHeight: number; rentLamports: bigint; newAccounts: number }>;
  fee(message: Buffer): Promise<bigint>;
  send(raw: Buffer): Promise<void>;
  /** Must query chain history and establish finality; unknown includes ambiguous expiry. */
  outcome(signature: string, lastValidBlockHeight: number): Promise<'confirmed' | 'failed' | 'expired_absent' | 'unknown'>;
  /** Finalized block height from the configured chain, never an optimistic height. */
  finalizedBlockHeight(): Promise<number>;
}
export interface SponsorPolicy { programId: PublicKey; maxFee: bigint; maxRent: bigint; maxPerUser: bigint; maxGlobal: bigint; maxNewAccounts: number; maxAccountsPerUser: number; maxAccountsGlobal: number; maxRequestsPerHour: number; discriminators: Record<SponsorOperation, Buffer> }

const hash = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
// Stable, unambiguous JSON for idempotency, excluding prototype tricks and non-JSON values.
function canonical(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isSafeInteger(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const obj = value as Record<string, unknown>;
    return '{' + Object.keys(obj).sort().map(k => JSON.stringify(k) + ':' + canonical(obj[k])).join(',') + '}';
  }
  throw new Error('Parameters must be canonical JSON; amounts must be decimal strings');
}

export class PlotSponsor {
  constructor(private pool: Pool, private sponsor: Keypair, private policy: SponsorPolicy, private deps: SponsorDependencies) {
    if (policy.maxFee < 0n || policy.maxRent < 0n || policy.maxPerUser < 0n || policy.maxGlobal < 0n || !Number.isSafeInteger(policy.maxNewAccounts) || policy.maxNewAccounts < 0 || !Number.isSafeInteger(policy.maxAccountsPerUser) || policy.maxAccountsPerUser < 0 || !Number.isSafeInteger(policy.maxAccountsGlobal) || policy.maxAccountsGlobal < 0 || !Number.isSafeInteger(policy.maxRequestsPerHour) || policy.maxRequestsPerHour < 1) throw new Error('Invalid sponsor limits');
  }
  async initialize(): Promise<void> {
    await this.pool.query(`CREATE TABLE IF NOT EXISTS plot_sponsor_intents (
      id text PRIMARY KEY, user_id text NOT NULL, idempotency_key text NOT NULL, request_hash text NOT NULL,
      wallet text NOT NULL, operation text, message bytea NOT NULL, unsigned_tx bytea NOT NULL, block_height bigint NOT NULL,
      fee bigint NOT NULL, rent bigint NOT NULL, new_accounts integer NOT NULL, status text NOT NULL,
      signed_tx bytea, signature text, created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(user_id, idempotency_key))`);
    await this.pool.query('ALTER TABLE plot_sponsor_intents ADD COLUMN IF NOT EXISTS operation text');
  }
  private async locked<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const c = await this.pool.connect();
    try { await c.query('BEGIN'); await c.query("SELECT pg_advisory_xact_lock(hashtext('plot_sponsor_v1'))"); const result = await fn(c); await c.query('COMMIT'); return result; }
    catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
  }
  private validateInstruction(tx: Transaction, operation: SponsorOperation): void {
    const discriminator = this.policy.discriminators[operation];
    if (!discriminator || discriminator.length !== 8 || tx.instructions.length !== 1 || !tx.instructions[0].programId.equals(this.policy.programId) || !tx.instructions[0].data.subarray(0, 8).equals(discriminator)) throw new Error('Program or instruction not allowed');
  }
  async prepare(request: SponsorRequest): Promise<PreparedIntent> {
    if (!request.userId || request.userId.length > 256 || !request.idempotencyKey || request.idempotencyKey.length > 128 || !['place_prediction','claim'].includes(request.operation)) throw new Error('Invalid request');
    const wallet = new PublicKey(request.wallet);
    if (wallet.equals(this.sponsor.publicKey)) throw new Error('User and sponsor must differ');
    const normalized = canonical({ wallet: wallet.toBase58(), operation: request.operation, parameters: request.parameters });
    if (Buffer.byteLength(normalized) > 8192) throw new Error('Request too large');
    const requestHash = hash(normalized);
    const snapshot = JSON.parse(normalized) as Pick<SponsorRequest, 'wallet' | 'operation' | 'parameters'>;
    request = { userId: request.userId, idempotencyKey: request.idempotencyKey, ...snapshot };
    return this.locked(async c => {
      const old = await c.query('SELECT * FROM plot_sponsor_intents WHERE user_id=$1 AND idempotency_key=$2', [request.userId, request.idempotencyKey]);
      if (old.rowCount) {
        const row = old.rows[0]; if (row.request_hash !== requestHash) throw new Error('Idempotency conflict');
        return { id: row.id, transaction: row.unsigned_tx.toString('base64'), lastValidBlockHeight: Number(row.block_height), status: row.status };
      }
      const built = await this.deps.build(request);
      const tx = built.transaction;
      if (!tx.feePayer?.equals(this.sponsor.publicKey) || !tx.recentBlockhash || !Number.isSafeInteger(built.lastValidBlockHeight) || built.lastValidBlockHeight < 1) throw new Error('Invalid transaction lifetime or fee payer');
      this.validateInstruction(tx, request.operation);
      requireTransactionSigner(tx, wallet);
      const required = tx.compileMessage().accountKeys.slice(0, tx.compileMessage().header.numRequiredSignatures);
      if (required.length !== 2 || !required.some(k => k.equals(wallet)) || !required.some(k => k.equals(this.sponsor.publicKey))) throw new Error('Unexpected signers');
      if (tx.signatures.some(s => s.signature)) throw new Error('Builder returned signed transaction');
      const message = tx.serializeMessage(); const fee = await this.deps.fee(message);
      if (fee < 0n || fee > this.policy.maxFee || built.rentLamports < 0n || built.rentLamports > this.policy.maxRent || !Number.isSafeInteger(built.newAccounts) || built.newAccounts < 0 || built.newAccounts > this.policy.maxNewAccounts) throw new Error('Transaction exceeds limits');
      const usage = await c.query(`SELECT COALESCE(SUM(CASE WHEN status='expired_absent' THEN 0 WHEN status='failed' THEN fee ELSE fee+rent END),0) AS global,
        COALESCE(SUM(CASE WHEN status='expired_absent' THEN 0 WHEN status='failed' THEN fee ELSE fee+rent END) FILTER (WHERE user_id=$1),0) AS personal,
        COALESCE(SUM(new_accounts) FILTER (WHERE status NOT IN ('failed','expired_absent')),0) AS accounts_global,
        COALESCE(SUM(new_accounts) FILTER (WHERE user_id=$1 AND status NOT IN ('failed','expired_absent')),0) AS accounts_personal,
        COUNT(*) FILTER (WHERE user_id=$1 AND created_at > now()-interval '1 hour') AS recent FROM plot_sponsor_intents`, [request.userId]);
      const cost = fee + built.rentLamports, row = usage.rows[0];
      if (BigInt(row.global) + cost > this.policy.maxGlobal || BigInt(row.personal) + cost > this.policy.maxPerUser || Number(row.recent) >= this.policy.maxRequestsPerHour || BigInt(row.accounts_global) + BigInt(built.newAccounts) > BigInt(this.policy.maxAccountsGlobal) || BigInt(row.accounts_personal) + BigInt(built.newAccounts) > BigInt(this.policy.maxAccountsPerUser)) throw new Error('Sponsor budget exceeded');
      const id = randomUUID(), raw = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
      await c.query(`INSERT INTO plot_sponsor_intents (id,user_id,idempotency_key,request_hash,wallet,operation,message,unsigned_tx,block_height,fee,rent,new_accounts,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'prepared')`, [id,request.userId,request.idempotencyKey,requestHash,wallet.toBase58(),request.operation,message,raw,built.lastValidBlockHeight,fee.toString(),built.rentLamports.toString(),built.newAccounts]);
      return { id, transaction: raw.toString('base64'), lastValidBlockHeight: built.lastValidBlockHeight, status: 'prepared' };
    });
  }
  async submit(userId: string, id: string, userTransaction: string): Promise<string> {
    if (userTransaction.length > 2000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(userTransaction)) throw new Error('Invalid transaction encoding');
    const result = await this.locked(async c => {
      const q = await c.query('SELECT * FROM plot_sponsor_intents WHERE id=$1 AND user_id=$2 FOR UPDATE',[id,userId]);
      if (!q.rowCount) throw new Error('Intent not found');
      const row = q.rows[0];
      if (!['place_prediction', 'claim'].includes(row.operation)) throw new Error('Intent requires migration');
      const prepared = Transaction.from(row.unsigned_tx);
      if (!prepared.feePayer?.equals(this.sponsor.publicKey)) throw new Error('Sponsor changed');
      this.validateInstruction(prepared, row.operation);
      if (row.signed_tx) return { raw: row.signed_tx as Buffer, signature: row.signature as string, status: row.status as string };
      if (row.status !== 'prepared') throw new Error('Intent is terminal');
      const tx = Transaction.from(Buffer.from(userTransaction,'base64'));
      validateWalletTransaction(row.message, tx, new PublicKey(row.wallet));
      if (tx.signatures.find(s => s.publicKey.equals(this.sponsor.publicKey))?.signature) throw new Error('Unexpected sponsor signature');
      tx.partialSign(this.sponsor);
      const raw = tx.serialize();
      // Transaction ID is the first signature, encoded by web3's own serializer.
      const signature = (await import('bs58')).default.encode(tx.signature!);
      await c.query("UPDATE plot_sponsor_intents SET signed_tx=$1,signature=$2,status='submitted' WHERE id=$3",[raw,signature,id]);
      return { raw, signature, status: 'submitted' };
    });
    if (result.status === 'submitted') await this.deps.send(result.raw);
    return result.signature;
  }
  async getIntent(userId: string, id: string): Promise<{ id: string; status: string; signature: string | null; lastValidBlockHeight: number }> {
    const q = await this.pool.query('SELECT id,status,signature,block_height FROM plot_sponsor_intents WHERE id=$1 AND user_id=$2',[id,userId]);
    if (!q.rowCount) throw new Error('Intent not found');
    const row = q.rows[0];
    return { id: row.id, status: row.status, signature: row.signature, lastValidBlockHeight: Number(row.block_height) };
  }
  async expireUnsigned(userId: string, id: string): Promise<string> {
    const height = await this.deps.finalizedBlockHeight();
    if (!Number.isSafeInteger(height) || height < 0) throw new Error('Invalid finalized block height');
    return this.locked(async c => {
      const q = await c.query('SELECT status,block_height FROM plot_sponsor_intents WHERE id=$1 AND user_id=$2 FOR UPDATE',[id,userId]);
      if (!q.rowCount) throw new Error('Intent not found');
      const row = q.rows[0];
      if (row.status === 'prepared' && height > Number(row.block_height)) {
        await c.query("UPDATE plot_sponsor_intents SET status='expired_absent' WHERE id=$1",[id]);
        return 'expired_absent';
      }
      return row.status as string;
    });
  }
  async reconcile(userId: string, id: string): Promise<string> {
    const q = await this.pool.query('SELECT status,signature,block_height FROM plot_sponsor_intents WHERE id=$1 AND user_id=$2',[id,userId]);
    if (!q.rowCount) throw new Error('Intent not found');
    const row = q.rows[0]; if (row.status !== 'submitted') return row.status;
    const outcome = await this.deps.outcome(row.signature, Number(row.block_height));
    if (outcome !== 'unknown') await this.pool.query("UPDATE plot_sponsor_intents SET status=$1 WHERE id=$2 AND status='submitted'",[outcome,id]);
    const latest = await this.pool.query('SELECT status FROM plot_sponsor_intents WHERE id=$1',[id]);
    return latest.rows[0].status;
  }
}
