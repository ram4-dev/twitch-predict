import {z} from 'zod';

export const BYTE_PROGRAM='24Vpfc8vEZtTnC9yLmbBHx13PyV8aEHVYBF5YE4BgRYK';
export const DEVNET_GENESIS='EtWTRABZaYq6iMfeYKouRu166VU2xqa1';
const address=z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
export const marketId=z.string().regex(/^pm_[a-zA-Z0-9_-]{1,100}$/);
const amount=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const byteMarketSchema=z.object({
  id:marketId,title:z.string().max(140),options:z.array(z.string().max(40)).min(2).max(6),
  currency:z.enum(['sol','byte']),status:z.enum(['open','resolved','invalid']),
  bettable:z.boolean(),resolvable:z.boolean(),openMs:amount,closeMs:amount,
  chain:z.object({market:address,settled:z.boolean()}),
  pools:z.array(amount).min(2).max(6),total:amount,bettors:amount,
  winner:z.number().int().min(0).max(5).nullable(),invalidReason:z.string().nullable(),
});
export const byteConfigSchema=z.object({enabled:z.boolean(),sol:z.object({
  programId:z.literal(BYTE_PROGRAM),cluster:z.literal('devnet'),
  maxBet:amount.positive(),maxPool:amount.positive(),
})});
export const createByteMarketSchema=z.object({
  title:z.string().trim().min(3).max(140),
  options:z.array(z.string().trim().min(1).max(40)).min(2).max(6).refine(a=>new Set(a.map(s=>s.toLowerCase())).size===a.length,'Las opciones deben ser distintas'),
  windowSecs:z.number().int().min(60).max(604800),currency:z.literal('sol'),wallet:address.optional(),
  channel:z.string().trim().regex(/^[a-zA-Z0-9_]{1,40}$/).transform(s=>s.toLowerCase()),
  rules:z.string().trim().min(10).max(2000),requestId:z.string().uuid(),
});
export type CreateByteMarket=z.infer<typeof createByteMarketSchema>;
export type ByteMarket=z.infer<typeof byteMarketSchema>;
export type ByteConfig=z.infer<typeof byteConfigSchema>;
export type MarketNotes={channel:string;rules:string;createdAt:string;resolution?:{winner:number|null;evidence:string;at:string}};
export type DisplayByteMarket=ByteMarket&{notes?:MarketNotes};

// Parse decimal SOL without floating point multiplication or silent rounding.
export function solToLamports(input:string):bigint {
  if(!/^(0|[1-9]\d*)(\.\d{1,9})?$/.test(input))throw new Error('Ingresá SOL con hasta 9 decimales.');
  const [whole,fraction='']=input.split('.');
  const result=BigInt(whole)*1_000_000_000n+BigInt(fraction.padEnd(9,'0'));
  if(result<100_000n||result>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('La apuesta mínima es 0,0001 SOL.');
  return result;
}
