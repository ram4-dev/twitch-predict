import { closesAt, predictionSchema, type Prediction } from './prediction.js';
import { Store, type MarketRecord } from './store.js';
export interface MarketAdapter { network: string; create(record: MarketRecord, persist: () => Promise<void>): Promise<void> }
export class Mirror {
  private queue = Promise.resolve();
  constructor(readonly store: Store, readonly adapter: MarketAdapter) {}
  execute<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.then(work);
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }
  async accept(input: unknown) {
    const p = predictionSchema.parse(input);
    const key = `${this.adapter.network}:${p.channel.toLowerCase()}:${p.id}`;
    // Deduplication occurs before checking expiry; repeated polls can still inspect existing markets.
    const existing = this.store.records[key];
    if (existing) {
      const original = existing.prediction;
      if (original.title !== p.title || original.createdAt !== p.createdAt || original.predictionWindowSeconds !== p.predictionWindowSeconds ||
          original.outcomes.length !== p.outcomes.length || original.outcomes.some((o, i) => o.id !== p.outcomes[i].id || o.title !== p.outcomes[i].title)) {
        throw new Error('Prediction identity changed; refusing to alter its market');
      }
      const rank = { ACTIVE: 0, LOCKED: 1, RESOLVED: 2, CANCELED: 2 };
      if (rank[p.status] >= rank[original.status] && !(rank[original.status] === 2 && p.status !== original.status)) {
        existing.prediction = { ...original, ...p, outcomes: p.outcomes.map((o, i) => ({ ...original.outcomes[i], ...o })) };
        existing.updatedAt = new Date().toISOString();
        void this.execute(() => this.store.save()).catch(e => console.error('Prediction snapshot persistence failed:', (e as Error).message));
      }
      return existing;
    }
    if (p.status !== 'ACTIVE') throw new Error('Only ACTIVE predictions can create markets');
    if (closesAt(p) <= Date.now()) throw new Error('Prediction already closed');
    if (Date.parse(p.createdAt) > Date.now() + 30_000) throw new Error('Prediction starts in the future');
    if (Object.values(this.store.records).filter(r => r.phase === 'creating').length >= 10) throw new Error('Creation queue full');
    const record: MarketRecord = { key, prediction: p, network: this.adapter.network, phase: 'creating', outcomes: p.outcomes.map(o => ({ ...o })), signatures: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    this.store.records[key] = record;
    void this.execute(async () => {
      const persist = async () => { record.updatedAt = new Date().toISOString(); await this.store.save(); };
      try { await persist(); await this.adapter.create(record, persist); }
      catch (e) { record.phase = 'failed'; record.error = e instanceof Error ? e.message : 'Creation failed'; await persist(); }
    });
    return record;
  }
  async idle() { await this.queue; }
}
export function demoPrediction(): Prediction { return { id: `demo-${crypto.randomUUID()}`, channel: 'demo_streamer', title: '¿Gana la próxima partida?', status: 'ACTIVE', createdAt: new Date().toISOString(), predictionWindowSeconds: 1800, outcomes: [{ id: 'victory', title: 'Gana' }, { id: 'defeat', title: 'Pierde' }] }; }
