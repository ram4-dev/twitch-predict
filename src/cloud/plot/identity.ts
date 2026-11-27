import {createHash} from 'node:crypto';
/** Length-prefixed UTF-8 seed encoding, as published in Anchor f6bb39d. */
export function plotIdentityHash(domain:string,parts:string[]):string{
 const h=createHash('sha256').update(Buffer.from(domain,'utf8'));
 for(const part of parts){const bytes=Buffer.from(part,'utf8'),length=Buffer.alloc(4);length.writeUInt32LE(bytes.length);h.update(length).update(bytes);}
 return h.digest('hex');
}
export const twitchMarketHash=(broadcaster:string,prediction:string)=>plotIdentityHash('plot:market:v1',['twitch',broadcaster,prediction]);
export const twitchOutcomeHash=(broadcaster:string,prediction:string,outcome:string)=>plotIdentityHash('plot:outcome:v1',[broadcaster,prediction,outcome]);
