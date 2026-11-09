import {parsePlotCommand,plotChatHelp} from '../plot-chat.js';
import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {Points,CHAT_BET_POINTS} from '../points.js';
import {closesAt,type Prediction} from '../prediction.js';
import {TwitchSource} from '../twitch-source.js';
import {joinPath} from '../public-paths.js';
import type {Documents} from './documents.js';

type Config={clientId:string;clientSecret:string;origin:string;webhookOrigin?:string;login?:string};
type Flow={kind:'account'|'channel';cookieHash:string;expires:number;accountId?:string;wallet?:string;twitchId?:string};
type Pending=Flow&{twitchId:string};
type AuthState={flows:Record<string,Flow>;pending:Record<string,Pending>;bot?:{id:string;login:string;clientId:string;authorizedAt:number}};
type Delivery={id:string;channelId:string;epoch:string;text:string;createdAt:number;status:'pending'|'sending'|'sent'|'failed';error?:string};
type Runtime={channels:Record<string,{phase:'connecting'|'connected'|'error';checkedAt:number;error?:string}>;events:Record<string,number>;cooldowns:Record<string,number>;outbox:Record<string,Delivery>;nextSendAt:number;moderators:Record<string,{users:string[];checkedAt:number}>};
type Channel={id:string;login:string;epoch:string};
type Subscription={id:string;status:string;type:string;condition:{broadcaster_user_id?:string;user_id?:string};transport:{method:string;callback?:string}};
const authState=():AuthState=>({flows:{},pending:{}});
const runtime=():Runtime=>({channels:{},events:{},cooldowns:{},outbox:{},nextSendAt:0,moderators:{}});
const nonce=()=>randomBytes(32).toString('hex');
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const equal=(a:string,b:string)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
const tidy=(s:string)=>s.replace(/[\r\n\t]/g,' ').replace(/\s+/g,' ').trim();
const botScopes=['user:read:chat','user:write:chat','user:bot'];
export class CloudTwitchBot {
 private appToken?:{value:string;expires:number};
 private discovery?:Promise<void>;
 private nextDiscovery=0;
 constructor(private documents:Pick<Documents,'read'|'update'>,private config:Config,private request:typeof fetch=fetch,private now=Date.now,private localPoints?:Points){}
 get configured(){return !!this.config.clientId&&!!this.config.clientSecret;}
 get callbackUrl(){return `${this.config.origin}/auth/twitch/bot/callback`;}
 get webhookUrl(){return `${this.config.webhookOrigin??this.config.origin}/api/twitch/bot/webhook`;}
 private get secret(){return createHmac('sha256',this.config.clientSecret).update('plot-eventsub-webhook-v1').digest('hex');}
 private async points(){if(this.localPoints)return this.localPoints;const p=new Points('',this.documents);await p.load();return p;}
 private async botAuthorization(){
  const existing=await this.documents.read('twitch-bot-auth',authState);
  if(!this.configured||existing.bot?.clientId===this.config.clientId)return existing;
  if(!this.discovery&&this.now()>=this.nextDiscovery){
   this.nextDiscovery=this.now()+60_000;
   this.discovery=(async()=>{
    const login=(this.config.login??'plotfun').toLowerCase();
    const users=z.object({data:z.array(z.object({id:z.string().regex(/^\d+$/),login:z.string()}))}).parse(await this.api(`users?login=${encodeURIComponent(login)}`));
    const user=users.data.find(u=>u.login.toLowerCase()===login);if(!user)return;
    const grants=z.object({data:z.array(z.object({user_id:z.string(),has_authorized:z.boolean(),scopes:z.array(z.string())}))}).parse(await this.api(`authorization/users?user_id=${user.id}`));
    if(!grants.data.some(g=>g.user_id===user.id&&g.has_authorized&&botScopes.every(scope=>g.scopes.includes(scope))))return;
    // Twitch grants survive a fresh local database. Recover only a verified bot identity.
    await this.documents.update('twitch-bot-auth',authState,s=>{s.bot={id:user.id,login:user.login,clientId:this.config.clientId,authorizedAt:this.now()};});
   })().finally(()=>{this.discovery=undefined;});
  }
  await this.discovery;
  return this.documents.read('twitch-bot-auth',authState);
 }
 async status(token?:string){
  const auth=await this.botAuthorization();const available=auth.bot?.clientId===this.config.clientId;
  if(!token)return {configured:this.configured,available,login:this.config.login??'plotfun'};
  const p=await this.points(),own=p.botState(token),state=await this.documents.read('twitch-bot-runtime',runtime),channel=own.twitch?state.channels[own.twitch.id]:undefined;
  const fresh=channel&&this.now()-channel.checkedAt<90_000;
  return {configured:this.configured,available,login:this.config.login??'plotfun',enabled:own.enabled,channel:own.twitch?.login??null,phase:!own.enabled?'disabled':!available?'unavailable':fresh?channel.phase:'connecting',error:own.enabled?channel?.error??null:null};
 }
 async start(kind:Flow['kind'],token?:string){
  if(!this.configured)throw new Error('Twitch todavía no está configurado');
  let identity:Partial<Flow>={};
  if(kind==='channel'){const p=await this.points(),a=p.me(token??'');if(!a.twitch)throw new Error('Vinculá primero tu canal de Twitch');identity={accountId:a.id,...(a.wallet?{wallet:a.wallet}:{}),twitchId:a.twitch.id};}
  const state=nonce(),cookie=nonce();
  await this.documents.update('twitch-bot-auth',authState,s=>{for(const map of [s.flows,s.pending])for(const [key,value] of Object.entries(map))if(value.expires<=this.now())delete map[key];if(Object.keys(s.flows).length>=1000)throw new Error('Demasiadas conexiones pendientes');s.flows[state]={kind,cookieHash:hash(cookie),expires:this.now()+600_000,...identity};});
  const url=new URL('https://id.twitch.tv/oauth2/authorize');url.search=new URLSearchParams({client_id:this.config.clientId,redirect_uri:this.callbackUrl,response_type:'code',scope:kind==='account'?botScopes.join(' '):'channel:bot',state,force_verify:'true'}).toString();return {url:url.href,cookie};
 }
 async callback(state:string,cookie:string,code:string,denied=false){
  const {result:flow}=await this.documents.update('twitch-bot-auth',authState,s=>{const f=s.flows[state];if(!f||f.expires<=this.now()||!cookie||!equal(f.cookieHash,hash(cookie)))throw new Error('La conexión venció o pertenece a otro navegador');delete s.flows[state];return f;});
  if(denied||!code||code.length>2048)throw new Error('Autorización cancelada');
  const response=await this.request('https://id.twitch.tv/oauth2/token',{method:'POST',body:new URLSearchParams({client_id:this.config.clientId,client_secret:this.config.clientSecret,grant_type:'authorization_code',redirect_uri:this.callbackUrl,code}),signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error('Twitch rechazó la autorización');
  const tokens=z.object({access_token:z.string().min(1)}).parse(await response.json());
  const validation=await this.request('https://id.twitch.tv/oauth2/validate',{headers:{Authorization:`OAuth ${tokens.access_token}`},signal:AbortSignal.timeout(10000)});
  if(!validation.ok)throw new Error('Twitch no pudo validar el permiso');
  const user=z.object({client_id:z.string(),user_id:z.string().regex(/^\d+$/),login:z.string(),scopes:z.array(z.string()),expires_in:z.number().positive()}).parse(await validation.json());
  const scopes=flow.kind==='account'?botScopes:['channel:bot'];
  if(user.client_id!==this.config.clientId||!scopes.every(scope=>user.scopes.includes(scope)))throw new Error('Twitch no otorgó los permisos necesarios');
  if(flow.kind==='account'){
   if(user.login.toLowerCase()!==(this.config.login??'plotfun').toLowerCase())throw new Error('Iniciá sesión con la cuenta plotfun para autorizar al bot');
   await this.documents.update('twitch-bot-auth',authState,s=>{s.bot={id:user.user_id,login:user.login,clientId:this.config.clientId,authorizedAt:this.now()};});
   // EventSub and Send Chat Message use an app token plus these durable authorization grants.
   // Discard the user token without revoking the grant that the account just approved.
   return {kind:'account' as const};
  }
  if(user.user_id!==flow.twitchId)throw new Error('Autorizá el mismo canal que vinculaste a tu cuenta');
  const ticket=nonce();await this.documents.update('twitch-bot-auth',authState,s=>{s.pending[ticket]={...flow,twitchId:user.user_id,expires:this.now()+300_000};});
  return {kind:'channel' as const,ticket};
 }
 async complete(token:string,ticket:string,cookie:string){
  const p=await this.points(),a=p.me(token);
  const {result}=await this.documents.update('twitch-bot-auth',authState,async s=>{const pending=s.pending[ticket];if(!pending||pending.expires<=this.now()||!equal(pending.cookieHash,hash(cookie))||a.id!==pending.accountId||(pending.wallet!==undefined&&a.wallet!==pending.wallet)||a.twitch?.id!==pending.twitchId)throw new Error('La cuenta cambió durante la conexión');delete s.pending[ticket];return p.setBotEnabled(token,true,{accountId:pending.accountId!,twitchId:pending.twitchId});});
  return result;
 }
 async disable(token:string){return (await this.points()).setBotEnabled(token,false);}
 verify(headers:Record<string,string>,body:Buffer){
  const id=headers['twitch-eventsub-message-id']??'',stamp=headers['twitch-eventsub-message-timestamp']??'',signature=headers['twitch-eventsub-message-signature']??'';
  if(!this.configured||!id||id.length>256||!Number.isFinite(Date.parse(stamp))||Math.abs(this.now()-Date.parse(stamp))>600_000)return false;
  const expected='sha256='+createHmac('sha256',this.secret).update(id+stamp).update(body).digest('hex');return equal(expected,signature);
 }
 /** Authoritative moderator check (P1-06): Twitch Get Moderators via the bot's app token,
  * cached briefly in the runtime aggregate. Never accepts client-sent role claims.
  * Called OUTSIDE any aggregate transaction: nested updates would deadlock the local queue.
  * Legacy runtimes persisted before this feature lack `moderators` and are normalized here.
  * Positive cache is short (30 s) so revocations apply within one creation window. */
 private async isModerator(channel:Channel,chatterId:string):Promise<boolean>{
  const state=await this.documents.read('twitch-bot-runtime',runtime);
  // Legacy normalization: pre-existing runtime aggregates may not carry the moderators map.
  const cached=(state.moderators??{})[channel.id];
  if(cached&&this.now()-cached.checkedAt<30_000)return cached.users.includes(chatterId);
  const fresh=await this.moderatorsOf(channel);
  const users=fresh.ok?fresh.users:undefined;
  if(!users)return false; // Twitch unavailable or unauthorized: deny without guessing; the owner path still works.
  // Keep the Points capability evidence (HTTP/publication path) in sync with the authoritative list.
  await this.points().then(p=>p.setChannelModerators(channel.id,users)).catch(()=>{});
  await this.documents.update('twitch-bot-runtime',runtime,s=>{(s.moderators??={})[channel.id]={users,checkedAt:this.now()};});
  return users.includes(chatterId);
 }
 /** Paginates Get Moderators fully; permission failures surface as typed unavailability. */
 private async moderatorsOf(channel:Channel):Promise<{ok:boolean;users?:string[];error?:string}>{
  const users:string[]=[];let after='';
  try{
   do{
    const page=await this.api(`moderation/moderators?broadcaster_id=${encodeURIComponent(channel.id)}&first=100${after?`&after=${encodeURIComponent(after)}`:''}`);
    const parsed=z.object({data:z.array(z.object({user_id:z.string()})).max(100),pagination:z.object({cursor:z.string().optional()}).optional()}).parse(page);
    users.push(...parsed.data.map(m=>m.user_id));after=parsed.pagination?.cursor??'';
    if(users.length>10000)throw new Error('Demasiados moderadores reportados por Twitch');
   }while(after);
   return {ok:true,users};
  }catch(e){
   const message=(e as Error).message;
   // Missing moderation:read scope is a configuration problem, not an empty moderator list.
   return {ok:false,error:/401|403/.test(message)?'Falta el permiso moderation:read para verificar moderadores':message};
  }
 }
 async webhook(headers:Record<string,string>,body:Buffer){
  if(!this.verify(headers,body))return {status:403,body:'Firma inválida'};
  const data=JSON.parse(body.toString('utf8')),type=headers['twitch-eventsub-message-type'];
  if(type==='webhook_callback_verification')return {status:200,body:z.string().max(1000).parse(data.challenge)};
  if(type==='revocation'){
   const id=data.subscription?.condition?.broadcaster_user_id;if(typeof id==='string')await this.documents.update('twitch-bot-runtime',runtime,s=>{s.channels[id]={phase:'error',checkedAt:this.now(),error:'Twitch retiró el permiso. Volvé a agregar el bot.'};});
   return {status:204,body:''};
  }
  if(type!=='notification'||data.subscription?.type!=='channel.chat.message')return {status:204,body:''};
  const event=z.object({broadcaster_user_id:z.string(),chatter_user_id:z.string(),message:z.object({text:z.string().max(2000)})}).parse(data.event);
  const auth=await this.documents.read('twitch-bot-auth',authState),p=await this.points(),channel=p.enabledBotChannels().find(c=>c.id===event.broadcaster_user_id);
  if(!channel||!auth.bot||data.subscription.condition?.user_id!==auth.bot.id||event.chatter_user_id===auth.bot.id)return {status:204,body:''};
  const plotMatch=/^!plot(?:\s+([\s\S]*))?$/i.exec(event.message.text.trim());
   if(plotMatch?.[1]){
    // Moderator evidence is resolved BEFORE the aggregate update: resolving it inside would
    // deadlock the local document queue and nest cloud transactions unnecessarily.
    const verifiedModerator=event.chatter_user_id!==channel.id&&await this.isModerator(channel,event.chatter_user_id);
    await this.documents.update('twitch-bot-runtime',runtime,async s=>{
     this.prune(s);const id=headers['twitch-eventsub-message-id'],key=`command:${id}`;if(s.events[id])return;
     if(event.chatter_user_id!==channel.id){if(this.now()-(s.cooldowns[channel.id]??0)<30_000)return;s.cooldowns[channel.id]=this.now();}
     let reply:string;
     try{
      const command=parsePlotCommand(event.message.text);
      reply=command?(await p.plotCommand(channel.id,event.chatter_user_id,command,id,verifiedModerator)).text:plotChatHelp;
     }catch(e){reply=(e as Error).message;}
    s.events[id]=this.now();s.outbox[key]={id:key,channelId:channel.id,epoch:channel.epoch,text:`${reply.slice(0,499-this.channelUrl(channel.login).length)} ${this.channelUrl(channel.login)}`,createdAt:this.now(),status:'pending'};
   });
   return {status:204,body:''};
  }
  // Chat bets: !yes/!no/!1..!6 from a viewer with a linked Twitch account (S19a).
  const chatMatch=/^!(yes|no|[1-6])\s*$/i.exec(event.message.text.trim());
  if(chatMatch){
   const outcome=chatMatch[1].toLowerCase(),reply=await this.chatBet(p,channel,event.chatter_user_id,outcome,headers['twitch-eventsub-message-id']??'');
   await this.documents.update('twitch-bot-runtime',runtime,s=>{this.prune(s);const key=`chat:${headers['twitch-eventsub-message-id']}`;if(s.events[key])return;s.events[key]=this.now();s.outbox[key]={id:key,channelId:channel.id,epoch:channel.epoch,text:`@${event.chatter_user_id}: ${reply}`.slice(0,500),createdAt:this.now(),status:'pending'};});
   return {status:204,body:''};
  }
  if(!/^!plot(?:\s|$)/i.test(event.message.text))return {status:204,body:''};
  await this.documents.update('twitch-bot-runtime',runtime,s=>{
   this.prune(s);const id=headers['twitch-eventsub-message-id'];if(s.events[id])return;s.events[id]=this.now();
   if(this.now()-(s.cooldowns[channel.id]??0)<30_000)return;s.cooldowns[channel.id]=this.now();
   const key=`command:${id}`;s.outbox[key]={id:key,channelId:channel.id,epoch:channel.epoch,text:`Plot: las predicciones de @${channel.login} están acá: ${this.channelUrl(channel.login)} · Crear: !plot crear Pregunta, Sí, No · Ayuda: !plot ayuda`,createdAt:this.now(),status:'pending'};
  });
  return {status:204,body:''};
 }
 private prune(s:Runtime){for(const [key,at] of Object.entries(s.events))if(at<this.now()-600_000)delete s.events[key];const events=Object.entries(s.events).sort((a,b)=>b[1]-a[1]);for(const [key] of events.slice(5000))delete s.events[key];for(const [key,job] of Object.entries(s.outbox))if(!key.startsWith('welcome:')&&job.createdAt<this.now()-86400_000)delete s.outbox[key];}
 private channelUrl(login:string){return `${this.config.origin}${joinPath('twitch',login)}`;}
 /** Resolves the channel's open prediction and places the internal-balance bet for a linked viewer. */
 private async chatBet(p:Points,channel:Channel,chatterId:string,outcome:string,messageId:string):Promise<string>{
  try{
   const own=p.markets().filter(m=>m.source==='plot'&&m.prediction.channel===channel.login&&!['resolved','void'].includes(m.phase));
   if(own.length&&!own[0].canBet)return 'Las apuestas de esta predicción ya están cerradas.';
   const predictions=own.length?own.map(m=>m.prediction):await new TwitchSource(p).active(channel.login);
   const open=predictions.find(pred=>pred.status==='ACTIVE'&&!pred.lockedAt&&closesAt(pred)>this.now());
   if(!open)return 'No hay predicciones abiertas en este canal.';
   const option=isNaN(Number(outcome))
    ?open.outcomes.findIndex(o=>o.title.trim().toLowerCase()===(outcome==='yes'?'sí':'no')||o.title.trim().toLowerCase()===(outcome==='yes'?'si':'no'))
    :Number(outcome)-1;
   const chosen=open.outcomes[option];
   if(!chosen)return `Esa opción no existe. Las opciones son: ${open.outcomes.map((o,i)=>`!${i+1} ${o.title}`).join(' · ')}.`;
   const key=own.find(m=>m.prediction.id===open.id)?.key??`offchain:${channel.login}:${open.id}`;
   if(!own.length)await p.accept(open);
   // Each new intentional chat event is a new bet; a replayed EventSub message hits the same receipt and does not double-debit.
   await p.chatBet(chatterId,key,chosen.id,`chat:${messageId}:${chatterId}:${open.id}:${chosen.id}`);
   return `Apostaste ${CHAT_BET_POINTS} puntos a "${chosen.title}". Revisá tus predicciones en ${this.channelUrl(channel.login)}.`;
  }catch(e){return (e as Error).message.slice(0,300);}
 }
 private async accessToken(){
  if(this.appToken&&this.appToken.expires>this.now()+60_000)return this.appToken.value;
  const r=await this.request('https://id.twitch.tv/oauth2/token',{method:'POST',body:new URLSearchParams({client_id:this.config.clientId,client_secret:this.config.clientSecret,grant_type:'client_credentials'}),signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw new Error('No se pudo autenticar la aplicación de Twitch');const t=z.object({access_token:z.string().min(1),expires_in:z.number().positive()}).parse(await r.json());this.appToken={value:t.access_token,expires:this.now()+t.expires_in*1000};return t.access_token;
 }
 private async api(path:string,init:RequestInit={}){
  const run=async()=>this.request(`https://api.twitch.tv/helix/${path}`,{...init,headers:{Authorization:`Bearer ${await this.accessToken()}`,'Client-Id':this.config.clientId,'Content-Type':'application/json'},signal:AbortSignal.timeout(10000)});
  let r=await run();if(r.status===401){this.appToken=undefined;r=await run();}if(!r.ok)throw new Error(`Twitch API ${r.status}`);return r.status===204?{}:r.json();
 }
 private async subscriptions(){const all:Subscription[]=[];let after='';do{const page=await this.api(`eventsub/subscriptions?first=100${after?'&after='+encodeURIComponent(after):''}`);const parsed=z.object({data:z.array(z.object({id:z.string(),status:z.string(),type:z.string(),condition:z.object({broadcaster_user_id:z.string().optional(),user_id:z.string().optional()}),transport:z.object({method:z.string(),callback:z.string().optional()})})),pagination:z.object({cursor:z.string().optional()}).optional()}).parse(page);all.push(...parsed.data);after=parsed.pagination?.cursor??'';if(all.length>10000)throw new Error('Demasiadas suscripciones de Twitch');}while(after);return all;}
 async sync(snapshot:(channel:string)=>{prediction:Prediction;market:{byteMarketId?:string;state:string}}[],canRun:()=>boolean=()=>true){
  if(!this.configured||!canRun())return;
  const auth=await this.botAuthorization();if(!auth.bot||auth.bot.clientId!==this.config.clientId)return;
  const p=await this.points(),channels=p.enabledBotChannels();const all=await this.subscriptions();
  const owned=all.filter(sub=>sub.type==='channel.chat.message'&&sub.condition.user_id===auth.bot!.id&&sub.transport.method==='webhook'&&sub.transport.callback===this.webhookUrl);
  for(const sub of owned)if(!channels.some(c=>c.id===sub.condition.broadcaster_user_id)||!['enabled','webhook_callback_verification_pending'].includes(sub.status)){if(!canRun())return;await this.api(`eventsub/subscriptions?id=${encodeURIComponent(sub.id)}`,{method:'DELETE'});}
  for(const channel of channels){
   if(!canRun())return;
   try{
    const found=owned.find(sub=>sub.condition.broadcaster_user_id===channel.id&&['enabled','webhook_callback_verification_pending'].includes(sub.status));
    if(!found){await this.api('eventsub/subscriptions',{method:'POST',body:JSON.stringify({type:'channel.chat.message',version:'1',condition:{broadcaster_user_id:channel.id,user_id:auth.bot.id},transport:{method:'webhook',callback:this.webhookUrl,secret:this.secret}})});}
    const phase=found?.status==='enabled'?'connected':'connecting';
    await this.documents.update('twitch-bot-runtime',runtime,s=>{s.channels[channel.id]={phase,checkedAt:this.now()};this.prune(s);if(phase!=='connected')return;
     this.enqueue(s,channel,`welcome:${channel.epoch}`,`Plot conectado a @${channel.login}. Escribí !plot para ver las predicciones. ${this.channelUrl(channel.login)}`);
     for(const item of snapshot(channel.login)){const pred=item.prediction;if(item.market.state!=='created'||!item.market.byteMarketId||pred.status!=='ACTIVE'||closesAt(pred)<=this.now())continue;this.enqueue(s,channel,`prediction:${channel.id}:${pred.id}`,`Nueva predicción: ${tidy(pred.title)}. ${this.channelUrl(channel.login)}`);}
    });
   }catch{await this.documents.update('twitch-bot-runtime',runtime,s=>{s.channels[channel.id]={phase:'error',checkedAt:this.now(),error:'No se pudo conectar el chat. Volvé a autorizar el bot si Twitch retiró el permiso.'};});}
  }
  if(!canRun())return;
  const {result:job}=await this.documents.update('twitch-bot-runtime',runtime,s=>{
   if(s.nextSendAt>this.now())return undefined;
   const queued=Object.values(s.outbox).filter(item=>item.status==='pending').sort((a,b)=>Number(!a.id.startsWith('welcome:'))-Number(!b.id.startsWith('welcome:'))||a.createdAt-b.createdAt||a.id.localeCompare(b.id));
   for(const item of queued){
    const current=channels.find(c=>c.id===item.channelId&&c.epoch===item.epoch);if(!current||s.channels[item.channelId]?.phase!=='connected'){if(!current)item.status='failed';continue;}
    item.status='sending';s.nextSendAt=this.now()+1600;return {...item};
   }
   return undefined;
  });
  if(!job||!canRun())return;
  // Check the authoritative account again immediately before sending; a disable cancels queued work.
  const current=(await this.points()).enabledBotChannels().some(c=>c.id===job.channelId&&c.epoch===job.epoch);
  let sent=false;if(current)try{const result=await this.api('chat/messages',{method:'POST',body:JSON.stringify({broadcaster_id:job.channelId,sender_id:auth.bot.id,message:[...tidy(job.text)].slice(0,500).join(''),for_source_only:true})});sent=z.object({data:z.array(z.object({is_sent:z.boolean()})).length(1)}).parse(result).data[0].is_sent;}catch{/* Ambiguous sends remain failed to avoid duplicate public messages. */}
  await this.documents.update('twitch-bot-runtime',runtime,s=>{const item=s.outbox[job.id];if(item){item.status=sent?'sent':'failed';if(!sent)item.error='No se confirmó la entrega del mensaje';}});
 }
 private enqueue(s:Runtime,channel:Channel,id:string,text:string){if(s.outbox[id])return;if(id.startsWith('welcome:'))for(const [key,job] of Object.entries(s.outbox))if(key.startsWith('welcome:')&&job.channelId===channel.id&&job.epoch!==channel.epoch)delete s.outbox[key];s.outbox[id]={id,channelId:channel.id,epoch:channel.epoch,text,createdAt:this.now(),status:'pending'};}
}
