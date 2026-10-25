import express from 'express';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {Auth} from './auth.js';
import { Points } from './points.js';
import { TwitchSource } from './twitch-source.js';
import { demoPrediction } from './mirror.js';
import { predictionSchema } from './prediction.js';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const directory=resolve(process.env.DATA_DIR??`${root}/data`);
await mkdir(directory,{recursive:true,mode:0o700});
try{await writeFile(`${directory}/bridge-token`,randomBytes(32).toString('hex'),{mode:0o600,flag:'wx'});}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;}
const token=(await readFile(`${directory}/bridge-token`,'utf8')).trim();
const points=new Points(directory);await points.load();const source=new TwitchSource(points);const auth=new Auth(points);
const app=express();app.disable('x-powered-by');app.set('trust proxy','loopback');
app.use((req,res,next)=>{
  if(!['twitch-predict.localhost','twitch-points-test.localhost','localhost','127.0.0.1'].includes(req.hostname)){res.status(403).json({error:'Untrusted host'});return;}
  const origin=req.headers.origin;
  if(origin&&!/^chrome-extension:\/\/[a-p]{32}$/.test(origin)&&origin!==`${req.protocol}://${req.get('host')}`){res.status(403).json({error:'Untrusted origin'});return;}
  // A local POC with anonymous points: never allow a foreign website to create accounts or place bets.
  if(req.get('sec-fetch-site')==='cross-site'&&!origin?.startsWith('chrome-extension://')){res.status(403).json({error:'Untrusted site'});return;}
  res.set('Referrer-Policy','no-referrer');res.set('Cache-Control','no-store');res.set('X-Content-Type-Options','nosniff');
  res.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'");next();
});
app.use(express.json({limit:'16kb'}));
const route=(handler:(req:express.Request,res:express.Response)=>unknown)=>async(req:express.Request,res:express.Response)=>{try{await handler(req,res);}catch(e){res.status(400).json({error:e instanceof z.ZodError?'Datos de la operación inválidos':(e as Error).message});}};
const bearer=(req:express.Request)=>req.get('authorization')?.replace(/^Bearer /,'')??'';
app.get('/api/health',(_req,res)=>res.json({ok:true,network:'offchain',protocol:'Puntos internos',features:['bet','resolve','claim'],sourceError:source.lastError}));
app.get('/api/markets',(_req,res)=>res.json(points.markets()));
app.get('/api/channels',(_req,res)=>res.json({channels:points.channels(),sourceError:source.lastError}));
app.get('/api/pair',(req,res)=>{if(req.get('sec-fetch-site')!=='same-origin'){res.status(403).json({error:'Open the dashboard to pair'});return;}res.json({token});});
const appOrigin=(req:express.Request)=>`${req.protocol}://${req.get('host')}`;
app.get('/api/auth/config',(req,res)=>res.json({origin:process.env.AUTH_ORIGIN??appOrigin(req)}));
app.post('/api/auth/extension/start',route((req,res)=>{
  const i=z.object({extensionId:z.string().regex(/^[a-p]{32}$/),state:z.string().regex(/^[a-f0-9]{64}$/)}).parse(req.body);
  res.json(auth.start(i.extensionId,i.state,bearer(req)||undefined));
}));
app.get('/api/auth/flow/:flowId',route((req,res)=>res.json(auth.context(String(req.params.flowId)))));
app.post('/api/auth/challenge',route((req,res)=>{
  const i=z.object({address:z.string().min(32).max(44),flowId:z.string().regex(/^[a-f0-9]{64}$/).optional()}).parse(req.body);
  res.json(auth.challenge(i.address,appOrigin(req),i.flowId,bearer(req)||undefined));
}));
app.post('/api/auth/verify',route(async(req,res)=>{
  const i=z.object({challengeId:z.string().regex(/^[a-f0-9]{64}$/),signature:z.string().max(128)}).parse(req.body);
  res.json(await auth.authenticate(i.challengeId,i.signature,appOrigin(req)));
}));
app.post('/api/auth/extension/complete',route(async(req,res)=>{
  const i=z.object({flowId:z.string().regex(/^[a-f0-9]{64}$/),state:z.string().regex(/^[a-f0-9]{64}$/),code:z.string().regex(/^[a-f0-9]{64}$/),extensionId:z.string().regex(/^[a-p]{32}$/)}).parse(req.body);
  if(req.get('origin')&&req.get('origin')!==`chrome-extension://${i.extensionId}`)throw new Error('Origen de extensión inválido');
  res.json({...await auth.complete(i.flowId,i.state,i.code,i.extensionId),bridgeToken:token});
}));
app.post('/api/points/session',(_req,res)=>res.status(410).json({error:'Conectá Phantom para iniciar sesión'}));
app.get('/api/points/me',route((req,res)=>res.json(points.me(bearer(req)))));
const betInput=z.object({key:z.string().min(1).max(300),outcomeId:z.string().min(1).max(128),amount:z.number().int().positive().max(1_000_000),requestId:z.string().uuid()});
app.post('/api/points/bet',route(async(req,res)=>{if(!points.me(bearer(req)).wallet)throw new Error('Conectá Phantom para apostar');const i=betInput.parse(req.body);res.json(await points.bet(bearer(req),i.key,i.outcomeId,i.amount,i.requestId));}));
const claimInput=z.object({key:z.string().min(1).max(300),requestId:z.string().uuid()});
app.post('/api/points/claim',route(async(req,res)=>{if(!points.me(bearer(req)).wallet)throw new Error('Conectá Phantom para cobrar');const i=claimInput.parse(req.body);res.json(await points.claim(bearer(req),i.key,i.requestId));}));
app.use('/api',(req,res,next)=>{const given=Buffer.from(bearer(req));const expected=Buffer.from(token);if(given.length!==expected.length||!timingSafeEqual(given,expected)){res.status(401).json({error:'Bridge pairing required'});return;}next();});
app.post('/api/predictions',route(async(req,res)=>{
  const input=predictionSchema.parse(req.body);
  // The consumer cannot choose a live result or inject an arbitrary prediction.
  const verified=await source.prediction(input.id,input.channel);
  const market=await points.accept(verified);await points.watch(verified.channel);res.status(202).json(market);
}));
app.post('/api/channels',route(async(req,res)=>{const channel=z.string().regex(/^[a-zA-Z0-9_]{1,40}$/).parse(req.body.channel);await points.watch(channel);await source.sync();res.json({channels:points.channels(),sourceError:source.lastError});}));
app.delete('/api/channels/:channel',route(async(req,res)=>res.json({channels:await points.unwatch(String(req.params.channel))})));
app.post('/api/demo',route(async(_req,res)=>res.status(201).json(await points.accept(demoPrediction(),true))));
app.post('/api/demo/resolve',route(async(req,res)=>{const input=z.object({key:z.string().max(300),winnerId:z.string().max(128).nullable()}).parse(req.body);res.json(await points.demoResolve(input.key,input.winnerId));}));
app.post('/api/sync',route(async(_req,res)=>{await source.sync();res.json({ok:true,sourceError:source.lastError});}));
app.get('/onboarding',(req,res)=>{if(process.env.AUTH_ORIGIN&&appOrigin(req)!==process.env.AUTH_ORIGIN){res.redirect(`${process.env.AUTH_ORIGIN}/onboarding`);return;}res.sendFile('onboarding.html',{root:`${root}/public`});});
app.use(express.static(`${root}/public`));
app.use('/extension',express.static(`${root}/extension`));
const server=app.listen(Number(process.env.PORT??3000),'127.0.0.1',async()=>{
  console.log('Prediction Mirror ready (centralized offchain points).');
  const port=(server.address() as {port:number}).port;
  await writeFile(`${directory}/runtime-port`,String(port),{mode:0o600});
  if(process.env.AUTH_PROXY_STATE_DIR)try{await promisify(execFile)('portless',['alias','twitch-predict',String(port),'--force'],{env:{...process.env,PORTLESS_STATE_DIR:process.env.AUTH_PROXY_STATE_DIR,PORTLESS_PORT:'1357',PORTLESS_HTTPS:'1'}});}catch(e){console.error('Could not refresh auth HTTPS alias:',(e as Error).message);}
});
const timer=setInterval(()=>{void source.sync().catch(e=>console.error('Twitch sync failed:',(e as Error).message));},5000);timer.unref();
void source.sync().catch(e=>console.error('Initial Twitch sync failed:',(e as Error).message));
process.on('SIGTERM',()=>{clearInterval(timer);server.close();});
