import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import type {Pool} from 'pg';
import {TwitchProjection,type TwitchEvent,type VerifiedTwitchSource} from './twitch.js';
const id=z.string().min(1).max(256);
const notification=z.object({subscription:z.object({type:z.enum(['channel.prediction.lock','channel.prediction.end']),version:z.literal('1'),condition:z.object({broadcaster_user_id:id})}),event:z.object({id,broadcaster_user_id:id,status:z.enum(['resolved','canceled']).optional(),winning_outcome_id:id.nullable().optional()})});
export class EventSubAdapter {
 constructor(private secret:string,private projection:TwitchProjection,private now:()=>number=Date.now){if(secret.length<10||secret.length>100||!/^[\x20-\x7e]+$/.test(secret))throw new Error('Invalid EventSub secret');}
 async handle(headers:Record<string,string>,body:Buffer){
  const idValue=headers['twitch-eventsub-message-id']??'',timestamp=headers['twitch-eventsub-message-timestamp']??'',signature=headers['twitch-eventsub-message-signature']??'';
  const time=Date.parse(timestamp),expected='sha256='+createHmac('sha256',this.secret).update(idValue+timestamp).update(body).digest('hex');
  const a=Buffer.from(signature),b=Buffer.from(expected);
  if(!idValue||idValue.length>256||!Number.isFinite(time)||Math.abs(this.now()-time)>600_000||a.length!==b.length||!timingSafeEqual(a,b))return {status:403,body:'Invalid signature'};
  const parsed:unknown=JSON.parse(body.toString('utf8')),type=headers['twitch-eventsub-message-type'];
  if(type==='webhook_callback_verification')return {status:200,body:z.object({challenge:z.string().max(1000)}).parse(parsed).challenge};
  if(type==='revocation')return {status:204,body:''};
  if(type!=='notification')return {status:400,body:'Invalid message type'};
  const data=notification.parse(parsed),event=data.event;
  if(data.subscription.condition.broadcaster_user_id!==event.broadcaster_user_id)throw new Error('Broadcaster mismatch');
  const isLock=data.subscription.type==='channel.prediction.lock';
  if(!isLock&&!event.status)throw new Error('Missing result');
  const kind=isLock?'lock':event.status==='resolved'?'resolve':'cancel';
  if(kind==='resolve'&&!event.winning_outcome_id)throw new Error('Missing winner');
  await this.projection.ingest({id:idValue,broadcaster:event.broadcaster_user_id,prediction:event.id,kind,...(kind==='resolve'?{winner:event.winning_outcome_id!}:{}),source:'eventsub'});
  return {status:204,body:''};
 }
}
/** A broadcaster's validated user token is required for Helix Get Predictions. */
export class HelixPredictionSource implements VerifiedTwitchSource {
 constructor(private pool:Pool,private namespace:string,private clientId:string,private token:string,private request:typeof fetch=fetch){}
 async poll():Promise<TwitchEvent[]>{
  if(!this.clientId||!this.token)throw new Error('Twitch predictions authorization missing');
  const validation=await this.request('https://id.twitch.tv/oauth2/validate',{headers:{Authorization:`OAuth ${this.token}`},signal:AbortSignal.timeout(10000)});
  if(!validation.ok)throw new Error('Twitch authorization invalid');
  const auth=z.object({client_id:id,user_id:id,scopes:z.array(z.string())}).parse(await validation.json());
  if(auth.client_id!==this.clientId||!auth.scopes.some(s=>['channel:read:predictions','channel:manage:predictions'].includes(s)))throw new Error('Twitch predictions scope missing');
  const {rows}=await this.pool.query("SELECT broadcaster,prediction FROM plot_private.plot_twitch_markets WHERE namespace=$1 AND broadcaster=$2",[this.namespace,auth.user_id]);
  const result:TwitchEvent[]=[];
  for(const row of rows){
   const query=new URLSearchParams({broadcaster_id:row.broadcaster,id:row.prediction});
   const response=await this.request(`https://api.twitch.tv/helix/predictions?${query}`,{headers:{Authorization:`Bearer ${this.token}`,'Client-Id':this.clientId},signal:AbortSignal.timeout(10000)});
   if(!response.ok)throw new Error('Helix predictions unavailable');
   const page=z.object({data:z.array(z.object({id,broadcaster_id:id,status:z.enum(['ACTIVE','LOCKED','RESOLVED','CANCELED']),title:z.string().max(500),outcomes:z.array(z.object({id,title:z.string().max(256)})),winning_outcome_id:id.nullable().optional()}))}).parse(await response.json());
   const item=page.data.find(p=>p.id===row.prediction&&p.broadcaster_id===row.broadcaster);if(!item)continue;
   await this.pool.query('UPDATE plot_private.plot_twitch_markets SET title=$4,outcome_labels=$5::jsonb WHERE namespace=$1 AND broadcaster=$2 AND prediction=$3',[this.namespace,item.broadcaster_id,item.id,item.title,JSON.stringify(Object.fromEntries(item.outcomes.map(o=>[o.id,o.title])))]);
   if(item.status==='ACTIVE')continue;
   const kind=item.status==='LOCKED'?'lock':item.status==='RESOLVED'?'resolve':'cancel';
   if(kind==='resolve'&&!item.winning_outcome_id)throw new Error('Helix winner missing');
   const eventId=createHash('sha256').update(JSON.stringify([item.broadcaster_id,item.id,item.status,item.winning_outcome_id??null])).digest('hex');
   result.push({id:`helix:${eventId}`,broadcaster:item.broadcaster_id,prediction:item.id,kind,...(kind==='resolve'?{winner:item.winning_outcome_id!}:{}),source:'helix'});
  }
  return result;
 }
}

/** Register only missing lock/end subscriptions for the validated broadcaster. */
export async function ensurePredictionSubscriptions(config:{clientId:string;clientSecret:string;userToken:string;secret:string;callback:string},request:typeof fetch=fetch){
 const callback=new URL(config.callback);if(callback.protocol!=='https:'||callback.username||callback.password||callback.port)throw new Error('Invalid EventSub callback');
 const validation=await request('https://id.twitch.tv/oauth2/validate',{headers:{Authorization:`OAuth ${config.userToken}`},signal:AbortSignal.timeout(10000)});
 if(!validation.ok)throw new Error('Twitch authorization invalid');
 const user=z.object({client_id:id,user_id:id,scopes:z.array(z.string())}).parse(await validation.json());
 if(user.client_id!==config.clientId||!user.scopes.some(s=>['channel:read:predictions','channel:manage:predictions'].includes(s)))throw new Error('Twitch predictions scope missing');
 const response=await request('https://id.twitch.tv/oauth2/token',{method:'POST',body:new URLSearchParams({client_id:config.clientId,client_secret:config.clientSecret,grant_type:'client_credentials'}),signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw new Error('Twitch app authorization unavailable');
 const token=z.object({access_token:id}).parse(await response.json()).access_token;
 const headers={Authorization:`Bearer ${token}`,'Client-Id':config.clientId,'Content-Type':'application/json'};
 const existing=new Set<string>();let cursor='';let pages=0;
 do{
  const params=new URLSearchParams({first:'100'});if(cursor)params.set('after',cursor);
  const page=await request(`https://api.twitch.tv/helix/eventsub/subscriptions?${params}`,{headers,signal:AbortSignal.timeout(10000)});if(!page.ok)throw new Error('EventSub list unavailable');
  const data=z.object({data:z.array(z.object({type:z.string(),status:z.string(),condition:z.object({broadcaster_user_id:z.string().optional()}),transport:z.object({method:z.string(),callback:z.string().optional()})})),pagination:z.object({cursor:z.string().optional()}).optional()}).parse(await page.json());
  for(const sub of data.data)if(sub.condition.broadcaster_user_id===user.user_id&&sub.transport.method==='webhook'&&sub.transport.callback===config.callback&&['enabled','webhook_callback_verification_pending'].includes(sub.status))existing.add(sub.type);
  cursor=data.pagination?.cursor??'';if(++pages>100)throw new Error('Too many EventSub pages');
 }while(cursor);
 for(const type of ['channel.prediction.lock','channel.prediction.end'])if(!existing.has(type)){
  const created=await request('https://api.twitch.tv/helix/eventsub/subscriptions',{method:'POST',headers,body:JSON.stringify({type,version:'1',condition:{broadcaster_user_id:user.user_id},transport:{method:'webhook',callback:config.callback,secret:config.secret}}),signal:AbortSignal.timeout(10000)});
  if(!created.ok)throw new Error('EventSub subscription unavailable');
 }
}
