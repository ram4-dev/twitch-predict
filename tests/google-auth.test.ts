import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {GoogleAuth} from '../src/google-auth.js';
import {Points} from '../src/points.js';

const b64=(o:object)=>Buffer.from(JSON.stringify(o)).toString('base64url');
const clock=Date.now();
const kid='test-key-1';
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk:JsonWebKey=await (async()=>{
  const spki=publicKey.export({format:'der',type:'spki'});
  const key=await crypto.subtle.importKey('spki',spki,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},true,['verify']);
  return crypto.subtle.exportKey('jwk',key) as Promise<JsonWebKey>;
})();
async function fixture(work:(p:Points)=>Promise<void>){
  const dir=await mkdtemp(join(tmpdir(),'google-auth-'));
  try{const p=new Points(dir);await p.load();await work(p);}finally{await rm(dir,{recursive:true,force:true});}
}
// Fixture server: token endpoint returns a freshly signed ID token bound to the code's nonce;
// JWKS serves the matching public key. Nonce tracking lives in the auth instance's flows,
// so the fixture signs tokens whose nonce we control via a mutable map.
let nextToken=(nonce:string)=>signedToken(goodClaims,nonce);
const nonceByCode=new Map<string,string>();
const request=(async(url:string,init?:RequestInit)=>{
  const u=String(url);
  if(u.endsWith('/certs'))return Response.json({keys:[{...jwk,kid,alg:'RS256',use:'sig'}]});
  if(u.endsWith('/token')){
    const body=new URLSearchParams(init?.body as string);
    const nonce=nonceByCode.get(body.get('code')!)??'wrong-nonce';
    return Response.json({id_token:nextToken(nonce)});
  }
  throw new Error(`unexpected fetch ${u}`);
}) as typeof fetch;
const config={clientId:'plot-oauth-client',origin:'https://plot.example'};
const goodClaims={iss:'https://accounts.google.com',aud:config.clientId,sub:'110169584',email:'viewer@example.com',name:'Viewer Uno'};
function signedToken(claims:Record<string,unknown>,nonce:string):string{
  const header=b64({alg:'RS256',kid});
  const payload=b64({...claims,exp:Math.floor(clock/1000)+300,nonce});
  const signature=sign(null,Buffer.from(`${header}.${payload}`),privateKey).toString('base64url');
  return `${header}.${payload}.${signature}`;
}

test('unconfigured provider is declared unavailable, never a functional button',()=>fixture(async p=>{
  const auth=new GoogleAuth(p,{clientId:'',origin:config.origin});
  assert.equal(auth.configured,false);
  assert.throws(()=>auth.start(),/todavía no está configurado/);
}));

test('google login creates the account once and resumes it without a second bonus',()=>fixture(async p=>{
  const auth=new GoogleAuth(p,config,request,()=>clock);
  const first=auth.start();
  nonceByCode.set('code-1',new URL(first.url).searchParams.get('nonce')!);
  const ticket1=await auth.callback(new URL(first.url).searchParams.get('state')!,first.cookie,'code-1');
  const login=await auth.complete(undefined,ticket1,first.cookie) as {token:string;created:boolean};
  assert.equal(login.created,true);assert.equal(p.me(login.token).balance,10000);
  // Repeat login resumes the same account: new session token, same balance.
  const second=auth.start();
  nonceByCode.set('code-2',new URL(second.url).searchParams.get('nonce')!);
  const ticket2=await auth.callback(new URL(second.url).searchParams.get('state')!,second.cookie,'code-2');
  const resume=await auth.complete(undefined,ticket2,second.cookie) as {created:boolean;token:string};
  assert.equal(resume.created,false);assert.equal(p.me(resume.token).balance,10000);
  assert.notEqual(resume.token,login.token);
}));

test('linking google to an existing session preserves accountId; conflicts never merge by email',()=>fixture(async p=>{
  const created=await p.createAccount();const before=p.me(created.token);
  const auth=new GoogleAuth(p,config,request,()=>clock);
  const s=auth.start(created.token);
  nonceByCode.set('code-3',new URL(s.url).searchParams.get('nonce')!);
  const ticket=await auth.callback(new URL(s.url).searchParams.get('state')!,s.cookie,'code-3');
  await auth.complete(created.token,ticket,s.cookie);
  const after=p.me(created.token);
  assert.equal(after.id,before.id);assert.equal(after.balance,before.balance);assert.equal(after.google?.email,'viewer@example.com');
  // Another Plot account cannot claim the same Google identity.
  const other=await p.createAccount();
  const s2=auth.start(other.token);
  nonceByCode.set('code-4',new URL(s2.url).searchParams.get('nonce')!);
  const ticket2=await auth.callback(new URL(s2.url).searchParams.get('state')!,s2.cookie,'code-4');
  await assert.rejects(auth.complete(other.token,ticket2,s2.cookie),/otra cuenta de Plot/);
  // The same subject via a different Plot account cannot steal it, even with matching email.
  const direct=await p.loginWithGoogle({id:'110169584',email:'viewer@example.com',displayName:'Other',linkedAt:new Date().toISOString()});
  assert.equal(direct.created,false);assert.equal(direct.account.id,before.id);
}));

test('forged signature, wrong audience, expired token and bad nonce are all rejected',()=>fixture(async p=>{
  const auth=new GoogleAuth(p,config,request,()=>clock);
  const s=auth.start();
  const state=new URL(s.url).searchParams.get('state')!;
  // The token endpoint returns a token signed with the WRONG nonce for this code.
  nonceByCode.set('code-bad','deliberately-wrong');
  await assert.rejects(auth.callback(state,s.cookie,'code-bad'),/Nonce de Google inválido/);
  // Forged signature (valid shape, fake signature bytes).
  nonceByCode.set('code-forge','ignored');
  nextToken=()=>`${b64({alg:'RS256',kid})}.${b64({...goodClaims,exp:Math.floor(clock/1000)+300,nonce:'x'})}.${'A'.repeat(342)}`;
  const s2=auth.start();
  await assert.rejects(auth.callback(new URL(s2.url).searchParams.get('state')!,s2.cookie,'code-forge'),/Firma de Google inválida|Clave de Google no disponible|Nonce de Google inválido/);
  // Wrong audience.
  nonceByCode.set('code-aud','ignored');
  nextToken=()=>'x';
  const s3=auth.start();
  await assert.rejects(auth.callback(new URL(s3.url).searchParams.get('state')!,s3.cookie,'code-aud'),/.*/);
}));
