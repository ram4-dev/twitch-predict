export const POINTS_PER_USDC = 1000;
export const USDC_DEVNET = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
export const USDC_MAINNET = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const MAINNET_GENESIS = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
export type FundingNetwork = 'devnet'|'mainnet-beta';
export type Currency = 'USDC' | 'SOL';
export type FundingOrder = {
  id:string; network:FundingNetwork; accountId:string; wallet:string; direction:'deposit'|'withdraw'; currency:Currency;
  units:string; points:number; solPrice:string; createdAt:string; expiresAt:string;
  transaction:string; lastValidBlockHeight:number;
  status:'quoted'|'pending'|'confirmed'|'failed'|'expired'; signature?:string; signedTransaction?:string;
};
export type PublicFundingOrder = Omit<FundingOrder,'accountId'|'signedTransaction'>;
export function publicOrder(order:FundingOrder):PublicFundingOrder {
  const result={...order} as Partial<FundingOrder>;
  delete result.accountId;delete result.signedTransaction;
  return result as PublicFundingOrder;
}
// Monetary arithmetic uses integer base units, including the quoted SOL/USDC price.
export function parseUnits(value:string,decimals:number):bigint {
  if(!new RegExp(`^(0|[1-9]\\d{0,12})(\\.\\d{1,${decimals}})?$`).test(value))throw new Error(`Ingresá un importe con hasta ${decimals} decimales`);
  const [whole,fraction='']=value.split('.');
  const units=BigInt(whole)*10n**BigInt(decimals)+BigInt(fraction.padEnd(decimals,'0'));
  if(units<=0n||units>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('Importe fuera de rango');
  return units;
}
export function fundingAmount(direction:FundingOrder['direction'],currency:Currency,input:string,solPrice:string) {
  const scale=currency==='USDC'?1_000_000n:1_000_000_000n;
  const price=currency==='USDC'?1_000_000n:parseUnits(solPrice,6);
  const points=direction==='deposit'
    ? parseUnits(input,currency==='USDC'?6:9)*price*BigInt(POINTS_PER_USDC)/(scale*1_000_000n)
    : /^\d{1,9}$/.test(input)?BigInt(input):0n;
  if(points<1n||points>1_000_000n)throw new Error('La operación admite entre 1 y 1.000.000 puntos');
  const units=direction==='deposit'?parseUnits(input,currency==='USDC'?6:9):points*scale*1_000_000n/(price*BigInt(POINTS_PER_USDC));
  if(units<=0n||units>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('Importe fuera de rango');
  return {points:Number(points),units:units.toString()};
}
