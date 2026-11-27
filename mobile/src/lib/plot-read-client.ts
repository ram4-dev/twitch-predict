/** Public Twitch projection. Chain fields are deliberately nullable until reconciled. */
export type PlotReadMarket = {
  id: string; broadcasterId: string; predictionId: string; title: string | null;
  options: { id: string; label: string | null; stake: null }[];
  twitchStatus: 'open' | 'locked' | 'resolved' | 'canceled';
  winnerId: string | null; chainStatus: null; streamerFee: null; treasuryFee: null;
  closesAt: string; timeoutAt: string;
};
export interface PlotReadPort { markets(): Promise<PlotReadMarket[]> }
type Fetcher = (url: string, init: RequestInit) => Promise<{ ok: boolean; json(): Promise<unknown> }>;
const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const nullableText = (v: unknown) => v === null || typeof v === 'string';
export function parsePlotMarkets(body: unknown): PlotReadMarket[] {
  if (!record(body) || !Array.isArray(body.markets)) throw new Error('Respuesta de mercados PLOT inválida.');
  return body.markets.map((value: unknown) => {
    if (!record(value) || typeof value.id !== 'string' || typeof value.broadcasterId !== 'string' || typeof value.predictionId !== 'string' || !nullableText(value.title) || !nullableText(value.winnerId) || !['open', 'locked', 'resolved', 'canceled'].includes(String(value.twitchStatus)) || value.chainStatus !== null || value.streamerFee !== null || value.treasuryFee !== null || typeof value.closesAt !== 'string' || typeof value.timeoutAt !== 'string' || !Array.isArray(value.options) || value.options.length < 2 || value.options.length > 6 || !value.options.every((o: unknown) => record(o) && typeof o.id === 'string' && nullableText(o.label) && o.stake === null)) throw new Error('Datos de mercado PLOT incompatibles.');
    return value as PlotReadMarket;
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
