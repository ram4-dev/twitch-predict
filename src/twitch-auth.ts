import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import type {Points,TwitchIdentity} from './points.js';
const nonce=()=>randomBytes(32).toString('hex');
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const equal=(a:string,b:string)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
type Config={clientId:string;clientSecret:string;origin:string};
type Flow={accountId:string;wallet:string;cookieHash:string;expires:number};
type Pending=Flow&{identity:TwitchIdentity};
export class TwitchAuth {
  private flows=new Map<string,Flow>();private pending=new Map<string,Pending>();
  constructor(readonly points:Points,private readonly config:Config,private readonly request:typeof fetch=fetch,private readonly clock=()=>Date.now()){}
  exportState(){return {flows:Object.fromEntries(this.flows),pending:Object.fromEntries(this.pending)};}
  importState(state:ReturnType<TwitchAuth['exportState']>){this.flows=new Map(Object.entries(state.flows));this.pending=new Map(Object.entries(state.pending));}
  get configured(){return !!this.config.clientId&&!!this.config.clientSecret;}
  get callbackUrl(){return `${this.config.origin}/auth/twitch/callback`;}
  private prune(){for(const map of [this.flows,this.pending])for(const [key,f] of map)if(f.expires<=this.clock())map.delete(key);}
  start(token:string){
    if(!this.configured)throw new Error('Falta configurar la app de Twitch en el servidor');
    const a=this.points.me(token);if(!a.wallet)throw new Error('Conectá Phantom antes de vincular Twitch');
    this.prune();if(this.flows.size+this.pending.size>=1000)throw new Error('Demasiadas conexiones pendientes');
    const state=nonce(),cookie=nonce();this.flows.set(state,{accountId:a.id,wallet:a.wallet,cookieHash:hash(cookie),expires:this.clock()+10*60_000});
    const url=new URL('https://id.twitch.tv/oauth2/authorize');url.search=new URLSearchParams({client_id:this.config.clientId,redirect_uri:this.callbackUrl,response_type:'code',scope:'',state,force_verify:'true'}).toString();
    return {url:url.href,cookie};
  }
  consume(state:string,cookie:string,code:string|undefined,denied=false){
    this.prune();const flow=this.flows.get(state);
    if(!flow||!cookie||!equal(flow.cookieHash,hash(cookie)))throw new Error('La conexión venció o se abrió en otro navegador. Volvé a conectar Twitch.');
    this.flows.delete(state);
    if(denied)throw new Error('Cancelaste la conexión con Twitch. Podés volver a intentar.');
    if(!code||code.length>2048)throw new Error('Twitch no devolvió un código de autorización válido');
    return flow;
  }
  async callback(state:string,cookie:string,code:string|undefined,denied=false){return this.exchange(this.consume(state,cookie,code,denied),code!);}
  async exchange(flow:Flow,code:string){
    const response=await this.request('https://id.twitch.tv/oauth2/token',{method:'POST',body:new URLSearchParams({client_id:this.config.clientId,client_secret:this.config.clientSecret,code,grant_type:'authorization_code',redirect_uri:this.callbackUrl}),signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw new Error('Twitch no pudo confirmar el acceso. Volvé a conectar.');
    const tokens=z.object({access_token:z.string().min(1),token_type:z.string()}).parse(await response.json());
    try{
      const validation=await this.request('https://id.twitch.tv/oauth2/validate',{headers:{Authorization:`OAuth ${tokens.access_token}`},signal:AbortSignal.timeout(10000)});
      if(!validation.ok)throw new Error('Twitch no pudo validar la autorización');
      const validated=z.object({client_id:z.string(),user_id:z.string().regex(/^\d+$/),login:z.string(),expires_in:z.number().positive()}).parse(await validation.json());
      if(validated.client_id!==this.config.clientId)throw new Error('La autorización de Twitch pertenece a otra aplicación');
      const profile=await this.request('https://api.twitch.tv/helix/users',{headers:{Authorization:`Bearer ${tokens.access_token}`,'Client-Id':this.config.clientId},signal:AbortSignal.timeout(10000)});
      if(!profile.ok)throw new Error('No se pudo consultar tu canal de Twitch');
      const parsed=z.object({data:z.array(z.object({id:z.string().regex(/^\d+$/),login:z.string().regex(/^[a-z0-9_]{1,40}$/),display_name:z.string().min(1).max(100)})).length(1)}).parse(await profile.json());
      const user=parsed.data[0];if(user.id!==validated.user_id||user.login!==validated.login)throw new Error('Twitch devolvió una identidad distinta a la autorizada');
      const ticket=nonce();this.pending.set(ticket,{...flow,expires:this.clock()+5*60_000,identity:{id:user.id,login:user.login,displayName:user.display_name,linkedAt:new Date(this.clock()).toISOString()}});return ticket;
    }finally{
      // Identity proof only: no user access/refresh tokens are persisted or sent to the browser.
      try{await this.request('https://id.twitch.tv/oauth2/revoke',{method:'POST',body:new URLSearchParams({client_id:this.config.clientId,token:tokens.access_token}),signal:AbortSignal.timeout(5000)});}catch{/* The short-lived token is discarded even when Twitch revocation is unavailable. */}
    }
  }
  async complete(token:string,ticket:string,cookie:string){
    this.prune();const p=this.pending.get(ticket),a=this.points.me(token);
    if(!p||!cookie||!equal(p.cookieHash,hash(cookie))||a.id!==p.accountId||a.wallet!==p.wallet)throw new Error('La cuenta cambió durante la conexión. Volvé a conectar Twitch con la wallet original.');
    this.pending.delete(ticket);return this.points.linkTwitch(token,p.identity);
  }
}
