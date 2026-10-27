import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {closesAt,type Prediction} from './prediction.js';
import {ByteService} from './byte.js';
import type {CreateByteMarket} from './byte-model.js';
import type {Documents} from './cloud/documents.js';
import type {TwitchSource} from './twitch-source.js';
type Mirror={outcomeIds:string[];prediction:Prediction;input?:CreateByteMarket;marketId?:string;phase:'pending'|'created'|'skipped'|'failed'|'resolved';error?:string;retryAt?:number};
type State={version:1;channels:string[];mirrors:Record<string,Mirror>};
export class ByteTwitchMirror {
 private state:State={version:1,channels:[],mirrors:{}};
 private savedState='';
 private activeIds=new Map<string,Set<string>>();
 private syncing?:Promise<void>;
 private queue:Promise<unknown>=Promise.resolve();
 lastError:string|null=null;
 constructor(readonly directory:string,private byte:ByteService,private source:Pick<TwitchSource,'active'|'prediction'>,private clock=Date.now,private documents?:Documents,private onChange:()=>void=()=>{}){}
 async load(){if(this.documents){this.state=await this.documents.read('byte-twitch',():State=>({version:1,channels:[],mirrors:{}}));this.savedState=JSON.stringify(this.state);return;}await mkdir(this.directory,{recursive:true});try{const data=JSON.parse(await readFile(join(this.directory,'byte-twitch.json'),'utf8'));if(data.version!==1||!Array.isArray(data.channels)||!data.mirrors)throw new Error('Estado de réplica incompatible');this.state=data;}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}this.savedState=JSON.stringify(this.state);}
 private async save(){
  if(this.documents){const {state}=await this.documents.update('byte-twitch',():State=>({version:1,channels:[],mirrors:{}}),state=>{state.channels=[...new Set([...state.channels,...this.state.channels])];state.mirrors=this.state.mirrors;});this.state=state;}
  else{const file=join(this.directory,'byte-twitch.json');await writeFile(file+'.tmp',JSON.stringify(this.state),{mode:0o600});await rename(file+'.tmp',file);}
  const saved=JSON.stringify(this.state);if(saved!==this.savedState){this.savedState=saved;this.onChange();}
 }
 private serial<T>(fn:()=>Promise<T>):Promise<T>{const result=this.queue.then(fn);this.queue=result.catch(()=>{});return result;}
 channels(){return [...this.state.channels];}
 snapshot(channel:string){return Object.values(this.state.mirrors).filter(m=>m.prediction.channel===channel&&(m.marketId||m.retryAt||this.activeIds.get(channel)?.has(m.prediction.id)||(m.prediction.status==='ACTIVE'&&!m.prediction.lockedAt&&closesAt(m.prediction)>this.clock()))).slice(-20).map(m=>({prediction:m.prediction,market:{state:m.phase,byteMarketId:m.marketId,error:m.error??null,rateLimited:!m.marketId&&!!m.retryAt}}));}
 watch(channel:string){return this.serial(async()=>{if(!this.state.channels.includes(channel)){this.state.channels.push(channel);await this.save();}await this.refresh(channel);return {channel,predictions:this.snapshot(channel)};});}
 sync(){if(this.syncing)return this.syncing;this.syncing=this.serial(async()=>{if(this.documents)await this.load();const errors:string[]=[];for(const channel of this.state.channels)try{await this.refresh(channel);}catch(e){errors.push(`${channel}: ${(e as Error).message}`);}this.lastError=errors.length?errors.join('; '):null;}).finally(()=>{this.syncing=undefined;});return this.syncing;}
 private async refresh(channel:string){
  const seen=new Set<string>(),errors:string[]=[];
  try{
   const active=await this.source.active(channel);this.activeIds.set(channel,new Set(active.map(p=>p.id)));
   for(const p of active){seen.add(p.id);try{await this.observe(p);}catch(e){errors.push(`${p.id}: ${(e as Error).message}`);}}
  }catch(e){errors.push((e as Error).message);}
  // A failed channel feed or one missing historical ID must not block other rounds.
  for(const mirror of Object.values(this.state.mirrors))if(mirror.prediction.channel===channel&&(mirror.marketId||mirror.retryAt)&&mirror.phase!=='resolved'&&!seen.has(mirror.prediction.id)){
   try{await this.observe(await this.source.prediction(mirror.prediction.id,channel));}catch(e){errors.push(`${mirror.prediction.id}: ${(e as Error).message}`);}
  }
  if(errors.length)throw new Error(errors.join('; '));
 }
 private async observe(p:Prediction){
  const key=`${p.channel}:${p.id}`;let mirror=this.state.mirrors[key];
  if(!mirror){mirror={prediction:p,outcomeIds:p.outcomes.map(o=>o.id),phase:'pending'};this.state.mirrors[key]=mirror;}else mirror.prediction=p;
  if(mirror.phase==='resolved'){await this.save();return;}
  // A rejected-429 preview still has a source lifecycle even without a chain market.
  // Persist lock/result updates and never create or settle a market after its window.
  if(!mirror.marketId&&mirror.retryAt&&(p.status!=='ACTIVE'||p.lockedAt||closesAt(p)<=this.clock())){
   const operation=mirror.input?await this.byte.creationStatus(mirror.input.requestId):undefined;
   // Complete or uncertain submissions must still follow the normal reconciliation path.
   if(!operation||(operation.state==='rejected'&&operation.status===429)){
    mirror.phase=p.status==='CANCELED'||(p.status==='RESOLVED'&&p.outcomes.some(o=>o.id===p.winningOutcomeId))?'resolved':'failed';
    if(mirror.phase==='resolved')mirror.error=undefined;
    await this.save();return;
   }
  }
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
    if(!created&&mirror.phase==='failed'){
     const operation=await this.byte.creationStatus(mirror.input.requestId);
     // A rejected 429 was not submitted successfully; ambiguous pending requests must never be retried.
     if(operation?.state==='rejected'&&operation.status===429){
      if(mirror.error!=='Se alcanzó el límite de mercados de este partner.'){mirror.error='Se alcanzó el límite de mercados de este partner.';await this.save();}
      if(mirror.retryAt&&this.clock()<mirror.retryAt)return;
      const windowSecs=Math.floor((closesAt(p)-this.clock())/1000)-20;
      if(p.status!=='ACTIVE'||p.lockedAt||windowSecs<60)return;
      mirror.input={...mirror.input,windowSecs,requestId:randomUUID()};mirror.retryAt=undefined;await this.save();
     }else if(operation?.state==='rejected'){return;}
    }
    if(!created){if(p.status!=='ACTIVE'||p.lockedAt||closesAt(p)-this.clock()<mirror.input.windowSecs*1000+1000)throw new Error('La ventana de Twitch ya no permite crear esta réplica de forma segura.');created=await this.byte.create(mirror.input);}mirror.marketId=created.id;mirror.phase='created';await this.save();
    await this.byte.updateTwitch(created.id,p);
    if(created.closeMs>closesAt(p)){await this.byte.settle(created.id,null,'La creación terminó después de la ventana segura de Twitch.','twitch');mirror.phase='resolved';mirror.error='Mercado anulado porque la creación excedió la ventana de Twitch.';await this.save();return;}
   }
   await this.byte.updateTwitch(mirror.marketId,p);
   const market=await this.byte.get(mirror.marketId);
   if(market.status!=='open'){mirror.phase='resolved';mirror.error=undefined;await this.save();return;}
   const earlyClose=(p.status!=='ACTIVE'||!!p.lockedAt)&&(p.lockedAt?Date.parse(p.lockedAt):this.clock())<market.closeMs;
   if(p.status==='CANCELED'||earlyClose){await this.byte.settle(mirror.marketId,null,`Twitch ${p.id}: ${earlyClose?'cerró antes de la ventana en cadena':'canceló la predicción'}.`,'twitch');mirror.phase='resolved';}
   else if(p.status==='RESOLVED'){
    const winner=mirror.outcomeIds.indexOf(p.winningOutcomeId??'');
    if(winner<0)throw new Error('Twitch no confirmó una opción ganadora válida');
    await this.byte.settle(mirror.marketId,winner,`Resultado verificado de Twitch: https://www.twitch.tv/${p.channel}, predicción ${p.id}, ganador ${p.winningOutcomeId}.`,'twitch');mirror.phase='resolved';
   }
   mirror.error=undefined;if(mirror.phase!=='resolved')mirror.phase='created';
  }catch(e){mirror.error=(e as Error).message;mirror.phase='failed';if((e as {status?:number}).status===429)mirror.retryAt=this.clock()+30000;}
  await this.save();
 }
}
