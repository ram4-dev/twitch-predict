import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { Connection, Keypair, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { address, createSolanaRpc, getBase58Decoder, createKeyPairSignerFromBytes, type Instruction } from '@solana/kit';
import { predictionMarkets, initializer } from '@whetstone-research/doppler-sdk/solana';
import type { MarketRecord } from './store.js';
const WSOL = address('So11111111111111111111111111111111111111112');
export class SolanaMarkets {
  readonly connection: Connection;
  readonly network: string;
  constructor(readonly directory: string, rpcUrl = 'https://api.devnet.solana.com') {
    const url = new URL(rpcUrl);
    if (url.hostname !== 'api.devnet.solana.com' && !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('POC only allows devnet or a local validator');
    this.network = url.hostname === 'api.devnet.solana.com' ? 'devnet' : 'localnet';
    this.connection = new Connection(rpcUrl, 'confirmed');
  }
  private keypairs = new Map<string, Keypair>();
  private signers = new Map<string, ReturnType<typeof createKeyPairSignerFromBytes>>();
  signer(name = 'wallet') {
    let signer = this.signers.get(name);
    if (!signer) { signer = this.loadSigner(name); this.signers.set(name, signer); }
    return signer;
  }
  private async loadSigner(name: string) {
    const path = `${this.directory}/${name}.json`;
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    let bytes: number[];
    try { bytes = JSON.parse(await readFile(path, 'utf8')); } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      bytes = [...Keypair.generate().secretKey];
      await writeFile(path, JSON.stringify(bytes), { mode: 0o600, flag: 'wx' });
    }
    const keypair = Keypair.fromSecretKey(Uint8Array.from(bytes));
    this.keypairs.set(keypair.publicKey.toBase58(), keypair);
    return createKeyPairSignerFromBytes(Uint8Array.from(bytes));
  }
  async health() {
    const payer = await this.signer();
    return { wallet: payer.address, balance: (await this.connection.getBalance(new PublicKey(payer.address))) / 1e9, network: this.network };
  }
  async send(instructions: readonly Instruction[], label: string, save: (signature: string) => Promise<void>, lookup?: {lookupTableAddress: ReturnType<typeof address>; addresses: ReturnType<typeof address>[]}, signerName = 'wallet') {
    const payer = await this.signer(signerName);
    const latest = await this.connection.getLatestBlockhash();
    const web3Instructions = instructions.map(ix => new TransactionInstruction({
      programId: new PublicKey(ix.programAddress), data: Buffer.from(ix.data ?? []),
      keys: (ix.accounts ?? []).map(account => ({ pubkey: new PublicKey(account.address), isSigner: account.role >= 2, isWritable: account.role % 2 === 1 })),
    }));
    const tables = lookup ? [await this.connection.getAddressLookupTable(new PublicKey(lookup.lookupTableAddress)).then(r => { if (!r.value) throw new Error('Missing lookup table'); return r.value; })] : [];
    const message = new TransactionMessage({ payerKey: new PublicKey(payer.address), recentBlockhash: latest.blockhash, instructions: web3Instructions }).compileToV0Message(tables);
    const tx = new VersionedTransaction(message);
    tx.sign(message.staticAccountKeys.slice(0, message.header.numRequiredSignatures).map(key => { const signer = this.keypairs.get(key.toBase58()); if (!signer) throw new Error('Missing local signer'); return signer; }));
    const raw = Buffer.from(tx.serialize()).toString('base64');
    const signature = getBase58Decoder().decode(tx.signatures[0]);
    // Save signed bytes before broadcast. Never create a fresh transaction after an ambiguous timeout.
    await writeFile(`${this.directory}/tx-${createHash('sha256').update(label).digest('hex')}.json`, JSON.stringify({ signature, raw, ...latest }), { mode: 0o600 });
    await save(signature);
    await this.connection.sendRawTransaction(Buffer.from(raw, 'base64'), { skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 20 });
    const receipt = await this.connection.confirmTransaction({ signature, ...latest }, 'confirmed');
    if (receipt.value.err) throw new Error(`Transaction failed: ${JSON.stringify(receipt.value.err)}`);
    return signature;
  }
  async exists(account: string) { return !!(await this.connection.getAccountInfo(new PublicKey(account))); }
  async create(record: MarketRecord, persist: () => Promise<void>) {
    const payer = await this.signer();
    const outcomeIds = record.outcomes.map(o => new Uint8Array(createHash('sha256').update(`${record.key}:${o.id}`).digest()));
    const nonce = createHash('sha256').update(record.key).digest().readBigUInt64LE();
    const oracle = await predictionMarkets.prepareOracle({ oracleAuthority: payer, nonce, outcomeIds });
    const market = await predictionMarkets.prepareMarket({ creator: payer, oracle: oracle.oracle, quoteMint: WSOL });
    record.oracle = oracle.oracle; record.market = market.market; await persist();
    const save = async (signature: string) => { record.signatures.push(signature); await persist(); };
    if (!await this.exists(oracle.oracle)) await this.send(oracle.instructions, `${record.key}:oracle`, save);
    if (!await this.exists(market.market)) await this.send(market.instructions, `${record.key}:market`, save);
    for (const [index, outcome] of record.outcomes.entries()) {
      const baseMint = await this.signer(`mint-${createHash('sha256').update(`${record.key}:${outcome.id}`).digest('hex')}`);
      const launch = await predictionMarkets.prepareOutcomeLaunch({ creator: payer, oracle: oracle.oracle, outcomeId: outcomeIds[index], launch: {
        payer, launchId: outcomeIds[index], launchAccounts: { baseMint, quoteMint: WSOL, baseVault: await this.signer(`base-vault-${baseMint.address}`), quoteVault: await this.signer(`quote-vault-${baseMint.address}`) },
        supply: { baseDecimals: 6, baseTotalSupply: 1_000_000_000_000n, baseForDistribution: 0n, baseForLiquidity: 0n },
        curve: { curveVirtualBase: 1_000_000_000_000n, curveVirtualQuote: 1_000_000_000n, swapFeeBps: 100 }, metadata: null,
      } });
      outcome.mint = baseMint.address; outcome.launch = launch.addresses.launch; await persist();
      if (await this.exists(baseMint.address)) continue;
      const recentSlot = await this.connection.getSlot('finalized');
      const lookup = await initializer.buildAddressLookupTableSetupInstructions({ authority: payer, payer, recentSlot: BigInt(recentSlot), addresses: initializer.getInstructionLookupTableAddresses(launch.instruction) });
      await this.send([lookup.createInstruction, ...lookup.extendInstructions], `${record.key}:lookup:${index}`, save);
      // The leader's scheduler resolves lookup tables against its rooted bank.
      // A table visible at confirmed commitment can simulate successfully and still
      // be dropped before execution. Wait for finalized visibility before using it.
      let ready = false;
      for (let n = 0; n < 100; n++) {
        const info = await this.connection.getAddressLookupTable(new PublicKey(lookup.lookupTableAddress), { commitment: 'finalized' });
        if (info.value && await this.connection.getSlot('finalized') > Number(info.value.state.lastExtendedSlot)) { ready = true; break; }
        await new Promise(r => setTimeout(r, 400));
      }
      if (!ready) throw new Error('Lookup table did not finalize in time');
      await this.send([launch.instruction], `${record.key}:launch:${index}`, save, lookup);
    }
    // Read protocol state back; an address or transaction submission alone is not success.
    if (!await this.exists(market.market)) throw new Error('Market account missing after confirmation');
    for (const o of record.outcomes) if (!o.mint || !await this.exists(o.mint)) throw new Error('Outcome mint missing');
    const view = await predictionMarkets.fetchPredictionMarket(createSolanaRpc(this.connection.rpcEndpoint), address(market.market));
    if (!view.status.canBuy || view.entries.length !== record.outcomes.length) throw new Error('Protocol did not register every outcome for trading');
    record.phase = 'open'; await persist();
  }
}
