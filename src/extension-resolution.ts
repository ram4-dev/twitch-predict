import type {DisplayByteMarket} from './byte-model.js';
import type {TwitchPreview} from './twitch-preview.js';

type Snapshot={fetchedAt?:string;predictions?:TwitchPreview[];byteMarkets?:DisplayByteMarket[]};
export type ResolutionAlert={id:string;channel:string;predictionId?:string;marketId?:string;at:number;delivery:'pending'|'opening'|'opened'|'blocked'|'seen'};
const TTL=10*60_000;
const terminal=(item:TwitchPreview)=>item.prediction.status==='CANCELED'||(item.prediction.status==='RESOLVED'&&item.prediction.outcomes.some(o=>o.id===item.prediction.winningOutcomeId));
// A first snapshot is history, not a new resolution. Only observed live rounds can trigger an alert.
export function resolutionTransitions(channel:string,previous:Snapshot|undefined,next:Snapshot,now=Date.now()):ResolutionAlert[]{
 if(!previous?.fetchedAt||now-Date.parse(previous.fetchedAt)>TTL)return [];
 const alerts=new Map<string,ResolutionAlert>();
 for(const item of next.predictions??[]){
  const p=item.prediction;if(p.channel!==channel||!terminal(item))continue;
  const old=previous.predictions?.find(o=>o.prediction.id===p.id&&o.prediction.channel===channel);
  if(!old||terminal(old)||!['ACTIVE','LOCKED'].includes(old.prediction.status))continue;
  // A real SOL market owns its own resolution. Source-only 429 previews can resolve without one.
  if(next.byteMarkets?.some(m=>m.notes?.twitch?.predictionId===p.id))continue;
  const id=`${channel}:${p.id}`;alerts.set(id,{id,channel,predictionId:p.id,at:now,delivery:'pending'});
 }
 for(const market of next.byteMarkets??[]){
  if(market.notes?.channel!==channel||market.status==='open')continue;
  if(market.status==='resolved'&&(market.winner===null||!market.options[market.winner]))continue;
  const old=previous.byteMarkets?.find(m=>m.id===market.id&&m.notes?.channel===channel);if(!old||old.status!=='open')continue;
  const predictionId=market.notes?.twitch?.predictionId,id=`${channel}:${predictionId??market.id}`;
  alerts.set(id,{id,channel,marketId:market.id,predictionId,at:now,delivery:'pending'});
 }
 return [...alerts.values()];
}

type ChromeApi={
 storage:{local:{get(key:string):Promise<Record<string,unknown>>;set(value:unknown):Promise<void>}};
 windows:{getLastFocused():Promise<{id?:number;focused:boolean}>};
 tabs:{query(options:{active:boolean;windowId:number}):Promise<{id?:number;url?:string}[]>};
 runtime:{getContexts(options:{contextTypes:string[]}):Promise<{windowId?:number}[]>};
 action:{openPopup(options:{windowId:number}):Promise<void>;setBadgeText(options:{tabId:number;text:string}):Promise<void>;setBadgeBackgroundColor(options:{tabId:number;color:string}):Promise<void>};
};
export function createResolutionNotifier(api:ChromeApi){
 let queue=Promise.resolve();
 const notify=async(channel:string,previous:Snapshot|undefined,next:Snapshot)=>{
  const now=Date.now(),stored=await api.storage.local.get('resolutionAlerts');
  const alerts=(stored.resolutionAlerts??{}) as Record<string,ResolutionAlert>,before=JSON.stringify(stored.resolutionAlerts??{});
  for(const [key,value]of Object.entries(alerts))if(!value||now-value.at>TTL)delete alerts[key];
  const events=resolutionTransitions(channel,previous,next,now),event=events.at(-1);
  if(event&&alerts[channel]?.id!==event.id)alerts[channel]=event;
  if(JSON.stringify(alerts)!==before)await api.storage.local.set({resolutionAlerts:alerts});
  const pending=alerts[channel];if(!pending||!['pending','blocked'].includes(pending.delivery))return;
  // Never switch tabs or focus a different application to announce a result.
  const window=await api.windows.getLastFocused();if(!window.focused||window.id===undefined)return;
  const [tab]=await api.tabs.query({active:true,windowId:window.id});if(tab?.id===undefined||!tab.url)return;
  const url=new URL(tab.url);if(url.hostname!=='www.twitch.tv'||url.pathname.replace(/^\/+|\/+$/g,'').toLowerCase()!==channel)return;
  if(pending.delivery==='blocked'){await api.action.setBadgeBackgroundColor({tabId:tab.id,color:'#79e2b4'});await api.action.setBadgeText({tabId:tab.id,text:'!'});return;}
  const contexts=await api.runtime.getContexts({contextTypes:['POPUP']});
  // Persist before opening: a suspended/restarted worker must not open the same result twice.
  alerts[channel]={...pending,delivery:'opening'};await api.storage.local.set({resolutionAlerts:alerts});
  try{
   if(!contexts.some(c=>c.windowId===window.id))await api.action.openPopup({windowId:window.id});
   // Popup may already have acknowledged while openPopup awaited its document load.
   const current=(await api.storage.local.get('resolutionAlerts')).resolutionAlerts as Record<string,ResolutionAlert>|undefined;
   if(current?.[channel]?.id===pending.id&&current[channel].delivery!=='seen')await api.storage.local.set({resolutionAlerts:{...current,[channel]:{...pending,delivery:'opened'}}});
  }catch{
   const current=(await api.storage.local.get('resolutionAlerts')).resolutionAlerts as Record<string,ResolutionAlert>|undefined;
   if(current?.[channel]?.id===pending.id&&current[channel].delivery!=='seen')await api.storage.local.set({resolutionAlerts:{...current,[channel]:{...pending,delivery:'blocked'}}});
   await api.action.setBadgeBackgroundColor({tabId:tab.id,color:'#79e2b4'});await api.action.setBadgeText({tabId:tab.id,text:'!'});
  }
 };
 return (channel:string,previous:Snapshot|undefined,next:Snapshot)=>{
  const task=queue.then(()=>notify(channel,previous,next));queue=task.catch(()=>{});return task;
 };
}
