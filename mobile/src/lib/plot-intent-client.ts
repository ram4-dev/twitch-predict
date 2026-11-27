import type { PlotAuthenticatedTransport } from './plot-account-client';
import type { PlotStorage } from './plot-fixture-client';
export type PlotOperation = 'place_prediction' | 'claim';
export type PlotRequest = { wallet: string; operation: PlotOperation; parameters: { marketIdentity: string; option?: number; amount?: string; sequence?: string } };
export type IntentStatus = 'prepared' | 'submitted' | 'confirmed' | 'failed' | 'expired_absent';
export type Prepared = { id: string; transaction: string; lastValidBlockHeight: number; status: IntentStatus };
export type IntentState = { key: string; request: PlotRequest; id?: string; stage: 'preparing' | 'prepared' | 'submitting' | 'submitted' | 'confirmed' | 'failed' | 'expired_absent' };
export interface PlotIntentApi { prepare(key: string, request: PlotRequest): Promise<Prepared>; submit(id: string, transaction: string): Promise<void>; reconcile(id: string): Promise<IntentStatus> }
export interface PlotTransactionSigner { sign(transaction: string, expectedWallet: string): Promise<string> }
const statuses: IntentStatus[] = ['prepared','submitted','confirmed','failed','expired_absent'];
const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const u64 = (x: unknown) => typeof x === 'string' && /^(0|[1-9]\d*)$/.test(x) && BigInt(x) <= 18446744073709551615n;
function validateRequest(r: PlotRequest) {
  if (!r.wallet || !/^[0-9a-f]{64}$/.test(r.parameters.marketIdentity) || !['place_prediction','claim'].includes(r.operation)) throw new Error('Intención PLOT inválida.');
  if (r.operation === 'place_prediction' && (!Number.isInteger(r.parameters.option) || r.parameters.option! < 0 || r.parameters.option! > 5 || !u64(r.parameters.amount) || r.parameters.amount === '0' || !u64(r.parameters.sequence))) throw new Error('Predicción PLOT inválida.');
  if (r.operation === 'claim' && (r.parameters.option !== undefined || r.parameters.amount !== undefined || r.parameters.sequence !== undefined)) throw new Error('Cobro PLOT inválido.');
}
const path = '/api/plot/v1/intents';
export class PlotHttpIntentApi implements PlotIntentApi {
  constructor(private readonly transport: PlotAuthenticatedTransport) {}
  async prepare(key: string, request: PlotRequest): Promise<Prepared> {
    const x = await this.transport.request(path, { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify(request) });
    if (!record(x) || typeof x.id !== 'string' || !x.id || typeof x.transaction !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(x.transaction) || !Number.isSafeInteger(x.lastValidBlockHeight) || Number(x.lastValidBlockHeight) < 1 || !statuses.includes(x.status as IntentStatus)) throw new Error('Respuesta de intención inválida.');
    return x as Prepared;
  }
  async submit(id: string, transaction: string) { await this.transport.request(`${path}/${encodeURIComponent(id)}/submit`, { method: 'POST', body: JSON.stringify({ transaction }) }); }
  async get(id: string) {
    const x = await this.transport.request(`${path}/${encodeURIComponent(id)}`, { method: 'GET' });
    if (!record(x) || x.id !== id || !statuses.includes(x.status as IntentStatus)) throw new Error('Estado de intención inválido.');
    return x.status as IntentStatus;
  }
  async reconcile(id: string) {
    const x = await this.transport.request(`${path}/${encodeURIComponent(id)}/reconcile`, { method: 'POST' });
    if (!record(x) || !statuses.includes(x.status as IntentStatus)) throw new Error('Estado de intención inválido.');
    return x.status as IntentStatus;
  }
}
/** Persists the idempotency key before any network call; ambiguous submission is never replayed. */
export class PlotIntentController {
  private queue: Promise<unknown> = Promise.resolve();
  private readonly storageKey: string;
  constructor(private readonly store: PlotStorage, private readonly api: PlotIntentApi, private readonly signer: PlotTransactionSigner, scope: string) { this.storageKey = `plot.intent.v1.${scope}`; }
  private run<T>(fn: () => Promise<T>): Promise<T> { const work = this.queue.then(fn); this.queue = work.catch(() => {}); return work; }
  private async load(): Promise<IntentState | null> { const raw = await this.store.getItem(this.storageKey); return raw ? JSON.parse(raw) as IntentState : null; }
  private save(state: IntentState) { return this.store.setItem(this.storageKey, JSON.stringify(state)); }
  state() { return this.run(() => this.load()); }
  start(key: string, request: PlotRequest) {
    const snapshot = JSON.parse(JSON.stringify(request)) as PlotRequest;
    return this.run(async () => {
    validateRequest(snapshot); if (!key || key.length > 128) throw new Error('Clave de intención inválida.');
    const previous = await this.load(); if (previous && !['confirmed','failed','expired_absent'].includes(previous.stage)) throw new Error('Hay una operación pendiente de reconciliación.');
    const state: IntentState = { key, request: snapshot, stage: 'preparing' }; await this.save(state); return this.prepareSaved(state);
  }); }
  private async prepareSaved(state: IntentState) {
    const prepared = await this.api.prepare(state.key, state.request);
    if (state.id && state.id !== prepared.id) throw new Error('La intención cambió de identidad.');
    state.id = prepared.id; state.stage = prepared.status; await this.save(state); return { state, prepared };
  }
  /** Retrying prepare uses the original key and request, including after a lost response. */
  resumePreparation() { return this.run(async () => { const state = await this.load(); if (!state || !['preparing','prepared'].includes(state.stage)) throw new Error('No hay preparación recuperable.'); return this.prepareSaved(state); }); }
  signAndSubmit() { return this.run(async () => {
    const state = await this.load(); if (!state || state.stage !== 'prepared' || !state.id) throw new Error('Intención no preparada.');
    const { prepared } = await this.prepareSaved(state);
    if (prepared.status !== 'prepared') return state;
    const signed = await this.signer.sign(prepared.transaction, state.request.wallet);
    state.stage = 'submitting'; await this.save(state);
    await this.api.submit(prepared.id, signed);
    state.stage = 'submitted'; await this.save(state); return state;
  }); }
  reconcile() { return this.run(async () => {
    const state = await this.load(); if (!state?.id || !['submitting','submitted'].includes(state.stage)) throw new Error('No hay envío para reconciliar.');
    const status = await this.api.reconcile(state.id);
    // A submit may have reached the server even if it still reports prepared: do not re-sign.
    state.stage = status === 'prepared' ? 'submitting' : status; await this.save(state); return state;
  }); }
}
