import {randomBytes,createPublicKey,verify,timingSafeEqual} from 'node:crypto';
import {address,getAddressEncoder} from '@solana/kit';
import type {Points} from './points.js';
const id=()=>randomBytes(32).toString('hex');
const ttl=5*60_000;
type Flow={id:string;extensionId:string;state:string;preferredToken?:string;expires:number;code?:string;wallet?:string;redeeming?:boolean};
type Challenge={id:string;address:string;origin:string;message:string;expires:number;flowId?:string;preferredToken?:string};
function publicKey(value:string){const bytes=getAddressEncoder().encode(address(value));return createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(bytes)]),format:'der',type:'spki'});}
const equal=(a:string,b:string)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
export class Auth {
  private flows=new Map<string,Flow>();private challenges=new Map<string,Challenge>();
  constructor(readonly points:Points,readonly clock=()=>Date.now()){}
  private prune(){for(const [key,f] of this.flows)if(f.expires<=this.clock())this.flows.delete(key);for(const [key,c] of this.challenges)if(c.expires<=this.clock())this.challenges.delete(key);}
  private flow(flowId:string){const f=this.flows.get(flowId);if(!f||f.expires<=this.clock())throw new Error('El acceso venció. Volvé a abrirlo desde la extensión.');return f;}
  start(extensionId:string,state:string,preferredToken?:string){
    this.prune();if(!/^[a-p]{32}$/.test(extensionId)||!/^[a-f0-9]{64}$/.test(state))throw new Error('Solicitud de extensión inválida');
    if(preferredToken){try{this.points.me(preferredToken);}catch{preferredToken=undefined;}}
    if(this.flows.size>=1000)throw new Error('Demasiados accesos pendientes');
    const f:Flow={id:id(),extensionId,state,preferredToken,expires:this.clock()+30*60_000};this.flows.set(f.id,f);return {flowId:f.id,expiresAt:new Date(f.expires).toISOString()};
  }
  context(flowId:string){const f=this.flow(flowId);return {extensionId:f.extensionId,expiresAt:new Date(f.expires).toISOString()};}
  challenge(wallet:string,origin:string,flowId?:string,preferredToken?:string){
    this.prune();publicKey(wallet);const url=new URL(origin);if(!['http:','https:'].includes(url.protocol)||url.origin!==origin)throw new Error('Origen inválido');
    if(preferredToken){try{this.points.me(preferredToken);}catch{preferredToken=undefined;}}
    if(flowId){const f=this.flow(flowId);if(f.code||f.redeeming)throw new Error('Este acceso ya se completó');}
    if(this.challenges.size>=1000)throw new Error('Demasiados intentos de acceso');
    const challengeId=id(),nonce=id().slice(0,24),issuedAt=new Date(this.clock()).toISOString(),expires=this.clock()+ttl;
    // SIWS statements use RFC 3986 reserved/unreserved characters (ASCII).
    // Accented text is valid UTF-8 but Phantom rejects it in this grammar.
    const message=`${url.host} wants you to sign in with your Solana account:\n${wallet}\n\nIniciar sesion en Prediction Mirror.\n\nURI: ${origin}\nVersion: 1\nChain ID: solana:mainnet\nNonce: ${nonce}\nIssued At: ${issuedAt}\nExpiration Time: ${new Date(expires).toISOString()}`;
    this.challenges.set(challengeId,{id:challengeId,address:wallet,origin,message,expires,flowId,preferredToken});return {challengeId,message,expiresAt:new Date(expires).toISOString()};
  }
  async authenticate(challengeId:string,signature:string,origin:string){
    const c=this.challenges.get(challengeId);if(!c||c.expires<=this.clock())throw new Error('La firma venció. Volvé a conectar Phantom.');
    if(c.origin!==origin)throw new Error('Origen de firma inválido');
    const bytes=Buffer.from(signature,'base64');if(bytes.length!==64||!verify(null,Buffer.from(c.message),publicKey(c.address),bytes))throw new Error('La firma de Phantom no es válida');
    const f=c.flowId?this.flow(c.flowId):undefined;if(f?.code||f?.redeeming)throw new Error('Este acceso ya se completó');
    // Reserve before persistence: two concurrent proofs cannot consume a challenge twice.
    this.challenges.delete(challengeId);if(f)f.redeeming=true;
    try{
      const result=await this.points.walletLogin(c.address,f?.preferredToken??c.preferredToken);
      if(f){f.code=id();f.wallet=c.address;f.redeeming=false;f.expires=this.clock()+ttl;}
      return {...result,...(f?{handoff:{flowId:f.id,code:f.code!,extensionId:f.extensionId}}:{})};
    }catch(e){if(f)f.redeeming=false;throw e;}
  }
  async complete(flowId:string,state:string,code:string,extensionId:string){
    const f=this.flow(flowId);
    if(f.extensionId!==extensionId||!equal(f.state,state)||!f.code||!equal(f.code,code)||!f.wallet||f.redeeming)throw new Error('La vinculación de la extensión no es válida');
    f.redeeming=true;
    try{const result=await this.points.walletLogin(f.wallet);this.flows.delete(flowId);return result;}catch(e){f.redeeming=false;throw e;}
  }
}
