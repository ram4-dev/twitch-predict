import type {ByteConfig,DisplayByteMarket} from './byte-model.js';
export const MARKET_CACHE_FRESH_MS=30_000;
export type PopupCache={version:1;base:string;scope:string;markets:DisplayByteMarket[];marketsAt:number;config?:ByteConfig;configAt:number;account?:{wallet:string|null};balance?:{wallet:string;lamports:number;at:number}};
export async function popupScope(base:string,token?:string){return `${base}:${Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token??''))),b=>b.toString(16).padStart(2,'0')).join('')}`;}
export function matchingCache(value:PopupCache|undefined,base:string,scope:string):PopupCache|undefined{return value?.version===1&&value.base===base&&value.scope===scope&&Array.isArray(value.markets)?value:undefined;}
export function cacheAllowsBet(cache:PopupCache,now=Date.now()){return cache.marketsAt>0&&now-cache.marketsAt<MARKET_CACHE_FRESH_MS&&now-cache.configAt<300_000;}
export function cachedBalance(cache:PopupCache){return cache.account?.wallet&&cache.balance?.wallet===cache.account.wallet&&Number.isSafeInteger(cache.balance.lamports)&&cache.balance.lamports>=0?cache.balance.lamports:undefined;}
