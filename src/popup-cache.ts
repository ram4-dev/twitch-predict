import type {TwitchPreview} from './twitch-preview.js';
import type {ByteConfig,DisplayByteMarket} from './byte-model.js';
export const MARKET_CACHE_FRESH_MS=30_000;
export type PopupCache={version:1;base:string;scope:string;markets:DisplayByteMarket[];predictions?:TwitchPreview[];marketsAt:number;config?:ByteConfig;configAt:number;account?:{wallet:string|null};balance?:{wallet:string;lamports:number;at:number}};
export async function popupScope(base:string,token?:string){return `${base}:${Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token??''))),b=>b.toString(16).padStart(2,'0')).join('')}`;}
export function matchingCache(value:PopupCache|undefined,base:string,scope:string):PopupCache|undefined{return value?.version===1&&value.base===base&&value.scope===scope&&Array.isArray(value.markets)?value:undefined;}
export function cacheAllowsBet(cache:PopupCache,now=Date.now()){return cache.marketsAt>0&&now-cache.marketsAt<MARKET_CACHE_FRESH_MS&&now-cache.configAt<300_000;}
export function cachedBalance(cache:PopupCache){return cache.account?.wallet&&cache.balance?.wallet===cache.account.wallet&&Number.isSafeInteger(cache.balance.lamports)&&cache.balance.lamports>=0?cache.balance.lamports:undefined;}

type PopupPrediction={prediction:{id:string;channel:string;status?:string};market?:{byteMarketId?:string}};
// Titles are deliberately not identities: streamers reuse the same question.
// Legacy snapshots can lose the Byte ID while retaining the original Twitch ID.
export function reconcileBytePredictions<T extends PopupPrediction>(markets:DisplayByteMarket[],predictions:T[],channel:string){
 const normalize=(name:string)=>name.toLowerCase();
 const visible=[...new Map(markets.filter(m=>!channel||normalize(m.notes?.channel??'')===normalize(channel)).map(m=>[m.id,m])).values()];
 const unmatched=new Map<string,T>();
 const rank=(status?:string)=>status==='RESOLVED'||status==='CANCELED'?3:status==='LOCKED'?2:1;
 for(const item of predictions){
  const p=item.prediction;if(channel&&normalize(p.channel)!==normalize(channel))continue;
  const covered=visible.some(m=>normalize(m.notes?.channel??'')===normalize(p.channel)&&(m.id===item.market?.byteMarketId||m.notes?.twitch?.predictionId===p.id));
  if(covered)continue;
  const key=`${normalize(p.channel)}:${p.id}`,old=unmatched.get(key);
  if(!old||rank(p.status)>=rank(old.prediction.status))unmatched.set(key,item);
 }
 return {markets:visible,predictions:[...unmatched.values()]};
}
