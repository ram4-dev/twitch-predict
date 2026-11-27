import type { PlotAmount, PlotIntent, PlotPort, PlotSnapshot } from './plot-onchain';
import { plotFixtureV1 } from '../fixtures/plot-v1';

export interface PlotStorage { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> }
type Request = { operation: 'purchase'; amount: PlotAmount } | { operation: 'predict'; marketId: string; optionId: string; amount: PlotAmount } | { operation: 'claim'; marketId: string };
type Pending = PlotIntent & { request: Request };
type State = { version: 1; loggedIn: boolean; snapshot: PlotSnapshot; pending: Pending | null; sequence: number };
const key = 'plot.onchain.fixture.v1';
const initial = (): State => ({ version: 1, loggedIn: false, snapshot: JSON.parse(JSON.stringify({ ...plotFixtureV1, balance: '0' })), pending: null, sequence: 0 });
function amount(value: string): bigint {
  if (!/^[1-9]\d{0,18}$/.test(value)) throw new Error('Ingresá una cantidad entera positiva de hasta 19 dígitos.');
  return BigInt(value);
}
/** Local fixture simulator only. A single saved record commits intent and effects atomically. */
export class PlotFixtureClient implements PlotPort {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly storage: PlotStorage) {}
  private run<T>(fn: (state: State) => Promise<T> | T): Promise<T> {
    const work = this.queue.then(async () => {
      const raw = await this.storage.getItem(key);
      const state: State = raw ? JSON.parse(raw) : initial();
      if (state.version !== 1) throw new Error('Versión de datos de ejemplo incompatible.');
      const result = await fn(state);
      await this.storage.setItem(key, JSON.stringify(state));
      return result;
    });
    this.queue = work.catch(() => {});
    return work;
  }
  login() { return this.run(s => { s.loggedIn = true; }); }
  session() { return this.run(s => ({ loggedIn: s.loggedIn, pending: s.pending as PlotIntent | null })); }
  read() { return this.run(s => JSON.parse(JSON.stringify(s.snapshot)) as PlotSnapshot); }
  private prepare(request: Request) { return this.run(s => {
    if (!s.loggedIn) throw new Error('Iniciá la sesión de ejemplo primero.');
    if (s.pending) throw new Error('Revisá la operación pendiente antes de continuar.');
    if (request.operation === 'purchase') amount(request.amount);
    if (request.operation === 'predict') {
      const n = amount(request.amount), market = s.snapshot.markets.find(m => m.id === request.marketId);
      if (!market || market.status !== 'open' || !market.options.some(o => o.id === request.optionId)) throw new Error('Mercado u opción no disponible.');
      if (n > BigInt(s.snapshot.balance)) throw new Error('Saldo PLOT insuficiente.');
      const position = s.snapshot.positions.find(p => p.marketId === market.id);
      if (position && position.optionId !== request.optionId) throw new Error('Ya elegiste otra opción en este mercado.');
    }
    if (request.operation === 'claim') {
      const market = s.snapshot.markets.find(m => m.id === request.marketId), position = s.snapshot.positions.find(p => p.marketId === request.marketId);
      if (!market || !['resolved', 'cancelled'].includes(market.status) || !position || position.claimed || BigInt(position.payout) === 0n) throw new Error('No hay cobro disponible.');
    }
    const intent: Pending = { id: `fixture-${++s.sequence}`, operation: request.operation, status: 'pending', request };
    s.pending = intent;
    return { id: intent.id, operation: intent.operation, status: intent.status } as PlotIntent;
  }); }
  purchase(value: PlotAmount) { return this.prepare({ operation: 'purchase', amount: value }); }
  predict(marketId: string, optionId: string, value: PlotAmount) { return this.prepare({ operation: 'predict', marketId, optionId, amount: value }); }
  claim(marketId: string) { return this.prepare({ operation: 'claim', marketId }); }
  reconcile(id: string) { return this.run(s => {
    const pending = s.pending;
    if (!pending || pending.id !== id) throw new Error('Operación pendiente no encontrada.');
    const request = pending.request;
    if (request.operation === 'purchase') s.snapshot.balance = (BigInt(s.snapshot.balance) + amount(request.amount)).toString();
    if (request.operation === 'predict') {
      const market = s.snapshot.markets.find(m => m.id === request.marketId)!;
      const option = market.options.find(o => o.id === request.optionId)!;
      const n = amount(request.amount);
      s.snapshot.balance = (BigInt(s.snapshot.balance) - n).toString();
      option.stake = (BigInt(option.stake) + n).toString();
      const position = s.snapshot.positions.find(p => p.marketId === market.id);
      if (position) position.stake = (BigInt(position.stake) + n).toString();
      else s.snapshot.positions.push({ marketId: market.id, optionId: option.id, stake: request.amount, payout: '0', claimed: false });
    }
    if (request.operation === 'claim') {
      const position = s.snapshot.positions.find(p => p.marketId === request.marketId)!;
      s.snapshot.balance = (BigInt(s.snapshot.balance) + BigInt(position.payout)).toString();
      position.claimed = true;
    }
    s.pending = null;
    return { id, operation: pending.operation, status: 'confirmed' } as PlotIntent;
  }); }
}
