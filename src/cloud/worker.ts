import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {Points} from '../points.js';
import {ByteService} from '../byte.js';
import {ByteTwitchMirror} from '../byte-twitch.js';
import {TwitchSource} from '../twitch-source.js';
import {cloudConfig} from './config.js';
import {Documents} from './documents.js';
import {CloudTwitchBot} from './twitch-bot.js';
import {HelixPredictionSource,ensurePredictionSubscriptions} from './plot/twitch-adapter.js';
import {TwitchProjection,reconcileTwitchMarkets} from './plot/twitch.js';
import {createPlotRuntimeFromEnv} from './plot/runtime.js';
const config=cloudConfig(),documents=new Documents(config.database,config.namespace),owner=randomUUID();
await documents.migrate();
const plotRuntime=process.env.PLOT_ONCHAIN_WORKER_ENABLED==='true'?await createPlotRuntimeFromEnv(documents,process.env).catch(()=>{console.error('PLOT test runtime configuration or RPC unavailable');process.exit(1);}):null;
if(process.env.PLOT_ONCHAIN_WORKER_ENABLED==='true'&&!plotRuntime)throw new Error('PLOT_ONCHAIN_ENABLED required for worker');
const bot=new CloudTwitchBot(documents,{clientId:process.env.TWITCH_CLIENT_ID??'',clientSecret:process.env.TWITCH_CLIENT_SECRET??'',origin:config.origin});
let stopping=false,lost=false,lastPlotSubscriptionCheck=0;
process.on('SIGTERM',()=>{stopping=true;});process.on('SIGINT',()=>{stopping=true;});
// Chat has its own lease and cadence, so a slow prediction source cannot delay replies.
const chatLoop=(async()=>{
 while(!stopping){
  let lostChat=false;
  try{if(await documents.lease('twitch-chat-worker',owner,30)){
   const renew=setInterval(()=>{void documents.lease('twitch-chat-worker',owner,30).then(ok=>{if(!ok)lostChat=true;}).catch(()=>{lostChat=true;});},8000);
   try{await documents.withLease('twitch-chat-worker',owner,async()=>{
    const points=new Points('',documents);await points.load();
    const byte=new ByteService('',process.env.BYTE_API_KEY??'',process.env.BYTE_BASE_URL||undefined,fetch,documents);await byte.load();
    const mirror=new ByteTwitchMirror('',byte,new TwitchSource(points),Date.now,documents);await mirror.load();
    await bot.sync(channel=>mirror.snapshot(channel),()=>!lostChat&&!stopping);
   });}finally{clearInterval(renew);}
  }}catch{console.error('Twitch bot cycle failed; next cycle will retry');}
  if(!stopping)await delay(5000);
 }
 await documents.release('twitch-chat-worker',owner).catch(()=>{});
})();
while(!stopping){
 try{
  if(!await documents.lease('twitch-worker',owner,30)){await delay(5000);continue;}
  lost=false;
  // Renew independently of slow upstream requests; every SQL mutation also verifies and locks ownership.
  const renew=setInterval(()=>{void documents.lease('twitch-worker',owner,30).then(ok=>{if(!ok)lost=true;}).catch(()=>{lost=true;});},8000);
  try{
   await documents.withLease('twitch-worker',owner,async()=>{
    const points=new Points('',documents);await points.load();
    const byte=new ByteService('',process.env.BYTE_API_KEY??'',process.env.BYTE_BASE_URL||undefined,fetch,documents);await byte.load();
    const source=new TwitchSource(points);
    const mirror=new ByteTwitchMirror('',byte,source,Date.now,documents);await mirror.load();
    if(process.env.PLOT_ONCHAIN_TWITCH_ENABLED==='true'&&!lost&&!stopping){
     try{if(process.env.PLOT_TWITCH_EVENTSUB_REGISTER==='true'&&Date.now()-lastPlotSubscriptionCheck>=300000){await ensurePredictionSubscriptions({clientId:process.env.TWITCH_CLIENT_ID??'',clientSecret:process.env.TWITCH_CLIENT_SECRET??'',userToken:process.env.PLOT_TWITCH_USER_TOKEN??'',secret:process.env.PLOT_TWITCH_EVENTSUB_SECRET??'',callback:`${config.origin}/api/plot/v1/twitch/eventsub`});lastPlotSubscriptionCheck=Date.now();}
     const projection=new TwitchProjection(documents.pool,documents.namespace);
     const source=new HelixPredictionSource(documents.pool,documents.namespace,process.env.TWITCH_CLIENT_ID??'',process.env.PLOT_TWITCH_USER_TOKEN??'');
     for(const event of await source.poll()){if(lost||stopping)break;await projection.ingest(event);}
     }catch{console.error('PLOT Twitch reconciliation unavailable; retrying');}
    }
    if(plotRuntime&&!lost&&!stopping)try{await reconcileTwitchMarkets(documents.pool,documents.namespace,plotRuntime.chain);}catch{console.error('PLOT chain reconciliation unavailable; attempt retained');}
    // Configured channels seed the list; authenticated viewers can enqueue any valid channel.
    await documents.update('byte-twitch',()=>({version:1,channels:[] as string[],mirrors:{}}),s=>{s.channels=[...new Set([...s.channels,...config.channels])];});
    if(!lost&&!stopping){if(process.env.POINTS_PAYMENTS_ENABLED==='true'){for(const channel of config.channels)if(!points.channels().includes(channel))await points.watch(channel);await source.sync();}else await mirror.sync();}
    if(lost)throw new Error('Worker lease lost');
    const sourceError=process.env.POINTS_PAYMENTS_ENABLED==='true'?source.lastError:mirror.lastError;
    await documents.update('worker-status',()=>({checkedAt:0,sourceError:null as string|null}),state=>{state.checkedAt=Date.now();state.sourceError=sourceError?'No se pudo verificar Twitch; las predicciones vencidas quedan bloqueadas.':null;});
    if(sourceError)console.error('Twitch source unavailable; stale markets remain blocked');
   });
  }finally{clearInterval(renew);}
 }catch{console.error('Worker cycle failed; durable reservations retained');}
 if(!stopping)await delay(5000);
}
await chatLoop;await documents.release('twitch-worker',owner).catch(()=>{});await Promise.all([documents.close(),plotRuntime?.close()]);
