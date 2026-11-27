/** Public Twitch projection. Chain fields are deliberately nullable until reconciled. */
export type PlotReadMarket = {
  id: string; broadcasterId: string; predictionId: string; marketIdentity: string; title: string | null;
  options: { id: string; label: string | null; optionIndex: number | null; stake: string | null }[];
  twitchStatus: 'open' | 'locked' | 'resolved' | 'canceled';
  winnerId: string | null; chainStatus: 'open' | 'locked' | 'resolved' | 'canceled' | null; streamerFee: string | null; treasuryFee: string | null;
  closesAt: string; timeoutAt: string;
};
export interface PlotReadPort { markets(): Promise<PlotReadMarket[]> }
type Fetcher = (url: string, init: RequestInit) => Promise<{ ok: boolean; json(): Promise<unknown> }>;
const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const amount = (v: unknown) => typeof v === 'string' && /^(0|[1-9]\d*)$/.test(v) && BigInt(v) <= 18446744073709551615n;
const nullableText = (v: unknown) => v === null || typeof v === 'string';
export function parsePlotMarkets(body: unknown): PlotReadMarket[] {
  if (!record(body) || !Array.isArray(body.markets)) throw new Error('Respuesta de mercados PLOT inválida.');
  return body.markets.map((value: unknown) => {
    if (!record(value) || typeof value.id !== 'string' || typeof value.broadcasterId !== 'string' || typeof value.predictionId !== 'string' || typeof value.marketIdentity !== 'string' || !/^[0-9a-f]{64}$/.test(value.marketIdentity) || !nullableText(value.title) || !nullableText(value.winnerId) || !['open', 'locked', 'resolved', 'canceled'].includes(String(value.twitchStatus)) || !(value.chainStatus === null || ['open','locked','resolved','canceled'].includes(String(value.chainStatus))) || !(value.streamerFee === null || amount(value.streamerFee)) || !(value.treasuryFee === null || amount(value.treasuryFee)) || typeof value.closesAt !== 'string' || typeof value.timeoutAt !== 'string' || !Array.isArray(value.options) || value.options.length < 2 || value.options.length > 6 || !value.options.every((o: unknown) => record(o) && typeof o.id === 'string' && nullableText(o.label) && (o.optionIndex === null || (Number.isInteger(o.optionIndex) && Number(o.optionIndex) >= 0 && Number(o.optionIndex) <= 5)) && (o.stake === null || amount(o.stake)))) throw new Error('Datos de mercado PLOT incompatibles.');
    const market = value as PlotReadMarket;
    if (market.chainStatus === null && (market.options.some(o => o.stake !== null || o.optionIndex !== null) || market.streamerFee !== null || market.treasuryFee !== null)) throw new Error('Estado de cadena inconsistente.');
    if (market.chainStatus !== null && (market.options.some(o => o.stake === null || o.optionIndex === null) || new Set(market.options.map(o => o.optionIndex)).size !== market.options.length || market.options.some(o => o.optionIndex! >= market.options.length))) throw new Error('Opciones de cadena incompletas.');
    return market;
  });
}
export class PlotHttpReadClient implements PlotReadPort {
  constructor(private readonly base: string, private readonly request: Fetcher = fetch) {}
  async markets() {
    const response = await this.request(`${this.base}/api/plot/v1/markets`, { headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error('No se pudieron consultar los mercados PLOT.');
    return parsePlotMarkets(await response.json());
  }
}
