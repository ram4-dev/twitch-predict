import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {Points} from '../src/points.js';

test('only the owner of a linked Twitch identity can enable its bot, and unlink removes permission',async()=>{
 const dir=await mkdtemp(`${tmpdir()}/plot-bot-permissions-`);
 try{
  const points=new Points(dir);await points.load();const first=await points.walletLogin('wallet-a'),second=await points.walletLogin('wallet-b');
  await assert.rejects(points.setBotEnabled(first.token,true),/Vinculá/);
  await points.linkTwitch(first.token,{id:'123',login:'streamer',displayName:'Streamer',linkedAt:new Date().toISOString()});
  await assert.rejects(points.setBotEnabled(second.token,true),/Vinculá/);
  await points.setBotEnabled(first.token,true);assert.deepEqual(points.botChannels(),['streamer']);
  const restored=new Points(dir);await restored.load();assert.deepEqual(restored.botChannels(),['streamer']);
  await restored.unlinkTwitch(first.token);assert.deepEqual(restored.botChannels(),[]);
  await restored.linkTwitch(second.token,{id:'123',login:'streamer',displayName:'Streamer',linkedAt:new Date().toISOString()});assert.deepEqual(restored.botChannels(),[]);
 }finally{await rm(dir,{recursive:true,force:true});}
});
