import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LocalDocuments} from '../src/local-documents.js';

test('local bot storage serializes updates, persists and discards failed mutations',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'plot-local-bot-'));
 try{
  const store=new LocalDocuments(directory),initial=()=>({count:0});
  await Promise.all(Array.from({length:20},()=>store.update('twitch-bot-runtime',initial,s=>{s.count++;})));
  await assert.rejects(store.update('twitch-bot-runtime',initial,s=>{s.count=99;throw new Error('rollback');}),/rollback/);
  assert.equal((await new LocalDocuments(directory).read('twitch-bot-runtime',initial)).count,20);
  await assert.rejects(store.read('../points',initial),/Invalid/);
 }finally{await rm(directory,{recursive:true,force:true});}
});
