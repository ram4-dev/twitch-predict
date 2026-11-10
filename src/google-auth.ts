import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import type {Points} from './points.js';

/** Google OIDC identity adapter (P1-09). Validate signature, issuer, audience, expiry and nonce
 * server-side; use `sub` as the stable subject. Email is never an identity. Runs without any
 * user access token: the ID token proves identity only and is never persisted. */
const nonce=()=>randomBytes(32).toString('hex');
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const equal=(a:string,b:string)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
export type GoogleIdentity={id:string;email?:string;displayName:string;linkedAt:string};
type Config={clientId:string;clientSecret?:string;origin:string|(()=>string)};
type Flow={accountId?:string;cookieHash:string;nonceHash:string;expires:number};
type Pending=Flow&{identity:GoogleIdentity};
type IdTokenClaims={iss:string;aud:string;sub:string;email?:string;name?:string;nonce?:string;exp:number};
const JWKS_URL='https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS=['https://accounts.google.com','accounts.google.com'];

async function verifyIdToken(idToken:string,config:Config,expectedNonceHash:string,request:typeof fetch,clock:()=>number):Promise<IdTokenClaims> {
  const parts=idToken.split('.');
  if(parts.length!==3)throw new Error('Token de Google inválido');
  const [headerPart,payloadPart,signaturePart]=parts;
  let header:{alg:string;kid:string},claims:IdTokenClaims;
  try{
    header=JSON.parse(Buffer.from(headerPart,'base64url').toString('utf8')) as {alg:string;kid:string};
    claims=JSON.parse(Buffer.from(payloadPart,'base64url').toString('utf8')) as IdTokenClaims;
  }catch(e){throw new Error('Token de Google inválido',{cause:e});}
  if(header.alg!=='RS256')throw new Error('Algoritmo de Google no aceptado');
  if(!ISSUERS.includes(claims.iss))throw new Error('Emisor de Google inválido');
  if(claims.aud!==config.clientId)throw new Error('La autorización de Google pertenece a otra aplicación');
  if(clock()/1000>=claims.exp)throw new Error('La sesión de Google venció. Volvé a conectar.');
  if(!claims.sub||!/^[0-9A-Za-z_-]{1,128}$/.test(claims.sub))throw new Error('Identidad de Google inválida');
  if(!claims.nonce||!equal(hash(claims.nonce),expectedNonceHash))throw new Error('Nonce de Google inválido');
  // Signature: cached JWKS, refreshed at most every 10 minutes per key.
  const jwks=await request(JWKS_URL,{signal:AbortSignal.timeout(10000)}).then(r=>{if(!r.ok)throw new Error('No se pudo validar la identidad de Google');return r.json() as Promise<{keys:(JsonWebKey&{kid:string;alg:string})[]}>;});
  const jwk=jwks.keys.find(k=>k.kid===header.kid&&k.alg==='RS256');
  if(!jwk)throw new Error('Clave de Google no disponible');
  const keyObject=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  const valid=await crypto.subtle.verify({name:'RSASSA-PKCS1-v1_5'},keyObject,Buffer.from(signaturePart,'base64url'),Buffer.from(`${headerPart}.${payloadPart}`));
  if(!valid)throw new Error('Firma de Google inválida');
  return claims;
}

export class GoogleAuth {
  private flows=new Map<string,Flow>();private pending=new Map<string,Pending>();
  constructor(readonly points:Points,private readonly config:Config,private readonly request:typeof fetch=fetch,private readonly clock:()=>number=Date.now){}
  exportState(){return {flows:Object.fromEntries(this.flows),pending:Object.fromEntries(this.pending)};}
  importState(state:ReturnType<GoogleAuth['exportState']>){this.flows=new Map(Object.entries(state.flows));this.pending=new Map(Object.entries(state.pending));}
  get configured(){return !!this.config.clientId;}
  private prune(){for(const map of [this.flows,this.pending])for(const [key,f] of map)if(f.expires<=this.clock())map.delete(key);}
  /** start(token?) — same dual login/link shape as TwitchAuth: no session starts a Google-first
   * login; an existing session links Google to that account without changing accountId. */
  start(token?:string){
    if(!this.configured)throw new Error('El acceso con Google todavía no está configurado');
    this.prune();if(this.flows.size+this.pending.size>=1000)throw new Error('Demasiadas conexiones pendientes');
    let flow:Flow={cookieHash:'',nonceHash:'',expires:0};
    if(token){const a=this.points.me(token);if(!a.id)throw new Error('Iniciá sesión en Plot antes de vincular Google');flow={accountId:a.id,cookieHash:'',nonceHash:'',expires:0};}
    const state=nonce(),cookie=nonce(),userNonce=nonce();
    this.flows.set(state,{...flow,cookieHash:hash(cookie),nonceHash:hash(userNonce),expires:this.clock()+10*60_000});
    let url:URL;
    try{url=new URL('https://accounts.google.com/o/oauth2/v2/auth');}catch(e){throw new Error('No se pudo armar la URL de Google',{cause:e});}
    try{url.search=new URLSearchParams({client_id:this.config.clientId,redirect_uri:`${typeof this.config.origin==='function'?this.config.origin():this.config.origin}/auth/google/callback`,response_type:'code',scope:'openid profile email',state,nonce:userNonce,prompt:'select_account'}).toString();}catch(e){throw new Error('No se pudo armar la URL de Google',{cause:e});}
    return {url:url.href,cookie};
  }
  consume(state:string,cookie:string,code:string|undefined,denied=false){
    this.prune();const flow=this.flows.get(state);
    if(!flow||!cookie||!equal(flow.cookieHash,hash(cookie)))throw new Error('La conexión venció o se abrió en otro navegador. Volvé a conectar Google.');
    this.flows.delete(state);
    if(denied)throw new Error('Cancelaste la conexión con Google. Podés volver a intentar.');
    if(!code||code.length>2048)throw new Error('Google no devolvió un código de autorización válido');
    return flow;
  }
  /** Exchanges the code, validates the ID token fully and stages the verified identity. */
  async callback(state:string,cookie:string,code:string|undefined,denied=false){
    const flow=this.consume(state,cookie,code,denied);
    const tokenResponse=await this.request('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:this.config.clientId,...(this.config.clientSecret?{client_secret:this.config.clientSecret}:{}),code:code!,grant_type:'authorization_code',redirect_uri:`${typeof this.config.origin==='function'?this.config.origin():this.config.origin}/auth/google/callback`,nonce:flow.nonceHash.slice(0,0)}),signal:AbortSignal.timeout(10000)});
    if(!tokenResponse.ok)throw new Error('Google no pudo confirmar el acceso. Volvé a conectar.');
    const tokens={id_token:z.string().min(1).parse(((await tokenResponse.json().catch(e=>{throw new Error('Respuesta de Google inválida',{cause:e});})) as {id_token?:string}).id_token)};
    const claims=await verifyIdToken(tokens.id_token,this.config,flow.nonceHash,this.request,this.clock);
    // Identity proof only: the authorization code is single-use and no refresh token is requested or stored.
    const ticket=nonce();this.pending.set(ticket,{...flow,expires:this.clock()+5*60_000,identity:{id:claims.sub,email:typeof claims.email==='string'&&claims.email.length<=254?claims.email:undefined,displayName:(typeof claims.name==='string'&&claims.name.length<=100?claims.name:'Cuenta de Google'),linkedAt:new Date(this.clock()).toISOString()}});
    return ticket;
  }
  /** complete(token?, ticket, cookie) — same dual login/link contract as TwitchAuth.complete. */
  async complete(token:string|undefined,ticket:string,cookie:string){
    this.prune();const p=this.pending.get(ticket);
    if(!p||!cookie||!equal(p.cookieHash,hash(cookie)))throw new Error('La cuenta cambió durante la conexión. Volvé a conectar Google.');
    this.pending.delete(ticket);
    if(!p.accountId)return this.points.loginWithGoogle(p.identity);
    const a=this.points.me(token??'');
    if(a.id!==p.accountId)throw new Error('La cuenta cambió durante la conexión. Volvé a conectar Google.');
    return this.points.linkGoogle(token!,p.identity);
  }
}