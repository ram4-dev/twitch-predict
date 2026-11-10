import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CloudTwitchBot} from '../src/cloud/twitch-bot.js';
import {joinPath} from '../src/public-paths.js';

// Regression: origins may be resolved lazily (a function) so a server reached on another host does not
// advertise a stale redirect_uri. Every URL the bot prints or registers must be a real URL, never the
// source text of that function.
const noop=async()=>Response.json({});

function bot(origin:string|(()=>string)){
  const documents={read:async(_n:string,init:()=>unknown)=>init(),update:async(_n:string,_i:()=>unknown,work:(s:Record<string,unknown>)=>unknown)=>work({})};
  return new CloudTwitchBot(documents as never,{clientId:'c',clientSecret:'s',origin},noop as unknown as typeof fetch,()=>Date.now());
}

test('static origin produces real URLs',()=>{
  const b=bot('https://plot.example');
  assert.equal(b.callbackUrl,'https://plot.example/auth/twitch/bot/callback');
  assert.equal(b.webhookUrl,'https://plot.example/api/twitch/bot/webhook');
});

test('lazy origin produces real URLs and follows the resolved value',()=>{
  let current='https://first.example';
  const b=bot(()=>current);
  assert.equal(b.callbackUrl,'https://first.example/auth/twitch/bot/callback');
  assert.equal(b.webhookUrl,'https://first.example/api/twitch/bot/webhook');
  current='https://second.example:8444';
  assert.equal(b.callbackUrl,'https://second.example:8444/auth/twitch/bot/callback');
  assert.equal(b.webhookUrl,'https://second.example:8444/api/twitch/bot/webhook');
});

test('no bot URL ever contains function source text',()=>{
  const b=bot(()=>'https://plot.example');
  for(const url of [b.callbackUrl,b.webhookUrl]){
    assert.ok(!url.includes('=>'),`URL contains function source: ${url}`);
    assert.ok(!url.includes('getStore'),`URL leaks internals: ${url}`);
    assert.doesNotThrow(()=>new URL(url),`not a valid URL: ${url}`);
  }
});

test('channel link printed in chat messages is a real URL, never function source',()=>{
  // Regression from production: with a lazy origin this printed `()=>requestOrigin.getStore()??twitchOrigin`
  // followed by the join path, because channelUrl interpolated the raw config value.
  let current='https://plot.example';
  const b=bot(()=>current);
  const channelUrl=(b as unknown as {channelUrl(login:string):string}).channelUrl('ramitapai');
  assert.ok(!channelUrl.includes('=>'),`channel link leaked function source: ${channelUrl}`);
  assert.ok(!channelUrl.includes('getStore'),`channel link leaked internals: ${channelUrl}`);
  assert.equal(channelUrl,`https://plot.example${joinPath('twitch','ramitapai')}`);
  assert.doesNotThrow(()=>new URL(channelUrl));
  current='https://plot-dev.tailfb789f.ts.net:8444';
  assert.equal((b as unknown as {channelUrl(login:string):string}).channelUrl('ramitapai'),
    `https://plot-dev.tailfb789f.ts.net:8444${joinPath('twitch','ramitapai')}`);
});
