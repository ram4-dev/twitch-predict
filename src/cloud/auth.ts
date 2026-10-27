import {Auth} from '../auth.js';
import type {Points} from '../points.js';
import type {Documents} from './documents.js';
/** Auth state and walletLogin commit on one SQL connection, so replay reservation is atomic with account/session creation. */
export class CloudAuth {
 constructor(private points:Points,private documents:Documents){}
 private async run<K extends keyof Pick<Auth,'start'|'authorize'|'context'|'challenge'|'authenticate'|'complete'>>(method:K,args:Parameters<Auth[K]>):Promise<Awaited<ReturnType<Auth[K]>>>{
  const {result}=await this.documents.update('auth',()=>({flows:{},challenges:{}}) as ReturnType<Auth['exportState']>,async state=>{
   const auth=new Auth(this.points);auth.importState(state);
   const fn=auth[method] as (...args:Parameters<Auth[K]>)=>ReturnType<Auth[K]>;
   const result=await fn.apply(auth,args);Object.assign(state,auth.exportState());return result;
  });return result as Awaited<ReturnType<Auth[K]>>;
 }
 start(...a:Parameters<Auth['start']>){return this.run('start',a);}
 authorize(...a:Parameters<Auth['authorize']>){return this.run('authorize',a);}
 context(...a:Parameters<Auth['context']>){return this.run('context',a);}
 challenge(...a:Parameters<Auth['challenge']>){return this.run('challenge',a);}
 authenticate(...a:Parameters<Auth['authenticate']>){return this.run('authenticate',a);}
 complete(...a:Parameters<Auth['complete']>){return this.run('complete',a);}
}
