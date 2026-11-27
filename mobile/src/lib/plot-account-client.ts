export type PlotAccount = { wallet: string; balance: string | null; readStatus: 'finalized' | 'confirming'; positions: { marketId: string; optionId: string; optionIndex: number; sequence: string; stake: string; payout: string | null; claimed: boolean; chainStatus: 'open' | 'locked' | 'resolved' | 'canceled' }[] };
const object = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const integer = (x: unknown) => typeof x === 'string' && /^(0|[1-9]\d*)$/.test(x) && BigInt(x) <= 18446744073709551615n;
export function parsePlotAccount(input: unknown, wallet: string): PlotAccount {
  if (!object(input) || input.wallet !== wallet || !(input.balance === null || integer(input.balance)) || !['finalized', 'confirming'].includes(String(input.readStatus)) || !Array.isArray(input.positions) || !input.positions.every((p: unknown) => object(p) && typeof p.marketId === 'string' && typeof p.optionId === 'string' && Number.isInteger(p.optionIndex) && Number(p.optionIndex) >= 0 && Number(p.optionIndex) <= 5 && integer(p.sequence) && integer(p.stake) && (p.payout === null || integer(p.payout)) && typeof p.claimed === 'boolean' && ['open','locked','resolved','canceled'].includes(String(p.chainStatus)))) throw new Error('Cuenta PLOT inválida o wallet distinta.');
  return input as PlotAccount;
}
export interface PlotAuthenticatedTransport { request(path: string, init: RequestInit): Promise<unknown> }
/** Token is held only by the injected session; never persisted with account data. */
export class PlotAccountClient {
  constructor(private readonly transport: PlotAuthenticatedTransport, private readonly wallet: string) {}
  async read() { return parsePlotAccount(await this.transport.request('/api/plot/v1/account', { method: 'GET' }), this.wallet); }
}
export function plotTransport(base: string, token: () => Promise<string>, request: typeof fetch = fetch): PlotAuthenticatedTransport {
  return { async request(path, init) {
    const session = await token(); if (!session) throw new Error('Iniciá sesión en Plot.');
    const response = await request(`${base}${path}`, { ...init, headers: { ...init.headers, authorization: `Bearer ${session}`, accept: 'application/json', 'content-type': 'application/json' } });
    if (!response.ok) throw new Error(`Solicitud PLOT pendiente o rechazada (${response.status}).`);
    return response.json();
  } };
}
