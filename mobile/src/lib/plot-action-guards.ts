import type { PlotAccount } from './plot-account-client';
import type { PlotReadMarket } from './plot-read-client';
export function accountFinalized(account: PlotAccount | null): account is PlotAccount & {balance:string} { return !!account && account.readStatus === 'finalized' && account.balance !== null; }
export function predictionAvailable(account: PlotAccount | null, market: PlotReadMarket): boolean {
  return accountFinalized(account) && market.chainStatus === 'open' && market.twitchStatus === 'open' && market.treasuryBps !== null && market.streamerBps !== null && market.options.every(o=>o.stake !== null && o.optionIndex !== null);
}
export function claimAvailable(account: PlotAccount | null, market: PlotReadMarket): boolean {
  const position=account?.positions.find(p=>p.marketId===market.id);
  return !!position && accountFinalized(account) && !position.claimed && position.payout !== null && position.payout !== '0' && (position.chainStatus === 'resolved' || position.chainStatus === 'canceled') && market.chainStatus === position.chainStatus && market.treasuryFee !== null && market.streamerFee !== null;
}
