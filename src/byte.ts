import type {Documents} from './cloud/documents.js';
import {mkdir,readFile,rename,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {z} from 'zod';
import {closesAt,type Prediction} from './prediction.js';
import {byteMarketSchema,byteConfigSchema,createByteMarketSchema,type CreateByteMarket,type DisplayByteMarket,type MarketNotes} from './byte-model.js';

export class ByteError extends Error {constructor(readonly status:number,message:string){super(message);}}
type Operation={input:CreateByteMarket;state:'pending'|'complete'|'rejected';marketId?:string;status?:number};
type State={version:1;notes:Record<string,MarketNotes>;operations:Record<string,Operation>};
const fingerprint=(input:CreateByteMarket,ignoreRequest=false)=>JSON.stringify({...createByteMarketSchema.parse(input),...(ignoreRequest?{requestId:''}:{})});
const errors:Record<number,string>={400:'byte rechazó los datos de la operación.',401:'La API key de byte no es válida.',403:'byte todavía no habilitó esta key como partner, o deshabilitó las predicciones.',404:'El mercado no existe o no pertenece a este partner.',409:'El mercado cambió de estado o todavía permite apuestas.',429:'Se alcanzó el límite de mercados de este partner.',502:'byte no pudo abrir el mercado en cadena. No quedó abierto.',503:'byte no tiene fondos de devnet suficientes o el servicio no está disponible.'};
export class ByteService {
  private state:State={version:1,notes:{},operations:{}};
  private queue:Promise<unknown>=Promise.resolve();
  private readonly base:string;
  constructor(readonly directory:string,private readonly key:string,base='https://app.bytearena.fun',private readonly transport:typeof fetch=fetch,private readonly documents?:Documents){
    const url=new URL(base);
    if((url.protocol!=='https:'&&!(url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname)))||url.username||url.password||url.search||url.hash)throw new Error('BYTE_BASE_URL debe ser HTTPS (HTTP solo para fixtures locales).');
    this.base=url.href.replace(/\/$/,'');
  }
  get configured(){return !!this.key.trim();}
  async load(){
    if(this.documents){this.state=await this.documents.read('byte',()=>({version:1,notes:{},operations:{}}) as State);return;}
    await mkdir(this.directory,{recursive:true,mode:0o700});
    try{const data=JSON.parse(await readFile(join(this.directory,'byte.json'),'utf8'));if(data.version!==1||!data.notes||!data.operations)throw new Error('Estado de byte incompatible');this.state=data;}
    catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  }
  private async save(){const file=join(this.directory,'byte.json');await writeFile(file+'.tmp',JSON.stringify(this.state),{mode:0o600});await rename(file+'.tmp',file);}
  private async mutate<T>(work:(state:State)=>T):Promise<T>{
    if(this.documents){const committed=await this.documents.update('byte',()=>({version:1,notes:{},operations:{}}) as State,work);this.state=committed.state;return committed.result;}
    const before=structuredClone(this.state);try{const result=work(this.state);await this.save();return result;}catch(e){this.state=before;throw e;}
  }
  private async refresh(){if(this.documents)await this.load();}
  private serial<T>(fn:()=>Promise<T>):Promise<T>{const result=this.queue.then(fn);this.queue=result.catch(()=>{});return result;}
  private async request(path:string,body?:unknown,authenticated=true):Promise<unknown>{
    if(authenticated&&!this.configured)throw new ByteError(503,'Falta configurar BYTE_API_KEY en el .env del servidor.');
    let response:Response;
    try{response=await this.transport(this.base+path,{method:body===undefined?'GET':'POST',headers:{accept:'application/json',...(body===undefined?{}:{'content-type':'application/json'}),...(authenticated?{authorization:`Bearer ${this.key}`}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000),redirect:'error'});}
    catch{throw new ByteError(504,'No se pudo confirmar la respuesta de byte. Revisá el estado antes de repetir la operación.');}
    // Never relay upstream bodies: they may contain credentials, HTML or internal details.
    if(!response.ok)throw new ByteError(response.status,errors[response.status]??'byte respondió con un error. Revisá el estado antes de repetir.');
    try{return await response.json();}catch{throw new ByteError(504,'byte devolvió una respuesta no verificable. Revisá el mercado antes de repetir.');}
  }
  async config(){
    try{return byteConfigSchema.parse(await this.request('/api/bets/open',undefined,false));}
    catch(e){if(e instanceof z.ZodError)throw new ByteError(502,'La configuración de byte no corresponde al programa de devnet esperado.');throw e;}
  }
  private parseMarket(data:unknown):DisplayByteMarket {
    const parsed=z.object({market:byteMarketSchema}).safeParse(data);
    if(!parsed.success)throw new ByteError(504,'byte devolvió un mercado no verificable. Revisá el estado antes de repetir.');
    const market=parsed.data.market;
    if(market.pools.length!==market.options.length||(market.winner!==null&&market.winner>=market.options.length))throw new ByteError(504,'Las opciones de byte no coinciden con los pozos.');
    const notes=this.state.notes[market.id],source=notes?.twitch;
    return {...market,bettable:market.bettable&&(!this.documents||!!notes)&&(!source||(source.status==='ACTIVE'&&Date.now()<source.closesAt&&Date.now()-source.checkedAt<30000)),notes};
  }
  async list():Promise<DisplayByteMarket[]> {
    const pages=await Promise.all(['open','closed'].map(status=>this.request(`/api/partner/markets?status=${status}`)));
    await this.refresh();
    const markets=new Map<string,DisplayByteMarket>();
    for(const page of pages){const result=z.object({markets:z.array(z.unknown())}).safeParse(page);if(!result.success)throw new ByteError(502,'byte devolvió una lista inválida.');for(const value of result.data.markets){const market=this.parseMarket({market:value});markets.set(market.id,market);}}
    // The upstream list is capped at 200; retain direct access to older locally-created markets.
    for(const id of Object.keys(this.state.notes))if(!markets.has(id)){try{markets.set(id,await this.get(id));}catch(e){if(!(e instanceof ByteError&&e.status===404))throw e;}}
    return [...markets.values()].sort((a,b)=>b.openMs-a.openMs);
  }
  async get(id:string){const data=await this.request(`/api/partner/markets/${encodeURIComponent(id)}`);await this.refresh();return this.parseMarket(data);}
  async create(raw:unknown){
    const input=createByteMarketSchema.parse(raw);
    return this.serial(async()=>{
      if(!this.configured)throw new ByteError(503,'Falta configurar BYTE_API_KEY en el servidor.');
      const config=await this.config();if(!config.enabled)throw new ByteError(403,'Las predicciones de byte están deshabilitadas.');
      const existing=await this.mutate(state=>{
       const old=state.operations[input.requestId];
       if(old){
        if(fingerprint(old.input)!==fingerprint(input))throw new ByteError(409,'Ese identificador ya se usó con otros datos.');
        if(old.state==='complete')return old.marketId;
        if(old.state==='rejected')throw new ByteError(old.status??400,errors[old.status??400]??'La creación anterior fue rechazada.');
        throw new ByteError(409,'Esta creación tiene resultado incierto. Actualizá la lista y conciliá el mercado antes de crear otro.');
       }
       const sameInput=(a:CreateByteMarket,b:CreateByteMarket)=>fingerprint(a,true)===fingerprint(b,true);
       if(Object.values(state.operations).some(op=>op.state==='pending'&&sameInput(op.input,input)))throw new ByteError(409,'Ya existe una creación incierta con estos datos. Conciliá esa solicitud antes de repetirla.');
       state.operations[input.requestId]={input,state:'pending'};return undefined;
      });
      if(existing)return this.get(existing);
      let market:DisplayByteMarket;
      try{market=this.parseMarket(await this.request('/api/partner/markets',{title:input.title,options:input.options,windowSecs:input.windowSecs,currency:input.currency,...(input.wallet?{wallet:input.wallet}:{})}));}
      catch(e){
        if(e instanceof ByteError&&(e.status<500||e.status===502)){await this.mutate(state=>{state.operations[input.requestId]={input,state:'rejected',status:e.status};});}
        throw e;
      }
      await this.mutate(state=>{
       state.notes[market.id]={channel:input.channel,rules:input.rules,createdAt:new Date().toISOString()};
       state.operations[input.requestId]={input,state:'complete',marketId:market.id};
      });
      const notes=this.state.notes[market.id],source=notes?.twitch;
    return {...market,bettable:market.bettable&&(!this.documents||!!notes)&&(!source||(source.status==='ACTIVE'&&Date.now()<source.closesAt&&Date.now()-source.checkedAt<30000)),notes};
    });
  }
  async marketForRequest(requestId:string){await this.refresh();const op=this.state.operations[requestId];return op?.state==='complete'?this.get(op.marketId!):undefined;}
  operations(){return Object.values(this.state.operations).filter(op=>op.state==='pending').map(op=>({...op.input}));}
  async reconcile(requestId:string,id:string){return this.serial(async()=>{
    const market=await this.get(id);
    return this.mutate(state=>{
     const op=state.operations[requestId];if(!op||op.state!=='pending')throw new ByteError(409,'La operación no está pendiente de conciliación.');
     if(market.title!==op.input.title||market.currency!==op.input.currency||JSON.stringify(market.options)!==JSON.stringify(op.input.options)||state.notes[id])throw new ByteError(409,'El mercado no coincide con la solicitud pendiente o ya está asociado.');
     state.notes[id]={channel:op.input.channel,rules:op.input.rules,createdAt:new Date().toISOString()};op.state='complete';op.marketId=id;return {...market,notes:state.notes[id]};
    });
  });}
  async updateTwitch(id:string,p:Prediction){return this.serial(()=>this.mutate(state=>{
    const notes=state.notes[id];if(!notes)throw new ByteError(409,'El mercado no tiene reglas locales');
    notes.twitch={predictionId:p.id,closesAt:closesAt(p),checkedAt:Date.now(),status:p.status};
  }));}
  async settle(id:string,winner:number|null,evidence:string,oracle:'operator'|'twitch'='operator'){return this.serial(async()=>{
    const market=await this.get(id);
    const notes=this.state.notes[id];if(!notes)throw new ByteError(409,'Este mercado no tiene reglas registradas en esta aplicación.');
    if(notes.twitch&&oracle!=='twitch')throw new ByteError(403,'Este mercado se resuelve con el resultado verificado de Twitch.');
    if(market.status!=='open'){
      if((winner===null&&market.status==='invalid')||(market.status==='resolved'&&market.winner===winner))return market;
      throw new ByteError(409,'El mercado ya tiene otro resultado.');
    }
    if(winner!==null&&(Date.now()<market.closeMs||winner>=market.options.length))throw new ByteError(409,'Esperá al cierre y elegí una opción válida.');
    // Persist the oracle decision before asking byte; retries first read its authoritative state.
    await this.mutate(state=>{const current=state.notes[id];if(current.resolution&&(current.resolution.winner!==winner||current.resolution.evidence!==evidence))throw new ByteError(409,'Hay una resolución previa pendiente. Reintentá la misma decisión.');current.resolution={winner,evidence,at:new Date().toISOString()};});
    await this.request(`/api/partner/markets/${encodeURIComponent(id)}/${winner===null?'invalidate':'resolve'}`,winner===null?{reason:evidence}:{winner});
    return this.get(id);
  });}
  async sync(id:string,wallet:string){await this.get(id);return this.parseMarket(await this.request(`/api/predictions/${encodeURIComponent(id)}/chain-sync?wallet=${encodeURIComponent(wallet)}`,{},false));}
}
