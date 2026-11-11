import {PointsSessionError} from '../points-identity.js';
import {LiveMarkets} from './live.js';
import {Waitlist} from '../waitlist.js';
import {TwitchChannelSearch} from '../twitch-search.js';
import express from 'express';
import {z} from 'zod';
import {Points} from '../points.js';
import {ByteService} from '../byte.js';
import {byteRouter} from '../byte-router.js';
import {ByteTwitchMirror} from '../byte-twitch.js';
import {TwitchSource} from '../twitch-source.js';
import {twitchChannel} from '../mobile-model.js';
import {Documents} from './documents.js';
import {CloudAuth} from './auth.js';
import {CloudTwitchAuth} from './twitch-auth.js';
import {CloudTwitchBot} from './twitch-bot.js';
import {proposalsRouter, type ProposalActorResolver} from '../proposals-router.js';
import {ProposalService} from '../proposals-service.js';
import {cloudConfig} from './config.js';
export function cloudApp(documents:Documents,env:NodeJS.ProcessEnv=process.env){
 const config=cloudConfig(env),app=express(),channelSearch=new TwitchChannelSearch();app.disable('x-powered-by');app.set('trust proxy',false);
 const bot=new CloudTwitchBot(documents,{clientId:env.TWITCH_CLIENT_ID??'',clientSecret:env.TWITCH_CLIENT_SECRET??'',origin:config.origin});
 // Plan 2 mount: the bot derives viewer !plot crear to the proposal service (same aggregate + Documents).
 // accountForTwitch is a read-only lookup resolved BEFORE any documents.update (no nested runtime updates).
 bot.mountProposals({
  submit:async args=>{
   const p=new Points('',documents);await p.load();
   const proposal=await new ProposalService(p).submit(args);
   return {id:proposal.id,shortId:proposal.shortId,text:`Propuesta ${proposal.shortId} enviada al streamer; pendiente de aprobación.`};
  },
  accountForTwitch:async twitchId=>{const p=new Points('',documents);await p.load();return p.accountForTwitch(twitchId);},
 });
 const liveMarkets=new LiveMarkets(documents);app.locals.liveMarkets=liveMarkets;
 const extensionOrigins=new Set(config.extensionIds.map(id=>`chrome-extension://${id}`));
 const extensionIdSchema=z.string().refine(id=>config.extensionIds.includes(id));
 app.use((req,res,next)=>{
  res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
  const origin=req.get('origin');
  if(origin&&origin!==config.origin&&!extensionOrigins.has(origin??'')){res.status(403).json({error:'Origen no autorizado'});return;}
  // Native clients have no Origin. A foreign browser cannot send state-changing requests or read responses.
  if(req.get('sec-fetch-site')==='cross-site'&&!extensionOrigins.has(origin??'')&&!['/auth/twitch/callback','/auth/twitch/bot/callback'].includes(req.path)){res.status(403).json({error:'Sitio no autorizado'});return;}
  if(origin){res.set('Access-Control-Allow-Origin',origin);res.vary('Origin');res.set('Access-Control-Allow-Headers','Authorization, Content-Type');res.set('Access-Control-Allow-Methods','GET, POST, OPTIONS');}
  if(req.method==='OPTIONS'){res.sendStatus(204);return;}next();
 });
 app.get('/api/live/markets',(_req,res)=>liveMarkets.subscribe(res));
 app.post('/api/twitch/bot/webhook',express.raw({type:'application/json',limit:'64kb'}),async(req,res)=>{
  try{if(!Buffer.isBuffer(req.body)){res.sendStatus(400);return;}const headers=Object.fromEntries(['id','timestamp','signature','type'].map(name=>{const key=`twitch-eventsub-message-${name}`;return [key,req.get(key)??''];}));const result=await bot.webhook(headers,req.body);res.status(result.status).type('text/plain').send(result.body);}catch{res.sendStatus(400);}
 });
 app.use(express.json({limit:'16kb'}));
 const bearer=(req:express.Request)=>req.get('authorization')?.replace(/^Bearer /,'')??'';
 const route=(fn:(req:express.Request,res:express.Response)=>Promise<unknown>|unknown)=>async(req:express.Request,res:express.Response)=>{
  try{await fn(req,res);}catch(error){res.status(error instanceof PointsSessionError?401:'code' in Object(error)?503:400).json({error:error instanceof z.ZodError?'Datos inválidos':'code' in Object(error)?'No se pudo completar la operación':(error as Error).message});}
 };
 const waitlist=new Waitlist('',documents);
 app.post('/api/waitlist',express.urlencoded({extended:false,limit:'2kb'}),async(req,res)=>{
  const native=req.is('application/x-www-form-urlencoded');
  try{
   if(!await documents.allowRequest('waitlist',120)){res.status(429).json({error:'Demasiadas inscripciones. Intentá de nuevo en un minuto.'});return;}
   await waitlist.join(req.body?.email);
   if(native){res.redirect(303,`${config.origin}/waitlist-success.html`);return;}
   res.json({ok:true});
  }catch(error){
   const status=error instanceof z.ZodError?400:503;
   if(native){res.redirect(303,`${config.origin}/waitlist-error.html`);return;}
   res.status(status).json({error:status===400?'Ingresá un email válido.':'No pudimos guardar tu email. Intentá de nuevo.'});
  }
 });
 app.get('/live',(_req,res)=>res.json({ok:true}));
 app.get('/api/health',route(async(_req,res)=>{await documents.pool.query('SELECT 1');const heartbeat=await documents.heartbeat(),source=await documents.read('worker-status',()=>({checkedAt:0,sourceError:null as string|null}));res.json({ok:true,service:'plot-mobile',marketMode:'byte',network:'devnet',protocol:'byte partner markets',features:['wallet-bet','automatic-payout'],worker:heartbeat?.active?'active':'idle',sourceError:source.sourceError??(source.checkedAt&&Date.now()-source.checkedAt>30000?'La verificación de Twitch necesita actualizarse.':null),sourceCheckedAt:source.checkedAt||null});}));
 // Every request gets a current read snapshot; all mutations lock/reload the authoritative SQL row.
 app.use(async(req,res,next)=>{
  try{
   if(!await documents.allowRequest('public',1200)){res.set('Retry-After','60').status(429).json({error:'Demasiadas consultas'});return;}
   if(req.path.startsWith('/api/auth/')&&!await documents.allowRequest('auth',120)){res.set('Retry-After','60').status(429).json({error:'Demasiados accesos pendientes'});return;}
   const points=new Points('',documents);await points.load();
   const byte=new ByteService('',env.BYTE_API_KEY??'',env.BYTE_BASE_URL||undefined,fetch,documents);await byte.load();
   const mirror=new ByteTwitchMirror('',byte,new TwitchSource(points),Date.now,documents);await mirror.load();
   // Plan 2: every request Points gets the authoritative moderator revalidator (fresh query, outside locks).
   points.moderatorRevalidator=channel=>bot.freshModerators(channel.id,channel.login);
   res.locals.context={points,byte,mirror,auth:new CloudAuth(points,documents),twitch:new CloudTwitchAuth(points,documents,{clientId:env.TWITCH_CLIENT_ID??'',clientSecret:env.TWITCH_CLIENT_SECRET??'',origin:config.origin})};next();
  }catch{res.status(503).json({error:'La base de Plot no está disponible'});}
 });
 const context=(res:express.Response)=>res.locals.context as {points:Points;byte:ByteService;mirror:ByteTwitchMirror;auth:CloudAuth;twitch:CloudTwitchAuth};
 app.get('/api/auth/config',(_req,res)=>res.json({origin:config.origin}));
 app.post('/api/auth/extension/start',route(async(req,res)=>{
  const i=z.object({extensionId:extensionIdSchema,state:z.string().regex(/^[a-f0-9]{64}$/)}).parse(req.body);
  if(req.get('origin')?.startsWith('chrome-extension://')&&req.get('origin')!==`chrome-extension://${i.extensionId}`)throw new Error('Origen de extensión inválido');
  res.json(await context(res).auth.start(i.extensionId,i.state,bearer(req)||undefined,config.origin));
 }));
 app.get('/api/auth/flow/:flowId',route(async(req,res)=>res.json(await context(res).auth.context(String(req.params.flowId)))));
 app.post('/api/auth/challenge',route(async(req,res)=>{const i=z.object({address:z.string().min(32).max(44),flowId:z.string().regex(/^[a-f0-9]{64}$/).optional()}).parse(req.body);res.json(await context(res).auth.challenge(i.address,config.origin,i.flowId,bearer(req)||undefined));}));
 app.post('/api/auth/verify',route(async(req,res)=>{const i=z.object({challengeId:z.string().regex(/^[a-f0-9]{64}$/),signature:z.string().max(128)}).parse(req.body);res.json(await context(res).auth.authenticate(i.challengeId,i.signature,config.origin));}));
 app.post('/api/auth/extension/authorize',route(async(req,res)=>{
  if(req.get('origin')!==config.origin)throw new Error('Vinculá la cuenta desde el panel');const i=z.object({flowId:z.string().regex(/^[a-f0-9]{64}$/)}).parse(req.body);res.json(await context(res).auth.authorize(i.flowId,bearer(req),config.origin));
 }));
 app.post('/api/auth/extension/complete',route(async(req,res)=>{
  const i=z.object({flowId:z.string().regex(/^[a-f0-9]{64}$/),state:z.string().regex(/^[a-f0-9]{64}$/),code:z.string().regex(/^[a-f0-9]{64}$/),extensionId:extensionIdSchema}).parse(req.body);
  if(req.get('origin')&&req.get('origin')!==`chrome-extension://${i.extensionId}`)throw new Error('Origen de extensión inválido');res.json(await context(res).auth.complete(i.flowId,i.state,i.code,i.extensionId));
 }));
 const cookieName='twitch_link',cookieOptions={httpOnly:true,secure:true,sameSite:'lax' as const,path:'/',maxAge:600000};
 const cookie=(req:express.Request)=>{const value=req.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName+'='))?.slice(cookieName.length+1)??'';return /^[a-f0-9]{64}$/.test(value)?value:'';};
 app.get('/api/twitch/search',async(req,res)=>{
   const query=typeof req.query.q==='string'?req.query.q:'';
   if(!/^[a-zA-Z0-9_]{2,40}$/.test(query)){res.status(400).json({error:'Ingresá al menos dos caracteres del usuario de Twitch.'});return;}
   try{res.json({channels:await channelSearch.search(query)});}catch{res.status(503).json({error:'No pudimos consultar Twitch. Probá de nuevo.'});}
  });
 app.get('/api/twitch/config',(_req,res)=>res.json({configured:context(res).twitch.configured,origin:config.origin}));
 const botCookieName='twitch_bot';
 const botCookie=(req:express.Request)=>req.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(botCookieName+'='))?.slice(botCookieName.length+1)??'';
 app.get('/api/twitch/bot/status',route(async(req,res)=>res.json(await bot.status(bearer(req)||undefined))));
 app.post('/api/twitch/bot/start',route(async(req,res)=>{
  if(req.get('origin')!==config.origin)throw new Error('Abrí la plataforma para agregar el bot');
  if(!await documents.allowRequest('bot-auth',60)){res.status(429).json({error:'Demasiadas conexiones pendientes'});return;}
  const result=await bot.start('channel',bearer(req));res.cookie(botCookieName,result.cookie,cookieOptions).json({url:result.url});
 }));
 app.post('/api/twitch/bot/account/start',route(async(req,res)=>{
  if(req.get('origin')!==config.origin)throw new Error('Abrí la plataforma para autorizar plotfun');
  if(!await documents.allowRequest('bot-auth',60)){res.status(429).json({error:'Demasiadas conexiones pendientes'});return;}
  const result=await bot.start('account');res.cookie(botCookieName,result.cookie,cookieOptions).json({url:result.url});
 }));
 app.get('/auth/twitch/bot/callback',async(req,res)=>{
  try{const result=await bot.callback(typeof req.query.state==='string'?req.query.state:'',botCookie(req),typeof req.query.code==='string'?req.query.code:'',!!req.query.error);
   if(result.kind==='account'){res.clearCookie(botCookieName,{...cookieOptions,maxAge:undefined}).redirect(`${config.origin}/bot-setup.html?connected=1`);return;}
   res.redirect(`${config.origin}/onboarding?streamer=1&bot_ticket=${encodeURIComponent(result.ticket)}`);
  }catch{res.clearCookie(botCookieName,{...cookieOptions,maxAge:undefined}).redirect(`${config.origin}/onboarding?streamer=1&bot_error=failed`);}
 });
 app.post('/api/twitch/bot/complete',route(async(req,res)=>{const {ticket}=z.object({ticket:z.string().regex(/^[a-f0-9]{64}$/)}).parse(req.body);const result=await bot.complete(bearer(req),ticket,botCookie(req));res.clearCookie(botCookieName,{...cookieOptions,maxAge:undefined}).json(result);}));
 app.post('/api/twitch/bot/disable',route(async(req,res)=>res.json(await bot.disable(bearer(req)))));
 app.post('/api/twitch/start',route(async(req,res)=>{if(req.get('origin')!==config.origin)throw new Error('Abrí el panel para conectar Twitch');const r=await context(res).twitch.start(bearer(req)||undefined);res.cookie(cookieName,r.cookie,cookieOptions);res.cookie('twitch_destination',req.body?.streamerOnboarding===true?'onboarding':'dashboard',cookieOptions);res.json({url:r.url});}));
 app.get('/auth/twitch/callback',async(req,res)=>{
  const onboarding=req.get('cookie')?.split(';').some(v=>v.trim()==='twitch_destination=onboarding');res.clearCookie('twitch_destination',{...cookieOptions,maxAge:undefined});
  try{const ticket=await context(res).twitch.callback(typeof req.query.state==='string'?req.query.state:'',cookie(req),typeof req.query.code==='string'?req.query.code:undefined,!!req.query.error);res.redirect(onboarding?`${config.origin}/onboarding?streamer=1&twitch_ticket=${encodeURIComponent(ticket)}`:`${config.origin}/app?twitch_ticket=${encodeURIComponent(ticket)}#streamer`);}
  catch{res.clearCookie(cookieName,{...cookieOptions,maxAge:undefined}).redirect(`${config.origin}/app?twitch_error=${req.query.error==='access_denied'?'canceled':'failed'}#streamer`);}
 });
 app.post('/api/twitch/complete',route(async(req,res)=>{const i=z.object({ticket:z.string().regex(/^[a-f0-9]{64}$/)}).parse(req.body);const r=await context(res).twitch.complete(bearer(req)||undefined,i.ticket,cookie(req));res.clearCookie(cookieName,{...cookieOptions,maxAge:undefined}).json(r);}));
 app.post('/api/twitch/disconnect',route(async(req,res)=>res.json(await context(res).points.unlinkTwitch(bearer(req)))));
 app.get('/api/points/me',route((req,res)=>res.json(context(res).points.me(bearer(req)))));
 // Plan 2: proposals API over the per-request Points context; identity and owner evidence stay server-side.
 const proposalResolver:ProposalActorResolver={
  actor:async (req,res)=>{try{const me=context(res).points.me(bearer(req));return {accountId:me.id,twitchId:me.twitch?.id};}catch{return null;}},
  channel:async (req,res,channelId)=>{
   if(!/^[a-zA-Z0-9_]{1,40}$/.test(channelId))return null;
   // SAFETY: exportStateJson is this app's own valid JSON; a corrupt read fails closed to null.
   let snapshot:{streamers:Record<string,{channel:string;twitchId?:string}>};
   try{snapshot=JSON.parse(context(res).points.exportStateJson()) as {streamers:Record<string,{channel:string;twitchId?:string}>};}catch{return null;}
   const byTwitchId=Object.values(snapshot.streamers??{}).find(st=>st.twitchId===channelId);
   if(byTwitchId)return {id:channelId,login:byTwitchId.channel};
   const byLogin=Object.values(snapshot.streamers??{}).find(st=>st.channel===channelId.toLowerCase());
   return byLogin?.twitchId?{id:byLogin.twitchId,login:byLogin.channel}:null;
  },
  isChannelOwner:async (_req,_res,actor,channelId)=>actor.twitchId===channelId,
 };
 app.use('/api/proposals',(req,res,next)=>{proposalsRouter({service:new ProposalService(context(res).points),resolver:proposalResolver})(req,res,next);});
 app.get('/api/streamer/console',route((req,res)=>res.json(context(res).points.streamerConsole(bearer(req)))));
 app.get('/api/markets',(_req,res)=>res.json(context(res).points.markets()));
 app.get('/api/channels',(_req,res)=>res.json({channels:context(res).points.channels(),details:[],sourceError:null}));
 app.post('/api/points/session',(_req,res)=>res.status(410).json({error:'Iniciá sesión con Twitch o Phantom'}));
 app.get('/api/mobile/channels/:channel',route(async(req,res)=>{
  const channel=twitchChannel(String(req.params.channel)),markets=(await context(res).byte.list()).filter(m=>m.notes?.channel===channel&&m.status==='open'&&m.currency==='sol'&&m.bettable&&m.closeMs>Date.now());res.json({channel,markets,checkedAt:Date.now()});
 }));
 app.post('/api/byte/twitch/watch',route(async(req,res)=>{
  const i=z.object({channel:z.string().regex(/^[a-zA-Z0-9_]{1,40}$/).transform(v=>v.toLowerCase())}).parse(req.body);
  context(res).points.me(bearer(req));
  // Do not enqueue nonexistent Twitch accounts: a bad channel otherwise poisons every worker cycle.
  if(!context(res).mirror.channels().includes(i.channel))await new TwitchSource(context(res).points).active(i.channel);
  await documents.update('byte-twitch',()=>({version:1,channels:[] as string[],mirrors:{}}),s=>{if(!s.channels.includes(i.channel))s.channels.push(i.channel);});
  res.json({channel:i.channel,predictions:context(res).mirror.snapshot(i.channel)});
 }));
 app.use('/api/byte',(req,res,next)=>{const {byte,points,mirror}=context(res);return byteRouter(byte,points,'',config.environment,config.extensionId,mirror)(req,res,next);});
 app.use((_req,res)=>res.status(404).json({error:'Ruta no disponible'}));
 app.use((_error:Error,_req:express.Request,res:express.Response,_next:express.NextFunction)=>res.status(400).json({error:'Solicitud inválida'}));
 return app;
}
