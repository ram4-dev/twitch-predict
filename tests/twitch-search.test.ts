import {test} from 'node:test';
import assert from 'node:assert/strict';
import {TwitchChannelSearch} from '../src/twitch-search.js';

test('Twitch search returns real channel-shaped results and caches repeated queries',async()=>{
 let calls=0;
 const transport:typeof fetch=async(_url,options)=>{calls++;const body=JSON.parse(String(options?.body));assert.equal(body.variables.q,'eggs');return Response.json({data:{searchUsers:{edges:[{node:{login:'eggsterr',displayName:'Eggsterr',stream:{id:'123'}}},{node:{login:'bad space',displayName:'Bad'}},{node:{login:'eggsoup',displayName:'Eggsoup',stream:null}}]}}});};
 const search=new TwitchChannelSearch(transport);const results=await search.search(' @EGGS ');
 assert.deepEqual(results,[{login:'eggsterr',displayName:'Eggsterr',live:true},{login:'eggsoup',displayName:'Eggsoup',live:false}]);
 assert.deepEqual(await search.search('eggs'),results);assert.equal(calls,1);
 await assert.rejects(search.search('https://evil.example'),/dos caracteres/);assert.equal(calls,1);
});

test('Twitch errors are surfaced and are not cached as an empty search',async()=>{
 let calls=0;const transport:typeof fetch=async()=>{calls++;return calls===1?new Response(null,{status:503}):Response.json({data:{searchUsers:{edges:[]}}});};
 const search=new TwitchChannelSearch(transport);await assert.rejects(search.search('egg'),/consultar Twitch/);assert.deepEqual(await search.search('egg'),[]);assert.equal(calls,2);
});
