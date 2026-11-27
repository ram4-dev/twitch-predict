/** PLOT quantities are decimal integer strings; never mix them with Byte. */
export type PlotAmount = string;
export type PlotMarket = {
  id: string; title: string; status: 'open' | 'pending' | 'resolved' | 'cancelled' | null;
  options: { id: string; label: string; stake: PlotAmount | null }[];
  winnerId?: string; streamerFee: PlotAmount | null; treasuryFee: PlotAmount | null;
};
export type PlotPosition = { marketId: string; optionId: string; stake: PlotAmount; payout: PlotAmount; claimed: boolean };
export type PlotSnapshot = { balance: PlotAmount; markets: PlotMarket[]; positions: PlotPosition[] };
export type PlotIntent = { id: string; operation: 'purchase' | 'predict' | 'claim'; status: 'awaiting_signature' | 'pending' | 'confirmed' | 'failed' };
/** Implementations must reconcile ambiguous submissions before accepting a retry. */
export interface PlotPort {
  login(): Promise<void>;
  session(): Promise<{ loggedIn: boolean; pending: PlotIntent | null }>;
  read(): Promise<PlotSnapshot>;
  purchase(amount: PlotAmount): Promise<PlotIntent>;
  predict(marketId: string, optionId: string, amount: PlotAmount): Promise<PlotIntent>;
  claim(marketId: string): Promise<PlotIntent>;
  reconcile(intentId: string): Promise<PlotIntent>;
}
export interface PlotSigner { sign(message: Uint8Array): Promise<Uint8Array> }

function integer(value: string): bigint {
  if (!/^(0|[1-9]\d*)$/.test(value)) throw new Error('Cantidad PLOT inválida');
  return BigInt(value);
}
/** Estimate includes the new stake in both the selected side and the pool. */
export function estimatePayout(market: PlotMarket, optionId: string, amount: PlotAmount, existingStake: PlotAmount = '0'): PlotAmount {
  if (market.status !== 'open' || market.streamerFee === null || market.treasuryFee === null || market.options.some(item => item.stake === null)) throw new Error('Datos del mercado confirmando');
  const stake = integer(amount);
  const ownStake = stake + integer(existingStake);
  const option = market.options.find(item => item.id === optionId);
  if (!option) throw new Error('Opción desconocida');
  const total = market.options.reduce((sum, item) => sum + integer(item.stake!), 0n) + stake;
  const selected = integer(option.stake!) + stake;
  if (selected === 0n) return '0';
  const net = total - total * 200n / 10000n - total * 200n / 10000n;
  return (ownStake * net / selected).toString();
}
