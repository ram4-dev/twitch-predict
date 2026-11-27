import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {PlotPurchaseClient} from '../mobile/src/lib/plot-purchase-client.js';
test('purchase preserves key across a lost response and pending chain confirmation',async()=>{
 const m=new Map<string,string>(),store={async getItem(k:string){return m.get(k)??null;},async setItem(k:string,v:string){m.set(k,v);}};const keys:string[]=[];let attempts=0,finalized=false;
 const transport={async request(path:string,init:RequestInit){if(path.endsWith('/orders')){keys.push(JSON.parse(String(init.body)).idempotencyKey);if(++attempts===1)throw Error('lost');return {};}if(path.endsWith('/reconcile'))return {finalized,wallet:'w',amount:'600'};return {};}};
 const a=new PlotPurchaseClient(store,transport,'fixture','w');await assert.rejects(()=>a.start('key','small'));const b=new PlotPurchaseClient(store,transport,'fixture','w');await b.resume();await assert.rejects(()=>b.start('other','small'));await b.confirm();assert.equal((await b.reconcile()).stage,'submitted');finalized=true;assert.equal((await b.reconcile()).stage,'finalized');assert.deepEqual(keys,['key','key']);
});
