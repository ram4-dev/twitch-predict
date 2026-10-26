import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {closesAt,type Prediction} from './prediction.js';
import {ByteService} from './byte.js';
import type {CreateByteMarket} from './byte-model.js';
import type {Documents} from './cloud/documents.js';
import type {TwitchSource} from './twitch-source.js';
type Mirror={outcomeIds:string[];prediction:Prediction;input?:CreateByteMarket;marketId?:string;phase:'pending'|'created'|'skipped'|'failed'|'resolved';error?:string};
type State={version:1;channels:string[];mirrors:Record<string,Mirror>};
export class ByteTwitchMirror {
 private state:State={version:1,channels:[],mirrors:{}};
 private activeIds=new Map<string,Set<string>>();
 private syncing?:Promise<void>;
 private queue:Promise<unknown>=Promise.resolve();
 lastError:string|null=null;
 constructor(readonly directory:string,private byte:ByteService,private source:Pick<TwitchSource,'active'|'prediction'>,private clock=Date.now,private documents?:Documents){}
 async load(){if(this.documents){this.state=await this.documents.read('byte-twitch',():State=>({version:1,channels:[],mirrors:{}}));return;}await mkdir(this.directory,{recursive:true});try{const data=JSON.parse(await readFile(join(this.directory,'byte-twitch.json'),'utf8'));if(data.version!==1||!Array.isArray(data.channels)||!data.mirrors)throw new Error('Estado de réplica incompatible');this.state=data;}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}}
 private async save(){if(this.documents){const {state}=await this.documents.update('byte-twitch',():State=>({version:1,channels:[],mirrors:{}}),state=>{state.channels=[...new Set([...state.channels,...this.state.channels])];state.mirrors=this.state.mirrors;});this.state=state;return;}const file=join(this.directory,'byte-twitch.json');await writeFile(file+'.tmp',JSON.stringify(this.state),{mode:0o600});await rename(file+'.tmp',file);}
 private serial<T>(fn:()=>Promise<T>):Promise<T>{const result=this.queue.then(fn);this.queue=result.catch(()=>{});return result;}
 channels(){return [...this.state.channels];}
 snapshot(channel:string){return Object.values(this.state.mirrors).filter(m=>m.prediction.channel===channel&&(m.marketId||this.activeIds.get(channel)?.has(m.prediction.id))).slice(-20).map(m=>({prediction:m.prediction,market:{state:m.phase,byteMarketId:m.marketId,error:m.error??null}}));}
 watch(channel:string){return this.serial(async()=>{if(!this.state.channels.includes(channel)){this.state.channels.push(channel);await this.save();}await this.refresh(channel);return {channel,predictions:this.snapshot(channel)};});}
 sync(){if(this.syncing)return this.syncing;this.syncing=this.serial(async()=>{if(this.documents)await this.load();const errors:string[]=[];for(const channel of this.state.channels)try{await this.refresh(channel);}catch(e){errors.push(`${channel}: ${(e as Error).message}`);}this.lastError=errors.length?errors.join('; '):null;}).finally(()=>{this.syncing=undefined;});return this.syncing;}
 private async refresh(channel:string){
  const active=await this.source.active(channel),seen=new Set<string>();this.activeIds.set(channel,new Set(active.map(p=>p.id)));
  for(const p of active){seen.add(p.id);await this.observe(p);}
  // Continue tracking IDs after Twitch removes them from its active event list.
  for(const mirror of Object.values(this.state.mirrors))if(mirror.prediction.channel===channel&&mirror.marketId&&mirror.phase!=='resolved'&&!seen.has(mirror.prediction.id))await this.observe(await this.source.prediction(mirror.prediction.id,channel));
 }
 private async observe(p:Prediction){
  const key=`${p.channel}:${p.id}`;let mirror=this.state.mirrors[key];
  if(!mirror){mirror={prediction:p,outcomeIds:p.outcomes.map(o=>o.id),phase:'pending'};this.state.mirrors[key]=mirror;}else mirror.prediction=p;
  if(mirror.phase==='resolved'){await this.save();return;}
  if(!mirror.input){
   // Byte needs >=60s. Reserve its 20s request timeout so bets never knowingly outlive Twitch.
   const windowSecs=Math.floor((closesAt(p)-this.clock())/1000)-20;
   const reason=p.status!=='ACTIVE'||p.lockedAt?'La predicción de Twitch ya cerró.':windowSecs<60?'La ventana restante es demasiado corta: Byte requiere 60 segundos más margen de creación.':Date.parse(p.createdAt)>this.clock()+5000?'El inicio de la predicción no es válido.':p.outcomes.length>6||p.title.length>140||p.outcomes.some(o=>o.title.length>40)?'La pregunta u opciones superan los límites de Byte.':undefined;
   if(reason){mirror.phase='skipped';mirror.error=reason;await this.save();return;}
   mirror.input={title:p.title,options:p.outcomes.map(o=>o.title),channel:p.channel,currency:'sol',windowSecs,rules:`Réplica de la predicción ${p.id} de @${p.channel}. El ganador se obtiene del resultado verificado de Twitch. Las apuestas cierran hasta 20 segundos antes. Se anula si Twitch cancela o cierra antes de que cierre el mercado en cadena.`,requestId:randomUUID()};await this.save();
  }
  try{
   if(!mirror.marketId){
    let created=await this.byte.marketForRequest(mirror.input.requestId);
    if(!created){if(p.status!=='ACTIVE'||p.lockedAt||closesAt(p)-this.clock()<mirror.input.windowSecs*1000+1000)throw new Error('La ventana de Twitch ya no permite crear esta réplica de forma segura.');created=await this.byte.create(mirror.input);}mirror.marketId=created.id;mirror.phase='created';await this.save();
    await this.byte.updateTwitch(created.id,p);
    if(created.closeMs>closesAt(p)){await this.byte.settle(created.id,null,'La creación terminó después de la ventana segura de Twitch.','twitch');mirror.phase='resolved';mirror.error='Mercado anulado porque la creación excedió la ventana de Twitch.';await this.save();return;}
   }
   await this.byte.updateTwitch(mirror.marketId,p);
   const market=await this.byte.get(mirror.marketId);
   if(market.status!=='open'){mirror.phase='resolved';mirror.error=undefined;await this.save();return;}
   const earlyClose=(p.status!=='ACTIVE'||!!p.lockedAt)&&this.clock()<market.closeMs;
   if(p.status==='CANCELED'||earlyClose){await this.byte.settle(mirror.marketId,null,`Twitch ${p.id}: ${earlyClose?'cerró antes de la ventana en cadena':'canceló la predicción'}.`,'twitch');mirror.phase='resolved';}
   else if(p.status==='RESOLVED'){
    const winner=mirror.outcomeIds.indexOf(p.winningOutcomeId??'');
    if(winner<0)throw new Error('Twitch no confirmó una opción ganadora válida');
    await this.byte.settle(mirror.marketId,winner,`Resultado verificado de Twitch: https://www.twitch.tv/${p.channel}, predicción ${p.id}, ganador ${p.winningOutcomeId}.`,'twitch');mirror.phase='resolved';
   }
   mirror.error=undefined;if(mirror.phase!=='resolved')mirror.phase='created';
  }catch(e){mirror.error=(e as Error).message;mirror.phase='failed';}
  await this.save();
 }
}
