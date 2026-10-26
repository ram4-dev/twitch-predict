import {test} from 'node:test';
import assert from 'node:assert/strict';
import {popupScope,matchingCache,cacheAllowsBet,cachedBalance,type PopupCache} from '../src/popup-cache.js';
test('popup cache is isolated by server and authenticated session without storing its token',async()=>{
 const base='https://twitch-predict-byte.localhost:1357',scope=await popupScope(base,'private-session');
 const cache:PopupCache={version:1,base,scope,markets:[],marketsAt:1000,configAt:1000};
 assert.equal(matchingCache(cache,base,scope),cache);assert.ok(!scope.includes('private-session'));
 assert.equal(matchingCache(cache,base,await popupScope(base,'other-session')),undefined);
 assert.equal(matchingCache(cache,'http://twitch-predict.localhost:1356',scope),undefined);
});
test('cached zero balance survives; other accounts never reuse it and old markets cannot enable betting',()=>{
 const cache:PopupCache={version:1,base:'server',scope:'session',markets:[],marketsAt:1000,configAt:1000,account:{wallet:'first'},balance:{wallet:'first',lamports:0,at:1000}};
 assert.equal(cachedBalance(cache),0);assert.equal(cachedBalance({...cache,account:{wallet:'second'}}),undefined);
 assert.equal(cacheAllowsBet(cache,2000),true);assert.equal(cacheAllowsBet(cache,31000),false);
 assert.equal(cacheAllowsBet({...cache,marketsAt:400000},400000),false);
});
