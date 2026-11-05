import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publicChannelPath,publicChannelUrl,joinPath,overlayPath} from '../src/public-paths.js';
import {channelFromPath} from '../src/ui/streamer-page.js';

test('public channel paths normalize logins and reject unsupported platforms and bad logins',()=>{
  assert.deepEqual(publicChannelPath('twitch','Eggsterr'),{platform:'twitch',login:'eggsterr',path:'/s/twitch/eggsterr'});
  assert.equal(publicChannelPath('kick','eggsterr'),undefined);
  assert.equal(publicChannelPath('twitch','bad space'),undefined);
  assert.equal(publicChannelPath('twitch','../operator'),undefined);
  assert.equal(joinPath('twitch','Eggsterr'),'/join/twitch/eggsterr');
  assert.equal(joinPath('kick','eggsterr'),undefined);
  assert.equal(overlayPath('twitch','eggsterr'),'/overlay/twitch/eggsterr');
});

test('public channel URLs require an HTTPS origin without paths or query strings',()=>{
  assert.equal(publicChannelUrl('https://plot.example','twitch','eggsterr'),'https://plot.example/s/twitch/eggsterr');
  for(const origin of ['http://plot.example','https://plot.example/app','https://plot.example/?x=1','not a url'])
    assert.throws(()=>publicChannelUrl(origin,'twitch','eggsterr'),/origen HTTPS/);
});

test('route parsing accepts only s/join/overlay with a supported platform and normalizes the login',()=>{
  assert.deepEqual(channelFromPath('/s/twitch/eggsterr'),{view:'s',platform:'twitch',login:'eggsterr',path:'/s/twitch/eggsterr'});
  assert.deepEqual(channelFromPath('/join/twitch/Eggsterr/'),{view:'join',platform:'twitch',login:'eggsterr',path:'/s/twitch/eggsterr'});
  assert.deepEqual(channelFromPath('/overlay/twitch/eggsterr'),{view:'overlay',platform:'twitch',login:'eggsterr',path:'/s/twitch/eggsterr'});
  for(const path of ['/s/kick/eggsterr','/s/twitch/bad space','/watch/twitch/eggsterr','/s/twitch/','/app?channel=eggsterr'])
    assert.equal(channelFromPath(path),undefined);
});

test('exact channel matching keeps foo markets away from the foobar viewer',()=>{
  const markets=[
    {id:'a',notes:{channel:'foo'}},
    {id:'b',notes:{channel:'foobar'}},
    {id:'c',notes:{channel:'Foo'}},
  ] as {id:string;notes?:{channel?:string}}[];
  const exactVisible=(list:{id:string;notes?:{channel?:string}}[],channel:string)=>list.filter(m=>!channel||(m.notes?.channel??'').toLowerCase()===channel);
  const foo=exactVisible(markets,'foo').map(m=>m.id);
  assert.deepEqual(foo,['a','c']);
  assert.deepEqual(exactVisible(markets,'foobar').map(m=>m.id),['b']);
});

test('Phantom browse links wrap only same-origin http(s) targets and preserve public intention',async()=>{
  const {phantomBrowseUrl}=await import('../src/ui/streamer-page.js');
  const origin='https://twitch-predict.localhost:1358';
  // The function resolves targets against location.origin, so stub a browser origin.
  const locationStub={origin} as unknown as Location;
  const saved=globalThis.location;Object.defineProperty(globalThis,'location',{value:locationStub,configurable:true});
  try{
    assert.equal(phantomBrowseUrl('/s/twitch/eggsterr?market=pm_1'),`https://phantom.com/ul/browse/${encodeURIComponent(`${origin}/s/twitch/eggsterr?market=pm_1`)}?ref=${encodeURIComponent(origin)}`);
    for(const target of ['https://evil.example/s/twitch/eggsterr','javascript:alert(1)','//evil.example/x'])
      assert.throws(()=>phantomBrowseUrl(target),/Destino de wallet inválido/);
  }finally{if(saved)Object.defineProperty(globalThis,'location',{value:saved,configurable:true});}
});
