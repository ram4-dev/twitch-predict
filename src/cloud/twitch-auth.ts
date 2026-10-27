import {TwitchAuth} from '../twitch-auth.js';
import type {Points} from '../points.js';
import type {Documents} from './documents.js';
type State=ReturnType<TwitchAuth['exportState']>;
/** Consume the callback before the provider exchange; never hold SQL locks while calling Twitch. */
export class CloudTwitchAuth {
 constructor(private points:Points,private documents:Documents,private config:ConstructorParameters<typeof TwitchAuth>[1],private request:typeof fetch=fetch){}
 get configured(){return !!this.config.clientId&&!!this.config.clientSecret;}
 private instance(state:State){const auth=new TwitchAuth(this.points,this.config,this.request);auth.importState(state);return auth;}
 private async update<T>(fn:(auth:TwitchAuth)=>T|Promise<T>){
  const {result}=await this.documents.update('twitch-auth',():State=>({flows:{},pending:{}}),async state=>{const auth=this.instance(state);const result=await fn(auth);Object.assign(state,auth.exportState());return result;});return result;
 }
 start(token:string){return this.update(auth=>auth.start(token));}
 async callback(...args:Parameters<TwitchAuth['callback']>){
  // Errors after consumption must not roll back consumption (denial/code validation is done after commit).
  const [state,cookie,code,denied]=args;
  const flow=await this.update(auth=>auth.consume(state,cookie,'consumed'));
  if(denied||!code||code.length>2048)throw new Error('Conexión con Twitch cancelada o inválida');
  const auth=this.instance({flows:{},pending:{}}),ticket=await auth.exchange(flow,code);
  const pending=auth.exportState().pending[ticket];
  await this.documents.update('twitch-auth',():State=>({flows:{},pending:{}}),state=>{state.pending[ticket]=pending;});return ticket;
 }
 complete(...args:Parameters<TwitchAuth['complete']>){return this.update(auth=>auth.complete(...args));}
}
