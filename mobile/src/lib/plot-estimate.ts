import type { PlotReadMarket } from './plot-read-client';
/** Estimate only from confirmed pool and fee snapshot. Own existing stake is included. */
export function plotEstimate(market:PlotReadMarket,optionId:string,addition:string,existing:string='0') {
 if(market.chainStatus!=='open'||market.treasuryBps===null||market.streamerBps===null||market.options.some(o=>o.stake===null)||!/^([1-9]\d*)$/.test(addition)||!/^(0|[1-9]\d*)$/.test(existing))return null;
 const chosen=market.options.find(o=>o.id===optionId);if(!chosen||chosen.stake===null)return null;
 const add=BigInt(addition),previous=BigInt(existing);if(previous>BigInt(chosen.stake))return null;
 const own=previous+add,total=market.options.reduce((n,o)=>n+BigInt(o.stake!),0n)+add,side=BigInt(chosen.stake)+add;
 const net=total-total*BigInt(market.treasuryBps)/10000n-total*BigInt(market.streamerBps)/10000n;
 const payout=own*net/side;return {payout:payout.toString(),net:(payout-own).toString()};
}
