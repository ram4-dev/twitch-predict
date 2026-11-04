import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {Points} from '../points.js';
import {ByteService} from '../byte.js';
import {ByteTwitchMirror} from '../byte-twitch.js';
import {TwitchSource} from '../twitch-source.js';
import {cloudConfig} from './config.js';
import {Documents} from './documents.js';
import {CloudTwitchBot} from './twitch-bot.js';
const config=cloudConfig(),documents=new Documents(config.database,config.namespace),owner=randomUUID();
await documents.migrate();
const bot=new CloudTwitchBot(documents,{clientId:process.env.TWITCH_CLIENT_ID??'',clientSecret:process.env.TWITCH_CLIENT_SECRET??'',origin:config.origin});
let stopping=false,lost=false;
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
    const mirror=new ByteTwitchMirror('',byte,new TwitchSource(points),Date.now,documents);await mirror.load();
    // Configured channels seed the list; authenticated viewers can enqueue any valid channel.
    await documents.update('byte-twitch',()=>({version:1,channels:[] as string[],mirrors:{}}),s=>{s.channels=[...new Set([...s.channels,...config.channels])];});
    if(!lost&&!stopping)await mirror.sync();
    if(lost)throw new Error('Worker lease lost');
    await documents.update('worker-status',()=>({checkedAt:0,sourceError:null as string|null}),state=>{state.checkedAt=Date.now();state.sourceError=mirror.lastError?'No se pudo verificar Twitch; las predicciones vencidas quedan bloqueadas.':null;});
    if(mirror.lastError)console.error('Twitch source unavailable; stale markets remain blocked');
   });
  }finally{clearInterval(renew);}
 }catch{console.error('Worker cycle failed; durable reservations retained');}
 if(!stopping)await delay(5000);
}
await chatLoop;await documents.release('twitch-worker',owner).catch(()=>{});await documents.close();
