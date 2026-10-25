import { randomUUID } from 'node:crypto';
import { address, createSolanaRpc, type Instruction } from '@solana/kit';
import { predictionMarkets } from '@whetstone-research/doppler-sdk/solana';
import { PublicKey } from '@solana/web3.js';
import { z } from 'zod';
import { closesAt } from './prediction.js';
import type { SolanaMarkets } from './solana.js';
import type { MarketRecord, MarketAction } from './store.js';
const TOKEN = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const WSOL = 'So11111111111111111111111111111111111111112';
export function parseStake(input: unknown): bigint {
  const value = z.string().regex(/^(0|1)(\.\d{1,9})?$/).parse(input);
  const [whole, fraction = ''] = value.split('.');
  const amount = BigInt(whole) * 1_000_000_000n + BigInt(fraction.padEnd(9, '0'));
  if (amount < 1_000_000n || amount > 1_000_000_000n) throw new Error('Apostá entre 0.001 y 1 SOL de prueba');
  return amount;
}
export type Quote = { id: string; key: string; outcomeId: string; amount: string; expectedTokens: string; minTokens: string; expiresAt: number };
export class Trading {
  readonly rpc;
  readonly quotes = new Map<string, Quote>();
  constructor(readonly solana: SolanaMarkets, readonly persist: () => Promise<void>) { this.rpc = createSolanaRpc(solana.connection.rpcEndpoint); }
  async wallet() { const signer = await this.solana.signer('participant'); return { address: signer.address, balance: (await this.solana.connection.getBalance(new PublicKey(signer.address))) / 1e9 }; }
  async fund() {
    if (this.solana.network !== 'localnet') throw new Error('Faucet disponible únicamente en Solana local');
    const wallet = await this.wallet();
    if (wallet.balance > 5) throw new Error('La wallet ya tiene fondos de prueba');
    const sig = await this.solana.connection.requestAirdrop(new PublicKey(wallet.address), 2e9);
    const latest = await this.solana.connection.getLatestBlockhash();
    const confirmed = await this.solana.connection.confirmTransaction({ signature: sig, ...latest }, 'confirmed');
    if (confirmed.value.err) throw new Error('Falló el faucet local');
    return this.wallet();
  }
  assertOpen(record: MarketRecord) {
    if (record.network !== this.solana.network || record.phase !== 'open') throw new Error('El mercado no está abierto');
    if (closesAt(record.prediction) <= Date.now()) throw new Error('El plazo para apostar terminó');
    if (record.actions?.some(a => a.status === 'pending')) throw new Error('Hay una operación pendiente de reconciliar');
  }
  async quote(record: MarketRecord, outcomeId: string, amountInput: unknown) {
    this.assertOpen(record);
    const outcome = record.outcomes.find(o => o.id === outcomeId);
    if (!record.market || !outcome?.mint || !outcome.launch) throw new Error('Resultado no registrado');
    const amount = parseStake(amountInput);
    const quote = await predictionMarkets.fetchPredictionBuyQuote(this.rpc, { market: address(record.market), baseMint: address(outcome.mint), launch: address(outcome.launch), amountIn: amount, slippageBps: 50 });
    const item: Quote = { id: randomUUID(), key: record.key, outcomeId, amount: amount.toString(), expectedTokens: quote.amountOut.toString(), minTokens: quote.minAmountOut.toString(), expiresAt: Date.now() + 30_000 };
    for (const [id, q] of this.quotes) if (q.expiresAt < Date.now()) this.quotes.delete(id);
    this.quotes.set(item.id, item); return item;
  }
  async run(record: MarketRecord, id: string, kind: MarketAction['kind'], body: (action: MarketAction) => Promise<void>) {
    z.string().uuid().parse(id);
    const previous = record.actions?.find(a => a.id === id);
    if (previous) { if (previous.kind !== kind) throw new Error('ID de operación usado con otra acción'); return previous; }
    if (record.actions?.some(a => a.status === 'pending')) throw new Error('Revisá la operación pendiente antes de enviar otra');
    const action: MarketAction = { id, kind, status: 'pending', signatures: [], createdAt: new Date().toISOString() };
    (record.actions ??= []).push(action); await this.persist();
    try { await body(action); action.status = 'done'; delete record.tradingError; }
    catch (e) {
      action.error = e instanceof Error ? e.message : 'Falló la operación'; record.tradingError = action.error;
      // Submitted transactions with an ambiguous result stay pending. They must never be replayed with a fresh signature.
      if (!action.signatures.length) action.status = 'failed';
      await this.persist(); throw e;
    }
    await this.persist(); return action;
  }
  async submit(record: MarketRecord, action: MarketAction, instructions: readonly Instruction[], who = 'wallet') {
    await this.solana.send(instructions, `${record.key}:${action.id}:${action.signatures.length}`, async sig => { action.signatures.push(sig); await this.persist(); }, undefined, who);
  }
  async buy(record: MarketRecord, quoteId: string, requestId: string) {
    const previous = record.actions?.find(a => a.id === requestId);
    if (previous) { if (previous.kind !== 'buy') throw new Error('ID reutilizado'); return previous; }
    this.assertOpen(record);
    const q = this.quotes.get(quoteId);
    if (!q || q.key !== record.key || q.expiresAt < Date.now()) throw new Error('La cotización venció. Cotizá de nuevo.');
    const outcome = record.outcomes.find(o => o.id === q.outcomeId)!;
    const payer = await this.solana.signer('participant');
    if ((await this.wallet()).balance < Number(q.amount) / 1e9 + .01) throw new Error('Saldo insuficiente. Usá el faucet local.');
    return this.run(record, requestId, 'buy', async action => {
      action.amountLamports = q.amount; action.outcomeId = q.outcomeId;
      const current = await predictionMarkets.fetchPredictionBuyQuote(this.rpc, { market: address(record.market!), baseMint: address(outcome.mint!), launch: address(outcome.launch!), amountIn: BigInt(q.amount), slippageBps: 50 });
      const { outcome: binding } = current;
      const buy = await predictionMarkets.prepareBuy({ payer, market: address(record.market!), oracle: current.oracle,
        launch: binding.launch.address, launchAuthority: binding.launchAuthority, launchFeeState: binding.launchFeeState,
        baseMint: address(outcome.mint!), quoteMint: binding.launch.account.quoteMint, baseVault: binding.launch.account.baseVault,
        quoteVault: binding.launch.account.quoteVault, amountIn: BigInt(q.amount), minAmountOut: BigInt(q.minTokens), wrapSol: true });
      await this.submit(record, action, buy.instructions, 'participant');
      this.quotes.delete(quoteId);
    });
  }
  async resolve(record: MarketRecord, winnerId: string, requestId: string) {
    if (record.network !== this.solana.network || !record.market || !['open', 'resolving'].includes(record.phase)) throw new Error('Este mercado no se puede resolver');
    const index = record.outcomes.findIndex(o => o.id === winnerId);
    if (index < 0) throw new Error('Elegí un resultado del mercado');
    return this.run(record, requestId, 'resolve', async action => {
      const view = await predictionMarkets.fetchPredictionMarket(this.rpc, address(record.market!));
      const winner = Uint8Array.from(view.oracle.data.outcomeIds[index]);
      if (view.oracle.data.isFinalized && !winner.every((b, i) => b === view.oracle.data.winningOutcomeId[i])) throw new Error('El oracle ya tiene otro ganador');
      record.phase = 'resolving'; record.winnerId = winnerId; action.outcomeId = winnerId; await this.persist();
      if (!view.oracle.data.isFinalized) {
        const payer = await this.solana.signer();
        const plan = predictionMarkets.prepareFinalize({ oracleAuthority: payer, oracle: view.market.data.oracle, winningOutcomeId: winner });
        await this.submit(record, action, plan.instructions);
      }
      for (let n = 0; n < record.outcomes.length; n++) {
        const [settlement] = await predictionMarkets.prepareRemainingSettlements(this.rpc, { market: address(record.market!), payer: await this.solana.signer(), winnerFirst: true });
        if (!settlement) break;
        await this.submit(record, action, settlement.instructions);
      }
      const final = await predictionMarkets.fetchPredictionMarket(this.rpc, address(record.market!));
      if (!final.status.allEntriesSettled) throw new Error('Quedan resultados pendientes de liquidar');
      record.phase = final.status.canRefund ? 'void' : 'resolved';
    });
  }
  async tokenBalance(mint: string) {
    const payer = await this.solana.signer('participant');
    const { value } = await this.solana.connection.getParsedTokenAccountsByOwner(new PublicKey(payer.address), { mint: new PublicKey(mint) });
    return value.reduce((sum, account) => sum + BigInt(account.account.data.parsed.info.tokenAmount.amount), 0n);
  }
  closeWrapped(account: string, owner: string): Instruction {
    return { programAddress: TOKEN, accounts: [{ address: address(account), role: 1 }, { address: address(owner), role: 1 }, { address: address(owner), role: 2 }], data: new Uint8Array([9]) };
  }
  async claim(record: MarketRecord, requestId: string) {
    if (record.network !== this.solana.network || !record.market || !['resolved', 'void'].includes(record.phase)) throw new Error('Primero resolvé y liquidá el mercado');
    return this.run(record, requestId, record.phase === 'void' ? 'refund' : 'claim', async action => {
      const payer = await this.solana.signer('participant');
      const view = await predictionMarkets.fetchPredictionMarket(this.rpc, address(record.market!));
      const common = { market: address(record.market!), payer, quoteMint: view.market.data.quoteMint, potVault: view.market.data.potVault };
      let paid = 0n;
      if (view.status.canRefund) {
        for (const outcome of record.outcomes) {
          const balance = await this.tokenBalance(outcome.mint!); if (!balance) continue;
          const entry = view.entries.find(e => e.data.baseMint === outcome.mint)!;
          const supply = await this.solana.connection.getTokenSupply(new PublicKey(outcome.mint!));
          const preview = predictionMarkets.previewRefund({ entry: entry.data, isVoid: true, burnAmount: balance, currentMintSupply: BigInt(supply.value.amount) });
          const plan = await predictionMarkets.prepareRefund({ ...common, refunder: payer, baseMint: address(outcome.mint!), burnAmount: balance });
          await this.submit(record, action, [...plan.instructions, this.closeWrapped(plan.quoteTokenAccount, payer.address)], 'participant'); paid += preview.refundAmount;
        }
      } else {
        const burnAmount = await this.tokenBalance(view.market.data.winnerMint);
        const receipt = await predictionMarkets.fetchPredictionClaimReceipt(this.rpc, address(record.market!), payer.address);
        const preview = predictionMarkets.previewClaim({ market: view.market.data, receipt: receipt?.data, burnAmount });
        if (!preview.canExecute || preview.claimableNow <= 0n) throw new Error('No hay premios pendientes para esta wallet');
        const plan = await predictionMarkets.prepareClaim({ ...common, claimer: payer, winnerMint: view.market.data.winnerMint, burnAmount });
        await this.submit(record, action, [...plan.instructions, this.closeWrapped(plan.quoteTokenAccount, payer.address)], 'participant'); paid = preview.claimableNow;
      }
      if (!paid) throw new Error('No hay tokens con derecho a reembolso');
      action.paidLamports = paid.toString();
    });
  }
  async position(record: MarketRecord) {
    if (!record.market || !['open', 'resolved', 'void', 'resolving'].includes(record.phase)) throw new Error('Mercado no disponible');
    const view = await predictionMarkets.fetchPredictionMarket(this.rpc, address(record.market));
    const payer = await this.solana.signer('participant');
    const balances = await Promise.all(record.outcomes.map(async o => ({ id: o.id, tokens: (await this.tokenBalance(o.mint!)).toString() })));
    let claimable = 0n;
    if (view.status.canClaim) {
      const balance = await this.tokenBalance(view.market.data.winnerMint);
      const receipt = await predictionMarkets.fetchPredictionClaimReceipt(this.rpc, address(record.market), payer.address);
      claimable = predictionMarkets.previewClaim({ market: view.market.data, receipt: receipt?.data, burnAmount: balance }).claimableNow;
    }
    return { wallet: await this.wallet(), balances, claimableLamports: claimable.toString(), protocol: view.status, potLamports: view.market.data.totalPot.toString(), canBet: record.phase === 'open' && closesAt(record.prediction) > Date.now(), quoteMint: WSOL };
  }
}
