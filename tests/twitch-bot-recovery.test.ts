import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {CloudTwitchBot} from '../src/cloud/twitch-bot.js';
import {LocalDocuments} from '../src/local-documents.js';
import {Points} from '../src/points.js';
const scopes=['user:bot','user:read:chat','user:write:chat'];
async function fixture(work:(v:{bot:CloudTwitchBot;store:LocalDocuments;token:string;subscriptions:Record<string,unknown>[]})=>Promise<void>,granted=scopes,grantId='42'){
 const directory=await mkdtemp(join(tmpdir(),'plot-bot-recovery-'));
 try{
  const store=new LocalDocuments(directory),points=new Points(directory);await points.load();
  const {token}=await points.walletLogin('wallet-a');await points.linkTwitch(token,{id:'123',login:'streamer',displayName:'Streamer',linkedAt:new Date().toISOString()});await points.setBotEnabled(token,true);
  const subscriptions:Record<string,unknown>[]=[];
  const request:typeof fetch=async(input,init)=>{
   const url=String(input);
   if(url.endsWith('/token'))return Response.json({access_token:'fixture',expires_in:3600});
   if(url.includes('/users?login='))return Response.json({data:[{id:'42',login:'plotfun'}]});
   if(url.includes('/authorization/users?'))return Response.json({data:[{user_id:grantId,has_authorized:true,scopes:granted}]});
   if(url.includes('/eventsub/subscriptions')){
    if(init?.method==='POST'){subscriptions.push(JSON.parse(String(init.body)));return Response.json({data:[]},{status:202});}
    return Response.json({data:[],pagination:{}});
   }
   throw new Error('Unexpected mock URL');
  };
  const bot=new CloudTwitchBot(store,{clientId:'fixture',clientSecret:'fixture',origin:'https://private.example',webhookOrigin:'https://public.example'},request,Date.now,points);
  await work({bot,store,token,subscriptions});
 }finally{await rm(directory,{recursive:true,force:true});}
}
test('worker recovers existing Twitch bot grant in a fresh local database without another login',()=>fixture(async({bot,store,token,subscriptions})=>{
 await bot.sync(()=>[]);
 assert.equal((await bot.status(token)).available,true);assert.equal((await bot.status(token)).enabled,true);
 const auth=await store.read('twitch-bot-auth',()=>({bot:undefined as {id:string}|undefined}));assert.equal(auth.bot?.id,'42');
 assert.equal(subscriptions.length,1);assert.equal((subscriptions[0].transport as {callback:string}).callback,'https://public.example/api/twitch/bot/webhook');
 assert.equal(new URL((await bot.start('channel',token)).url).searchParams.get('redirect_uri'),'https://private.example/auth/twitch/bot/callback');
}));
for(const missing of scopes)test(`cannot recover bot missing ${missing}`,()=>fixture(async({bot})=>{assert.equal((await bot.status()).available,false);},scopes.filter(s=>s!==missing)));
test('cannot recover a grant belonging to another user',()=>fixture(async({bot})=>{assert.equal((await bot.status()).available,false);},scopes,'99'));
