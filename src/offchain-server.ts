import {LocalDocuments} from './local-documents.js';
import {CloudTwitchBot} from './cloud/twitch-bot.js';
import {trustedLocalHostname} from './local-origin.js';
import {EventEmitter} from 'node:events';
import {TwitchChannelSearch} from './twitch-search.js';
import {contentSecurityPolicyForPath} from './content-security-policy.js';
import express from 'express';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {Auth} from './auth.js';
import {Waitlist} from './waitlist.js';
import {TwitchAuth} from './twitch-auth.js';
import {GoogleAuth} from './google-auth.js';
import { Points } from './points.js';
import { TwitchSource } from './twitch-source.js';
import { demoPrediction } from './mirror.js';
import { predictionSchema } from './prediction.js';
import {ByteTwitchMirror} from './byte-twitch.js';
import {ByteService} from './byte.js';
import {byteRouter} from './byte-router.js';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const directory=resolve(process.env.DATA_DIR??`${root}/data`);
await mkdir(directory,{recursive:true,mode:0o700});
try{await writeFile(`${directory}/bridge-token`,randomBytes(32).toString('hex'),{mode:0o600,flag:'wx'});}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;}
const token=(await readFile(`${directory}/bridge-token`,'utf8')).trim();
const points=new Points(directory);await points.load();const source=new TwitchSource(points);const auth=new Auth(points);
const marketEvents=new EventEmitter();marketEvents.setMaxListeners(0);
const byte=new ByteService(directory,process.env.BYTE_API_KEY??'',process.env.BYTE_BASE_URL||undefined,fetch,undefined,()=>marketEvents.emit('markets'));await byte.load();
const byteMirror=new ByteTwitchMirror(directory,byte,source,Date.now,undefined,()=>marketEvents.emit('markets'));await byteMirror.load();
const channelSearch=new TwitchChannelSearch();
const waitlist=new Waitlist(directory);await waitlist.load();

const app=express();app.disable('x-powered-by');app.set('trust proxy','loopback');
app.use((req,res,next)=>{
  const trustedHost=(name:string)=>trustedLocalHostname(name,process.env.AUTH_ORIGIN);
  if(!trustedHost(req.hostname)){res.status(403).json({error:'Untrusted host'});return;}
  const origin=req.headers.origin;
  // The portless proxy rewrites Host to its backend address, so validate the origin's hostname against
  // the same trusted set instead of comparing it to req.hostname.
  let originUrl:URL|undefined;
  if(origin)try{originUrl=new URL(origin);}catch{res.status(403).json({error:'Origen inválido'});return;}
  if(origin&&!/^chrome-extension:\/\/[a-p]{32}$/.test(origin)&&!trustedHost(originUrl!.hostname)){res.status(403).json({error:'Untrusted origin'});return;}
  // A local POC with anonymous points: never allow a foreign website to create accounts or place bets.
  const documentNavigation=req.method==='GET'&&req.get('sec-fetch-mode')==='navigate'&&req.get('sec-fetch-dest')==='document'&&!req.path.startsWith('/api');
  if(req.get('sec-fetch-site')==='cross-site'&&!origin?.startsWith('chrome-extension://')&&!documentNavigation){res.status(403).json({error:'Untrusted site'});return;}
  res.set('Referrer-Policy','no-referrer');res.set('Cache-Control','no-store');res.set('X-Content-Type-Options','nosniff');
  res.set('Content-Security-Policy',contentSecurityPolicyForPath(req.path));next();
});
app.post('/api/twitch/bot/webhook',express.raw({type:'application/json',limit:'64kb'}),async(req,res)=>{
  try{if(!Buffer.isBuffer(req.body)){res.sendStatus(400);return;}const headers=Object.fromEntries(['id','timestamp','signature','type'].map(name=>{const key=`twitch-eventsub-message-${name}`;return [key,req.get(key)??''];}));const result=await bot.webhook(headers,req.body);res.status(result.status).type('text/plain').send(result.body);}catch{res.sendStatus(400);}
});
app.use(express.json({limit:'16kb'}));
const route=(handler:(req:express.Request,res:express.Response)=>unknown)=>async(req:express.Request,res:express.Response)=>{try{await handler(req,res);}catch(e){res.status(400).json({error:e instanceof z.ZodError?'Datos de la operación inválidos':(e as Error).message});}};
// Public signup collects only an email and never exposes the stored list.
app.post(['/api/waitlist','/waitlist'],express.urlencoded({extended:false,limit:'2kb'}),async(req,res)=>{
  const native=req.path==='/waitlist';
  try{
    await waitlist.join(req.body?.email);
    if(native){res.redirect(303,'/waitlist-success.html');return;}
    res.status(200).json({ok:true});
  }catch(error){
    const status=error instanceof z.ZodError?400:503;
    if(native){res.status(status).sendFile('waitlist-error.html',{root:`${root}/public`});return;}
    res.status(status).json({error:status===400?'Ingresá un email válido.':'No pudimos guardar tu email. Intentá de nuevo.'});
  }
});
const bearer=(req:express.Request)=>req.get('authorization')?.replace(/^Bearer /,'')??'';
app.get('/api/live/markets',(req,res)=>{
  const origin=req.get('origin');if(origin&&/^chrome-extension:\/\/[a-p]{32}$/.test(origin))res.set('Access-Control-Allow-Origin',origin).vary('Origin');
  if(marketEvents.listenerCount('markets')>=100){res.status(503).set('Retry-After','5').end();return;}
  res.status(200).set({'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no','Connection':'keep-alive'});res.flushHeaders();
  const changed=()=>{if(!res.destroyed)res.write('event: markets\ndata: {}\n\n');};marketEvents.on('markets',changed);res.write('retry: 5000\nevent: ready\ndata: {}\n\n');
  const heartbeat=setInterval(()=>res.write(': heartbeat\n\n'),15000);heartbeat.unref();res.on('close',()=>{clearInterval(heartbeat);marketEvents.off('markets',changed);});
});
app.get('/api/health',(_req,res)=>res.json({ok:true,marketMode:process.env.MARKET_MODE==='byte'?'byte':'offchain',network:process.env.MARKET_MODE==='byte'?'devnet':'offchain',protocol:process.env.MARKET_MODE==='byte'?'byte partner markets':'Puntos internos',features:process.env.MARKET_MODE==='byte'?['wallet-bet','resolve','automatic-payout']:['bet','resolve','claim'],sourceError:source.lastError}));
app.get('/api/markets',(_req,res)=>res.json(points.markets()));
app.get('/api/channels',(_req,res)=>res.json({channels:points.channels(),details:source.channels(),sourceError:source.lastError}));
app.get('/api/pair',(req,res)=>{if(req.get('sec-fetch-site')!=='same-origin'){res.status(403).json({error:'Open the dashboard to pair'});return;}res.json({token});});
const appOrigin=(req:express.Request)=>`${req.protocol}://${req.get('host')}`;
const twitchOrigin=process.env.AUTH_ORIGIN??`http://twitch-predict.localhost:${process.env.PORTLESS_PORT??1356}`;
const twitchAuth=new TwitchAuth(points,{clientId:process.env.TWITCH_CLIENT_ID??'',clientSecret:process.env.TWITCH_CLIENT_SECRET??'',origin:twitchOrigin});
const cookieName='twitch_link';
const linkCookie=(req:express.Request)=>{const raw=req.get('cookie')?.split(';').map(c=>c.trim()).find(c=>c.startsWith(`${cookieName}=`))?.slice(cookieName.length+1)??'';return /^[a-f0-9]{64}$/.test(raw)?raw:'';};
const cookieOptions={httpOnly:true,secure:new URL(twitchOrigin).protocol==='https:',sameSite:'lax' as const,path:'/',maxAge:10*60_000};
const googleAuth=new GoogleAuth(points,{clientId:process.env.GOOGLE_CLIENT_ID??'',clientSecret:process.env.GOOGLE_CLIENT_SECRET,origin:twitchOrigin});
const googleCookieName='google_link';
const googleLinkCookie=(req:express.Request)=>{const raw=req.get('cookie')?.split(';').map(c=>c.trim()).find(c=>c.startsWith(`${googleCookieName}=`))?.slice(googleCookieName.length+1)??'';return /^[a-f0-9]{64}$/.test(raw)?raw:'';};
app.get('/api/google/config',(_req,res)=>res.json({configured:googleAuth.configured}));
app.post('/api/google/start',route((req,res)=>{
  if(appOrigin(req)!==twitchOrigin)throw new Error('Abrí el panel seguro para conectar Google');
  const sessionToken=bearer(req)||undefined;
  if(sessionToken)points.me(sessionToken);
  const result=googleAuth.start(sessionToken);res.cookie(googleCookieName,result.cookie,cookieOptions);res.json({url:result.url});
}));
app.get('/auth/google/callback',async(req,res)=>{
  if(appOrigin(req)!==twitchOrigin){res.status(400).send('Origen de conexión inválido');return;}
  try{
    const state=typeof req.query.state==='string'?req.query.state:'';
    const ticket=await googleAuth.callback(state,googleLinkCookie(req),typeof req.query.code==='string'?req.query.code:undefined,req.query.error==='access_denied');
    res.redirect(`/app?google_ticket=${encodeURIComponent(ticket)}`);
  }catch{
    res.clearCookie(googleCookieName,{...cookieOptions,maxAge:undefined});const error=req.query.error==='access_denied'?'canceled':'failed';
    res.redirect(`/app?google_error=${error}`);
  }
});
app.post('/api/google/complete',route(async(req,res)=>{
  const {ticket}=z.object({ticket:z.string().regex(/^[a-f0-9]{64}$/)}).parse(req.body);
  const result=await googleAuth.complete(bearer(req)||undefined,ticket,googleLinkCookie(req));res.clearCookie(googleCookieName,{...cookieOptions,maxAge:undefined});res.json(result);
}));
app.post('/api/google/disconnect',route(async(req,res)=>res.json(await points.unlinkGoogle(bearer(req)))));
app.get('/api/twitch/search',async(req,res)=>{
  const query=typeof req.query.q==='string'?req.query.q:'';
  if(!/^[a-zA-Z0-9_]{2,40}$/.test(query)){res.status(400).json({error:'Ingresá al menos dos caracteres del usuario de Twitch.'});return;}
  try{res.json({channels:await channelSearch.search(query)});}catch{res.status(503).json({error:'No pudimos consultar Twitch. Probá de nuevo.'});}
 });
app.get('/api/twitch/config',(_req,res)=>res.json({configured:twitchAuth.configured,origin:twitchOrigin}));
const bot=new CloudTwitchBot(new LocalDocuments(directory),{clientId:process.env.TWITCH_CLIENT_ID??'',clientSecret:process.env.TWITCH_CLIENT_SECRET??'',origin:twitchOrigin,webhookOrigin:process.env.TWITCH_BOT_WEBHOOK_ORIGIN},fetch,Date.now,points);
const botCookieName='twitch_bot';
const botCookie=(req:express.Request)=>req.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(botCookieName+'='))?.slice(botCookieName.length+1)??'';
app.get('/api/twitch/bot/status',route(async(req,res)=>res.json(await bot.status(bearer(req)||undefined))));
const botStart=(kind:'channel'|'account')=>route(async(req,res)=>{
  if(req.get('origin')!==twitchOrigin)throw new Error('Abrí la plataforma para autorizar el bot');
  const result=await bot.start(kind,bearer(req));res.cookie(botCookieName,result.cookie,cookieOptions).json({url:result.url});
});
app.post('/api/twitch/bot/start',botStart('channel'));
app.post('/api/twitch/bot/account/start',botStart('account'));
app.get('/auth/twitch/bot/callback',async(req,res)=>{
  try{const result=await bot.callback(typeof req.query.state==='string'?req.query.state:'',botCookie(req),typeof req.query.code==='string'?req.query.code:'',!!req.query.error);
    if(result.kind==='account'){res.clearCookie(botCookieName,{...cookieOptions,maxAge:undefined}).redirect(`${twitchOrigin}/bot-setup.html?connected=1`);return;}
    res.redirect(`${twitchOrigin}/onboarding?streamer=1&bot_ticket=${encodeURIComponent(result.ticket)}`);
  }catch{res.clearCookie(botCookieName,{...cookieOptions,maxAge:undefined}).redirect(`${twitchOrigin}/onboarding?streamer=1&bot_error=failed`);}
});
app.post('/api/twitch/bot/complete',route(async(req,res)=>{const {ticket}=z.object({ticket:z.string().regex(/^[a-f0-9]{64}$/)}).parse(req.body);const result=await bot.complete(bearer(req),ticket,botCookie(req));res.clearCookie(botCookieName,{...cookieOptions,maxAge:undefined}).json(result);}));
app.post('/api/twitch/bot/disable',route(async(req,res)=>res.json(await bot.disable(bearer(req)))));

app.post('/api/twitch/start',route((req,res)=>{
  if(appOrigin(req)!==twitchOrigin)throw new Error('Abrí el panel seguro para conectar Twitch');
  // Without a session this is a Twitch-first login; with one it links the provider to the existing account.
  const sessionToken=bearer(req)||undefined;
  if(sessionToken)points.me(sessionToken);
  const result=twitchAuth.start(sessionToken);res.cookie(cookieName,result.cookie,cookieOptions);res.cookie('twitch_destination',req.body?.streamerOnboarding===true?'onboarding':'dashboard',cookieOptions);res.json({url:result.url});
}));
app.get('/auth/twitch/callback',async(req,res)=>{
  if(appOrigin(req)!==twitchOrigin){res.status(400).send('Origen de conexión inválido');return;}
  const onboarding=req.get('cookie')?.split(';').some(v=>v.trim()==='twitch_destination=onboarding');res.clearCookie('twitch_destination',{...cookieOptions,maxAge:undefined});
  try{
    const state=typeof req.query.state==='string'?req.query.state:'';
    const ticket=await twitchAuth.callback(state,linkCookie(req),typeof req.query.code==='string'?req.query.code:undefined,!!req.query.error);
    res.redirect(onboarding?`/onboarding?streamer=1&twitch_ticket=${encodeURIComponent(ticket)}`:`/app?twitch_ticket=${encodeURIComponent(ticket)}#streamer`);
  }catch{
    res.clearCookie(cookieName,{...cookieOptions,maxAge:undefined});const error=req.query.error==='access_denied'?'canceled':'failed';res.redirect(onboarding?`/onboarding?streamer=1&twitch_error=${error}`:`/app?twitch_error=${error}#streamer`);
  }
});
app.post('/api/twitch/complete',route(async(req,res)=>{
  const {ticket}=z.object({ticket:z.string().regex(/^[a-f0-9]{64}$/)}).parse(req.body);
  // Login completions carry no session token; link completions must match the session that started the flow.
  const result=await twitchAuth.complete(bearer(req)||undefined,ticket,linkCookie(req));res.clearCookie(cookieName,{...cookieOptions,maxAge:undefined});res.json(result);
}));
app.post('/api/twitch/disconnect',route(async(req,res)=>res.json(await points.unlinkTwitch(bearer(req)))));
app.get('/api/auth/config',(req,res)=>res.json({origin:process.env.AUTH_ORIGIN??appOrigin(req)}));
app.post('/api/auth/extension/start',route((req,res)=>{
  const i=z.object({extensionId:z.string().regex(/^[a-p]{32}$/),state:z.string().regex(/^[a-f0-9]{64}$/)}).parse(req.body);
  res.json(auth.start(i.extensionId,i.state,bearer(req)||undefined,appOrigin(req)));
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
app.post('/api/auth/extension/authorize',route((req,res)=>{
  if(req.get('sec-fetch-site')!=='same-origin'||req.get('origin')!==appOrigin(req))throw new Error('Vinculá la cuenta desde el mismo panel');
  const i=z.object({flowId:z.string().regex(/^[a-f0-9]{64}$/)}).parse(req.body);
  res.json(auth.authorize(i.flowId,bearer(req),appOrigin(req)));
}));
app.post('/api/auth/extension/complete',route(async(req,res)=>{
  const i=z.object({flowId:z.string().regex(/^[a-f0-9]{64}$/),state:z.string().regex(/^[a-f0-9]{64}$/),code:z.string().regex(/^[a-f0-9]{64}$/),extensionId:z.string().regex(/^[a-p]{32}$/)}).parse(req.body);
  if(req.get('origin')&&req.get('origin')!==`chrome-extension://${i.extensionId}`)throw new Error('Origen de extensión inválido');
  res.json({...await auth.complete(i.flowId,i.state,i.code,i.extensionId),bridgeToken:token});
}));
app.post('/api/points/session',(_req,res)=>res.status(410).json({error:'Conectá Phantom para iniciar sesión'}));
app.get('/api/points/me',route((req,res)=>res.json(points.me(bearer(req)))));
app.get('/api/streamer/console',route((req,res)=>res.json(points.streamerConsole(bearer(req)))));
app.post('/api/streamer/preview',route((req,res)=>{
  const i=z.object({key:z.string().max(300),winnerId:z.string().max(128).nullable()}).parse(req.body);
  res.json(points.previewSettlement(bearer(req),i.key,i.winnerId));
}));
app.post('/api/streamer/action',route(async(req,res)=>{
  const i=z.object({key:z.string().max(300),action:z.enum(['lock','resolve','cancel','distribute']),winnerId:z.string().max(128).optional(),requestId:z.string().uuid()}).parse(req.body);
  res.json(await points.streamerAction(bearer(req),i));
}));
const betInput=z.object({key:z.string().min(1).max(300),outcomeId:z.string().min(1).max(128),amount:z.number().int().positive().max(1_000_000),requestId:z.string().uuid()});
app.post('/api/points/bet',route(async(req,res)=>{const i=betInput.parse(req.body);res.json(await points.bet(bearer(req),i.key,i.outcomeId,i.amount,i.requestId));}));
const claimInput=z.object({key:z.string().min(1).max(300),requestId:z.string().uuid()});
app.post('/api/points/claim',route(async(req,res)=>{const i=claimInput.parse(req.body);res.json(await points.claim(bearer(req),i.key,i.requestId));}));
const extensionManifest=JSON.parse(await readFile(`${root}/extension/manifest.json`,'utf8'));
const extensionId=[...createHash('sha256').update(Buffer.from(extensionManifest.key,'base64')).digest('hex').slice(0,32)].map(c=>String.fromCharCode(97+parseInt(c,16))).join('');
app.use('/api/byte',byteRouter(byte,points,token,process.env,extensionId,byteMirror));
app.use('/api',(req,res,next)=>{const given=Buffer.from(bearer(req));const expected=Buffer.from(token);if(given.length!==expected.length||!timingSafeEqual(given,expected)){res.status(401).json({error:'Bridge pairing required'});return;}next();});
app.post('/api/operator/streamers',route(async(req,res)=>{
  if(req.get('sec-fetch-site')!=='same-origin'||req.get('origin')!==appOrigin(req))throw new Error('La asignación se hace desde el panel del operador local');
  const i=z.object({channel:z.string().regex(/^[a-zA-Z0-9_]{1,40}$/),wallet:z.string().min(32).max(44)}).parse(req.body);
  res.json(await points.assignStreamer(i.channel,i.wallet));
}));
app.post('/api/predictions',route(async(req,res)=>{
  const input=predictionSchema.parse(req.body);
  // The consumer cannot choose a live result or inject an arbitrary prediction.
  const verified=await source.prediction(input.id,input.channel);
  const market=await points.accept(verified);await points.watch(verified.channel);res.status(202).json(market);
}));
app.post('/api/channels',route(async(req,res)=>{const channel=z.string().regex(/^[a-zA-Z0-9_]{1,40}$/).parse(req.body.channel);await source.watch(channel);res.json({channels:points.channels(),details:source.channels(),sourceError:source.lastError});}));
app.delete('/api/channels/:channel',route(async(req,res)=>res.json({channels:await points.unwatch(String(req.params.channel))})));
app.post('/api/demo',route(async(_req,res)=>res.status(201).json(await points.accept(demoPrediction(),true))));
app.post('/api/demo/resolve',route(async(req,res)=>{const input=z.object({key:z.string().max(300),winnerId:z.string().max(128).nullable()}).parse(req.body);res.json(await points.demoResolve(input.key,input.winnerId));}));
app.post('/api/sync',route(async(_req,res)=>{await source.sync();res.json({ok:true,sourceError:source.lastError});}));
app.get('/onboarding',(req,res)=>{if(process.env.AUTH_ORIGIN&&appOrigin(req)!==process.env.AUTH_ORIGIN){res.redirect(`${process.env.AUTH_ORIGIN}${req.originalUrl}`);return;}res.sendFile('onboarding.html',{root:`${root}/public`});});
// Public streamer pages: the bot, QR codes and search all target /s/twitch/:login.
app.get(['/s/:platform/:login','/join/:platform/:login','/overlay/:platform/:login'],(_req,res)=>{
  res.sendFile('streamer.html',{root:`${root}/public`});
});
// Named .localhost hosts need HTTPS for Phantom's injected provider.
app.get(['/app', '/app.html', '/byte'],(req,res,next)=>{
  const origin=process.env.AUTH_ORIGIN;
  if(process.env.MARKET_MODE==='byte'&&origin?.startsWith('https://')&&appOrigin(req)!==origin){res.redirect(`${origin}${req.originalUrl}`);return;}
  next();
});
// Native form POSTs need the same-origin referrer policy to retain their Origin.
app.get(['/','/landing','/landing.html'],(_req,res)=>{res.set('Referrer-Policy','same-origin');res.sendFile('landing.html',{root:`${root}/public`});});
app.get('/byte',(_req,res)=>res.sendFile('byte.html',{root:`${root}/public`}));
app.get(['/app','/app.html'],(_req,res)=>res.sendFile(process.env.MARKET_MODE==='byte'?'byte.html':'index.html',{root:`${root}/public`}));
app.use(express.static(`${root}/public`));
app.use('/extension',express.static(`${root}/extension`));
const server=app.listen(Number(process.env.PORT??3000),'127.0.0.1',async()=>{
  console.log('Prediction Mirror ready (centralized offchain points).');
  const port=(server.address() as {port:number}).port;
  await writeFile(`${directory}/runtime-port`,String(port),{mode:0o600});
  if(process.env.AUTH_PROXY_STATE_DIR)try{await promisify(execFile)('portless',['alias',process.env.AUTH_PROXY_NAME??'twitch-predict',String(port),'--force'],{env:{...process.env,PORTLESS_STATE_DIR:process.env.AUTH_PROXY_STATE_DIR,PORTLESS_PORT:'1357',PORTLESS_HTTPS:'1'}});}catch(e){console.error('Could not refresh auth HTTPS alias:',(e as Error).message);}
});
const sync=async()=>{await source.sync();await byteMirror.sync();};
let syncingBot=false;
const botTimer=setInterval(()=>{if(syncingBot)return;syncingBot=true;void bot.sync(channel=>byteMirror.snapshot(channel)).catch(()=>console.error('Twitch bot sync failed')).finally(()=>{syncingBot=false;});},5000);botTimer.unref();
const timer=setInterval(()=>{void sync().catch(e=>console.error('Twitch sync failed:',(e as Error).message));},5000);timer.unref();
void sync().catch(e=>console.error('Initial Twitch sync failed:',(e as Error).message));
process.on('SIGTERM',()=>{clearInterval(timer);clearInterval(botTimer);server.close();});
