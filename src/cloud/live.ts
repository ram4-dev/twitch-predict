import type {Response} from 'express';
import type {PoolClient} from 'pg';
import type {Documents} from './documents.js';

/** Public invalidations only: clients re-fetch authorized state over the existing APIs. */
export class LiveMarkets {
 private clients=new Set<Response>();
 private listener?:PoolClient;
 private connecting=false;
 constructor(private readonly documents:Documents){}
 close(){for(const res of this.clients)res.end();this.stop();}
 subscribe(res:Response){
  if(this.clients.size>=100){res.status(503).set('Retry-After','5').end();return;}
  res.status(200).set({'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no','Connection':'keep-alive'});
  res.flushHeaders();res.write('retry: 5000\n: connected\n\n');this.clients.add(res);
  const heartbeat=setInterval(()=>{if(!res.destroyed)res.write(': heartbeat\n\n');},15000);heartbeat.unref();
  res.on('close',()=>{clearInterval(heartbeat);this.clients.delete(res);if(!this.clients.size)this.stop();});
  if(this.listener)res.write('event: ready\ndata: {}\n\n');else void this.start();
 }
 private async start(){
  if(this.connecting||this.listener||!this.clients.size)return;this.connecting=true;
  let client:PoolClient|undefined;
  try{
   client=await this.documents.pool.connect();
   if(!this.clients.size){client.release();return;}
   const active=client;
   active.on('notification',message=>{try{const event=JSON.parse(message.payload??'');if(event.namespace===this.documents.namespace&&['byte','byte-twitch'].includes(event.name))for(const res of this.clients)if(!res.write('event: markets\ndata: {}\n\n'))res.end();}catch{/* Ignore malformed external notifications. */}});
   active.on('error',()=>{if(this.listener===active){this.listener=undefined;active.release(true);for(const res of this.clients)res.end();}});
   await active.query('LISTEN plot_market_events');
   if(!this.clients.size){active.release(true);return;}
   this.listener=active;for(const res of this.clients)res.write('event: ready\ndata: {}\n\n');
  }catch{if(client&&client!==this.listener)client.release(true);for(const res of this.clients)res.end();}
  finally{this.connecting=false;}
 }
 private stop(){if(!this.listener)return;const client=this.listener;this.listener=undefined;client.release(true);}
}
