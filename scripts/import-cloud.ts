import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {Documents} from '../src/cloud/documents.js';
import {createByteMarketSchema,marketId} from '../src/byte-model.js';
import {predictionSchema} from '../src/prediction.js';
const directory=process.env.IMPORT_DIRECTORY;if(!directory)throw new Error('IMPORT_DIRECTORY required');
const channel=z.string().regex(/^[a-z0-9_]{1,40}$/),record=z.record(z.string(),z.unknown());
const schemas={
 points:z.looseObject({version:z.literal(1),accounts:record,markets:record,bets:z.array(z.unknown()),receipts:record,ledger:z.array(z.unknown()),channels:z.array(channel),sessions:record,streamers:record}),
 byte:z.object({version:z.literal(1),notes:z.record(marketId,z.looseObject({channel,rules:z.string(),createdAt:z.iso.datetime()})),operations:z.record(z.uuid(),z.looseObject({input:createByteMarketSchema,state:z.enum(['pending','complete','rejected']),marketId:marketId.optional()}))}),
 'byte-twitch':z.object({version:z.literal(1),channels:z.array(channel),mirrors:z.record(z.string(),z.looseObject({prediction:predictionSchema,outcomeIds:z.array(z.string()),input:createByteMarketSchema.optional(),marketId:marketId.optional(),phase:z.enum(['pending','created','skipped','failed','resolved'])}))})
};
const state:Record<string,unknown>={};
for(const [name,schema] of Object.entries(schemas))state[name]=schema.parse(JSON.parse(await readFile(resolve(directory,name+'.json'),'utf8')));
const points=state.points as z.infer<typeof schemas.points>;
for(const [id,raw] of Object.entries(points.accounts)){const a=z.object({id:z.string(),balance:z.number().int().nonnegative(),wallet:z.string().optional()}).parse(raw);if(a.id!==id)throw new Error('Account identity mismatch');}
// This import targets the Byte deployment; never mix in the separate points/demo database.
if(Object.keys(points.markets).length||points.bets.length||Object.keys(points.receipts).length)throw new Error('Points markets/bets require a separate reconciliation; refusing a mixed demo import');
const fingerprint=createHash('sha256').update(JSON.stringify(state)).digest('hex');
const summary={accounts:Object.keys(points.accounts).length,sessions:Object.keys(points.sessions).length,notes:Object.keys((state.byte as z.infer<typeof schemas.byte>).notes).length,channels:(state['byte-twitch'] as z.infer<typeof schemas['byte-twitch']>).channels.length,pending:Object.values((state.byte as z.infer<typeof schemas.byte>).operations).filter(o=>o.state==='pending').length,fingerprint};
console.log(JSON.stringify({dryRun:process.env.IMPORT_APPLY!=='1',...summary}));
if(process.env.IMPORT_APPLY==='1'){
 const docs=new Documents(process.env.PLOT_STAGING_DATABASE_URL!,process.env.PLOT_NAMESPACE??'plot-staging');
 try{
  await docs.migrate();await docs.update('migration',()=>({fingerprint:''}),async receipt=>{
   if(receipt.fingerprint===fingerprint)return;
   if(receipt.fingerprint)throw new Error('A different import already exists');
   const heartbeat=await docs.heartbeat();if(heartbeat?.active)throw new Error('Stop the cloud worker before importing');
   for(const [name,value] of Object.entries(state))await docs.update(name,()=>({}),current=>{
    const occupied=Object.entries(current).some(([k,v])=>!['version','channels'].includes(k)&&v&&typeof v==='object'&&Object.keys(v).length);
    if(occupied)throw new Error('Target aggregate is not empty: '+name);
    Object.assign(current,value);
   });receipt.fingerprint=fingerprint;
  });console.log('Import committed atomically');
 }finally{await docs.close();}
}
