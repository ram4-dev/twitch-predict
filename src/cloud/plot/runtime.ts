import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {Keypair,PublicKey,type Connection} from '@solana/web3.js';
import {Pool} from 'pg';
import type {Request} from 'express';
import type {Documents} from '../documents.js';
import {PointsSessionError} from '../../points-identity.js';
import {PlotSponsor,type SponsorPolicy} from '../../plot/sponsor.js';
import {createPlotSponsorBuilder} from '../../plot/sponsor-builder.js';
import {createPlotSponsorRouter} from '../../plot/sponsor-router.js';
import {sponsorRpc} from '../../plot/sponsor-rpc.js';
import type {PlotIdl} from '../../plot/instructions.js';
import {PostgresMockPaymentProvider} from './payment.js';
import {PaymentReconciler} from './reconcile.js';
import {TwitchProjection} from './twitch.js';
import {twitchMarketHash,twitchOutcomeHash} from './identity.js';
import {SolanaPlotAdapter,verifiedTestConnection,testRpcTransport} from './solana.js';
import type {PlotActor,PlotRouterDependencies} from './router.js';

type RuntimeOptions={connection:Connection;genesis:string;program:PublicKey;mint:PublicKey;payment:Keypair;resolver:Keypair;sponsor:Keypair;idl:PlotIdl;sponsorPool:Pool;policy:SponsorPolicy;chain:SolanaPlotAdapter;allowMockConfirmation:boolean};
const discriminator=(name:string)=>createHash('sha256').update(`global:${name}`).digest().subarray(0,8);
/** Real session is resolved afresh from cloudApp middleware; no identity is accepted from the request body. */
function actor(req:Request):PlotActor {
 const token=req.get('authorization')?.replace(/^Bearer /,'')??'';
 const points=req.res?.locals.context?.points;
 if(!points||!token)throw new PointsSessionError('Unauthorized');
 const user=points.me(token);return {id:user.id,wallet:user.wallet,twitch:user.twitch};
}
/** RPC and keys are injected only after network, IDL and configuration checks. */
export async function createPlotRuntime(documents:Documents,options:RuntimeOptions){
 const {connection,genesis,program,mint,sponsor,idl,sponsorPool,policy,chain}=options;
 const allMarkets=async()=>{const {rows}=await documents.pool.query('SELECT broadcaster,prediction,outcomes FROM plot_private.plot_twitch_markets WHERE namespace=$1',[documents.namespace]);return rows as {broadcaster:string;prediction:string;outcomes:string[]}[];};
 const ownsWallet=async(userId:string,wallet:PublicKey)=>{const state=await documents.read('points',()=>({accounts:{} as Record<string,{wallet?:string}>}));return state.accounts[userId]?.wallet===wallet.toBase58();};
 const authorizeMarket=async(_userId:string,identity:Buffer)=>{
  const market=(await allMarkets()).find(m=>twitchMarketHash(m.broadcaster,m.prediction)===identity.toString('hex'));if(!market)return false;
  try{await chain.marketView(market.broadcaster,market.prediction);return true;}catch{return false;}
 };
 const build=createPlotSponsorBuilder({connection,expectedGenesis:genesis,idl,program,mint,sponsor:sponsor.publicKey,ownsWallet,authorizeMarket});
 const service=new PlotSponsor(sponsorPool,sponsor,policy,{build,...sponsorRpc(connection)});await service.initialize();
 const resolveUser=async(req:Request)=>{try{const a=actor(req);return a.wallet?a.id:null;}catch(error){if(error instanceof PointsSessionError)return null;throw error;}};
 const guardedService={
  prepare:service.prepare.bind(service),getIntent:service.getIntent.bind(service),reconcile:service.reconcile.bind(service),expireUnsigned:service.expireUnsigned.bind(service),
  submit:async(userId:string,id:string,transaction:string)=>{
   const {rows}=await sponsorPool.query('SELECT wallet FROM plot_sponsor_intents WHERE id=$1 AND user_id=$2',[id,userId]);
   if(!rows.length||!await ownsWallet(userId,new PublicKey(rows[0].wallet)))throw new Error('Wallet no longer linked');
   return service.submit(userId,id,transaction);
  },
 };
 const intentsRouter=createPlotSponsorRouter(guardedService,resolveUser),mock=new PostgresMockPaymentProvider(documents.pool,documents.namespace);
 const dependencies:PlotRouterDependencies={actor:async req=>actor(req),payments:new PaymentReconciler(documents.pool,documents.namespace,mock,chain),mock,intentsRouter,twitch:new TwitchProjection(documents.pool,documents.namespace),read:{pool:documents.pool,namespace:documents.namespace},allowMockConfirmation:options.allowMockConfirmation,chainMarketRead:(b,p)=>chain.marketView(b,p),accountRead:async wallet=>chain.account(wallet,await allMarkets())};
 return {dependencies,chain,service};
}
const required=(env:NodeJS.ProcessEnv,key:string)=>{const value=env[key];if(!value)throw new Error(`Missing ${key}`);return value;};
const limit=(env:NodeJS.ProcessEnv,key:string)=>{const value=required(env,key);if(!/^(0|[1-9][0-9]*)$/.test(value)||value.length>20)throw new Error(`Invalid ${key}`);return BigInt(value);};
const count=(env:NodeJS.ProcessEnv,key:string)=>{const n=limit(env,key);if(n>BigInt(Number.MAX_SAFE_INTEGER))throw new Error(`Invalid ${key}`);return Number(n);};
const secretKey=(env:NodeJS.ProcessEnv,key:string)=>{try{const data:unknown=JSON.parse(required(env,key));if(!Array.isArray(data)||data.length!==64||data.some(n=>!Number.isInteger(n)||n<0||n>255))throw new Error();return Keypair.fromSecretKey(Uint8Array.from(data));}catch{throw new Error(`Invalid ${key}`);}};
/** Fail-closed explicit test mode. Values must arrive through vault-env, never logs or files. */
export async function createPlotRuntimeFromEnv(documents:Documents,env:NodeJS.ProcessEnv){
 if(env.PLOT_ONCHAIN_ENABLED!=='true')return null;
 const network=required(env,'PLOT_TEST_NETWORK');if(network!=='localnet'&&network!=='devnet')throw new Error('PLOT_TEST_NETWORK must be localnet or devnet');
 const rpc=required(env,'PLOT_TEST_RPC_URL'),localGenesis=env.PLOT_TEST_GENESIS,connection=await verifiedTestConnection(rpc,network,localGenesis),genesis=await connection.getGenesisHash();
 const program=new PublicKey(required(env,'PLOT_PROGRAM_ID')),mint=new PublicKey(required(env,'PLOT_MINT'));
 const payment=secretKey(env,'PLOT_PAYMENT_KEYPAIR'),resolver=secretKey(env,'PLOT_RESOLVER_KEYPAIR'),sponsor=secretKey(env,'PLOT_SPONSOR_KEYPAIR');
 if(new Set([payment.publicKey.toBase58(),resolver.publicKey.toBase58(),sponsor.publicKey.toBase58()]).size!==3)throw new Error('Plot authorities must be distinct');
 execFileSync(process.execPath,['scripts/check-plot-idl.mjs','programs/plot/idl/plot.json'],{stdio:'ignore'});
 const idl=JSON.parse(readFileSync('programs/plot/idl/plot.json','utf8')) as PlotIdl;if(idl.address!==program.toBase58())throw new Error('Program ID and IDL mismatch');
 const sponsorUrl=required(env,'PLOT_SPONSOR_DATABASE_URL'),appUrl=new URL(required(env,'DATABASE_URL')),sponsorDb=new URL(sponsorUrl);
 if(!['postgres:','postgresql:'].includes(sponsorDb.protocol)||appUrl.hostname===sponsorDb.hostname&&appUrl.port===sponsorDb.port&&appUrl.pathname===sponsorDb.pathname)throw new Error('Sponsor requires a separate database');
 const sponsorPool=new Pool({connectionString:sponsorUrl,max:5,application_name:'plot-sponsor-test'});sponsorPool.on('error',()=>console.error('Sponsor database interrupted'));
 try{
  const transport=await testRpcTransport({url:rpc,network,expectedLocalGenesis:localGenesis,payment,resolver});
  const binding=async(broadcaster:string,prediction:string)=>{const {rows}=await documents.pool.query('SELECT outcomes FROM plot_private.plot_twitch_markets WHERE namespace=$1 AND broadcaster=$2 AND prediction=$3',[documents.namespace,broadcaster,prediction]);if(!rows.length)throw new Error('Unknown market');return {identity:twitchMarketHash(broadcaster,prediction),optionHashes:Object.fromEntries((rows[0].outcomes as string[]).map(id=>[id,twitchOutcomeHash(broadcaster,prediction,id)]))};};
  const chain=new SolanaPlotAdapter(transport,{program,mint,paymentAuthority:payment.publicKey,resolver:resolver.publicKey,binding});
  const policy:SponsorPolicy={programId:program,maxFee:limit(env,'PLOT_SPONSOR_MAX_FEE'),maxRent:limit(env,'PLOT_SPONSOR_MAX_RENT'),maxPerUser:limit(env,'PLOT_SPONSOR_MAX_PER_USER'),maxGlobal:limit(env,'PLOT_SPONSOR_MAX_GLOBAL'),maxNewAccounts:count(env,'PLOT_SPONSOR_MAX_NEW_ACCOUNTS'),maxAccountsPerUser:count(env,'PLOT_SPONSOR_MAX_ACCOUNTS_PER_USER'),maxAccountsGlobal:count(env,'PLOT_SPONSOR_MAX_ACCOUNTS_GLOBAL'),maxRequestsPerHour:count(env,'PLOT_SPONSOR_MAX_REQUESTS_PER_HOUR'),discriminators:{place_prediction:discriminator('place_prediction'),claim:discriminator('claim')}};
  const runtime=await createPlotRuntime(documents,{connection,genesis,program,mint,payment,resolver,sponsor,idl,sponsorPool,policy,chain,allowMockConfirmation:env.PLOT_MOCK_CONFIRM_ENABLED==='true'});
  return {...runtime,close:()=>sponsorPool.end()};
 }catch(error){await sponsorPool.end();throw error;}
}
