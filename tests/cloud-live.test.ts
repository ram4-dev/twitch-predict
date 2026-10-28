import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {AddressInfo} from 'node:net';
import {Documents} from '../src/cloud/documents.js';
import {cloudApp} from '../src/cloud/app.js';
const database=process.env.PLOT_STAGING_DATABASE_URL;

test('SSE forwards committed market invalidations across database clients, isolated by namespace', {skip:!database}, async()=>{
 const namespace=`test-live-${randomUUID()}`,docs=new Documents(database!,namespace),writer=new Documents(database!,namespace),other=new Documents(database!,`${namespace}-other`);
 await docs.migrate();
 const app=cloudApp(docs,{AUTH_ORIGIN:'https://plot.example',DATABASE_URL:database,PLOT_NAMESPACE:namespace});
 const server=app.listen(0,'127.0.0.1');
 await new Promise<void>(resolve=>server.once('listening',resolve));
 const abort=new AbortController();
 try{
  const response=await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/live/markets`,{signal:abort.signal});
  assert.equal(response.status,200);assert.match(response.headers.get('content-type')??'',/text\/event-stream/);
  const reader=response.body!.getReader(),decoder=new TextDecoder();let buffer='';
  const readEvent=async(name:string)=>{while(!buffer.includes(`event: ${name}\n`)){const r=await reader.read();if(r.done)throw new Error('stream closed');buffer+=decoder.decode(r.value,{stream:true});}const end=buffer.indexOf('\n\n',buffer.indexOf(`event: ${name}\n`));const event=buffer.slice(0,end+2);buffer=buffer.slice(end+2);return event;};
  await readEvent('ready');
  await other.update('byte',()=>({n:0}),s=>{s.n++;});
  await writer.update('byte',()=>({n:0}),s=>{s.n++;});
  const event=await Promise.race([readEvent('markets'),new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('no market event')),3000))]);
  assert.match(event,/event: markets\ndata: \{\}/);assert.ok(!event.includes(namespace));
  await writer.update('byte',()=>({n:0}),()=>{});
  const next=readEvent('markets');let emitted=false;void next.then(()=>{emitted=true;}).catch(()=>{});
  await new Promise(resolve=>setTimeout(resolve,150));assert.equal(emitted,false,'unchanged state must not emit');
  await writer.notifyMarketChange();await next;app.locals.liveMarkets.close();assert.equal((await reader.read()).done,true);
 }finally{abort.abort();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await docs.pool.query('DELETE FROM plot_private.documents WHERE namespace=$1 OR namespace=$2',[namespace,`${namespace}-other`]);await Promise.all([docs.close(),writer.close(),other.close()]);}
});
