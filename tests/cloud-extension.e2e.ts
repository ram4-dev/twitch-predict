import {test,expect} from '@playwright/test';
import {randomBytes,randomUUID,generateKeyPairSync,sign} from 'node:crypto';
import type {AddressInfo} from 'node:net';
import {getBase58Decoder} from '@solana/kit';
import {cloudApp} from '../src/cloud/app.js';
import {cloudConfig} from '../src/cloud/config.js';
import {Documents} from '../src/cloud/documents.js';
const database=process.env.PLOT_STAGING_DATABASE_URL;
test.skip(!database,'Requires a local PostgreSQL database');
test('store and ZIP origins complete signed login and isolated extension handoff; foreign and mismatched IDs fail',async({request})=>{
 const docs=new Documents(database!,`test-origin-${randomUUID()}`);await docs.migrate();
 const env={DATABASE_URL:database,AUTH_ORIGIN:'https://plot.example',PLOT_NAMESPACE:docs.namespace};
 const app=cloudApp(docs,env),server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
 const ids=cloudConfig(env).extensionIds;
 try{
  for(const extensionId of ids){
   const origin=`chrome-extension://${extensionId}`,headers={origin,'sec-fetch-site':'cross-site'};
   const preflight=await request.fetch(base+'/api/auth/extension/start',{method:'OPTIONS',headers:{...headers,'access-control-request-method':'POST','access-control-request-headers':'content-type'}});
   expect(preflight.status()).toBe(204);expect(preflight.headers()['access-control-allow-origin']).toBe(origin);
   const state=randomBytes(32).toString('hex');
   const start=await request.post(base+'/api/auth/extension/start',{headers,data:{extensionId,state}});expect(start.ok()).toBeTruthy();const {flowId}=await start.json();
   const keys=generateKeyPairSync('ed25519'),address=getBase58Decoder().decode(keys.publicKey.export({format:'der',type:'spki'}).subarray(-32));
   const webHeaders={origin:env.AUTH_ORIGIN,'sec-fetch-site':'same-origin'};
   const challengeResponse=await request.post(base+'/api/auth/challenge',{headers:webHeaders,data:{address,flowId}});expect(challengeResponse.ok()).toBeTruthy();const challenge=await challengeResponse.json();
   expect(challenge.message).toContain('URI: https://plot.example');
   const signature=sign(null,Buffer.from(challenge.message),keys.privateKey).toString('base64');
   const verified=await request.post(base+'/api/auth/verify',{headers:webHeaders,data:{challengeId:challenge.challengeId,signature}});expect(verified.ok()).toBeTruthy();const web=await verified.json();expect(web.handoff.extensionId).toBe(extensionId);
   const otherId=ids.find(id=>id!==extensionId)!;
   // Neither a mismatched body nor a different approved extension may redeem this flow.
   const wrongOrigin=await request.post(base+'/api/auth/extension/complete',{headers:{...headers,origin:`chrome-extension://${otherId}`},data:{...web.handoff,state}});expect(wrongOrigin.status()).toBe(400);
   const wrongFlow=await request.post(base+'/api/auth/extension/complete',{headers:{...headers,origin:`chrome-extension://${otherId}`},data:{...web.handoff,state,extensionId:otherId}});expect(wrongFlow.status()).toBe(400);
   const completed=await request.post(base+'/api/auth/extension/complete',{headers,data:{...web.handoff,state}});expect(completed.ok()).toBeTruthy();const extension=await completed.json();expect(extension.token).not.toBe(web.token);
   const me=await request.get(base+'/api/points/me',{headers:{...headers,authorization:`Bearer ${extension.token}`}});expect(me.ok()).toBeTruthy();expect((await me.json()).wallet).toBe(address);
   const replay=await request.post(base+'/api/auth/extension/complete',{headers,data:{...web.handoff,state}});expect(replay.status()).toBe(400);
   const mismatch=await request.post(base+'/api/auth/extension/start',{headers,data:{extensionId:otherId,state}});expect(mismatch.status()).toBe(400);
  }
  for(const origin of ['https://evil.example',`chrome-extension://${'a'.repeat(32)}`]){
   const denied=await request.fetch(base+'/api/auth/extension/start',{method:'OPTIONS',headers:{origin}});expect(denied.status()).toBe(403);
  }
  const unknown=await request.post(base+'/api/auth/extension/start',{headers:{origin:env.AUTH_ORIGIN},data:{extensionId:'a'.repeat(32),state:randomBytes(32).toString('hex')}});expect(unknown.status()).toBe(400);
 }finally{
  app.locals.liveMarkets.close();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));
  for(const table of ['documents','leases','request_limits'])await docs.pool.query(`DELETE FROM plot_private.${table} WHERE namespace=$1`,[docs.namespace]);await docs.close();
 }
});
