import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PlotSessionClient, validatePlotChallenge } from '../mobile/src/lib/plot-session-client.js';
const base='https://fixture.invalid', wallet='FixtureWallet', now=Date.now(), expires=new Date(now+60000).toISOString(), issued=new Date(now).toISOString();
const challenge={challengeId:'a'.repeat(64),expiresAt:expires,message:`fixture.invalid wants you to sign in with your Solana account:\n${wallet}\n\nIniciar sesion en Prediction Mirror.\n\nURI: ${base}\nVersion: 1\nNonce: ${'b'.repeat(24)}\nIssued At: ${issued}\nExpiration Time: ${expires}`};
test('challenge binds wallet, origin and expiry before signing',()=>{
 assert.equal(validatePlotChallenge(challenge,base,wallet,now).message,challenge.message);
 assert.throws(()=>validatePlotChallenge(challenge,base,'other',now));
 assert.throws(()=>validatePlotChallenge(challenge,'https://other.invalid',wallet,now));
 assert.throws(()=>validatePlotChallenge(challenge,base,wallet,now+120000));
});
test('session is scoped by wallet and origin and stores only verified response', async()=>{
 const values=new Map<string,string>(), store={async getItem(k:string){return values.get(k)??null;},async setItem(k:string,v:string){values.set(k,v);},async deleteItem(k:string){values.delete(k);}};
 let signs=0;
 const signer={async connect(){return {publicKey:{toBase58:()=>wallet}};},async signMessage(_m:Uint8Array,expected:string){assert.equal(expected,wallet);signs++;return new Uint8Array(64);}};
 const fetcher=async (url:string)=>({ok:true,async json(){return url.endsWith('/challenge')?challenge:{token:'c'.repeat(64),account:{wallet}};}});
 const client=new PlotSessionClient(base,signer,store,fetcher);await client.login(); assert.equal(signs,1);assert.equal(await client.token(wallet),'c'.repeat(64));await assert.rejects(()=>client.token('other'));await client.logout(wallet);await assert.rejects(()=>client.token(wallet));
 const bad=new PlotSessionClient(base,signer,store,async()=>({ok:true,async json(){return {...challenge,message:challenge.message.replace(wallet,'other')};}}));
 await assert.rejects(()=>bad.login());assert.equal(signs,1);
});
test('session client interoperates with the existing signed challenge service',async()=>{
 const {generateKeyPairSync,sign}=await import('node:crypto'); const {mkdtemp,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os'); const {getAddressDecoder}=await import('@solana/kit');
 const {Points}=await import('../src/points.js'); const {Auth}=await import('../src/auth.js');
 const dir=await mkdtemp(`${tmpdir()}/plot-mobile-auth-`);
 try {
  const points=new Points(dir);await points.load();const auth=new Auth(points), keys=generateKeyPairSync('ed25519');
  const address=getAddressDecoder().decode(keys.publicKey.export({format:'der',type:'spki'}).subarray(-32));
  const values=new Map<string,string>(),store={async getItem(k:string){return values.get(k)??null;},async setItem(k:string,v:string){values.set(k,v);},async deleteItem(k:string){values.delete(k);}};
  const request=async (url:string,init:RequestInit)=>{const body=JSON.parse(String(init.body));const data=url.endsWith('/challenge')?auth.challenge(body.address,base):await auth.authenticate(body.challengeId,body.signature,base);return {ok:true,async json(){return data;}};};
  const signer={async connect(){return {publicKey:{toBase58:()=>address}};},async signMessage(message:Uint8Array){return sign(null,Buffer.from(message),keys.privateKey);}};
  const client=new PlotSessionClient(base,signer,store,request);await client.login();assert.equal(points.me(await client.token(address)).wallet,address);
 } finally {await rm(dir,{recursive:true,force:true});}
});
