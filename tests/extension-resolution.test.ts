import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createResolutionNotifier,resolutionTransitions} from '../src/extension-resolution.js';
import type {TwitchPreview} from '../src/twitch-preview.js';
const channel='gorgc';
const round=(status:'ACTIVE'|'LOCKED'|'RESOLVED'|'CANCELED',winner:string|null='yes'):TwitchPreview=>({prediction:{id:'round',channel,title:'Astra vs BB',status,createdAt:new Date().toISOString(),predictionWindowSeconds:600,winningOutcomeId:winner,outcomes:[{id:'yes',title:'Astra'},{id:'no',title:'BB'}]},market:{rateLimited:true}});
const snapshot=(status:'ACTIVE'|'LOCKED'|'RESOLVED'|'CANCELED',winner:string|null='yes')=>({fetchedAt:new Date().toISOString(),predictions:[round(status,winner)]});
function fixture(){
 let storage:Record<string,unknown>={},opens=0,focused=true,popup=false,fail=false,url='https://www.twitch.tv/gorgc',badge='';
 const api={storage:{local:{get:async()=>structuredClone(storage),set:async(value:unknown)=>{storage={...storage,...structuredClone(value as Record<string,unknown>)};}}},windows:{getLastFocused:async()=>({id:1,focused})},tabs:{query:async()=>[{id:10,url}]},runtime:{getContexts:async()=>popup?[{windowId:1}]:[]},action:{openPopup:async()=>{opens++;if(fail)throw new Error('Cannot open popup');},setBadgeText:async(o:{text:string})=>{badge=o.text;},setBadgeBackgroundColor:async()=>{}}};
 return {api,read:()=>({storage,opens,badge}),focus:(value:boolean)=>{focused=value;},popup:(value:boolean)=>{popup=value;},fail:()=>{fail=true;},url:(value:string)=>{url=value;}};
}
test('only a valid observed terminal transition alerts; history, stale snapshots and malformed winners do not',()=>{
 assert.equal(resolutionTransitions(channel,undefined,snapshot('RESOLVED')).length,0);
 assert.equal(resolutionTransitions(channel,{...snapshot('ACTIVE'),fetchedAt:new Date(Date.now()-660000).toISOString()},snapshot('RESOLVED')).length,0);
 assert.equal(resolutionTransitions(channel,snapshot('ACTIVE'),snapshot('LOCKED')).length,0);
 assert.equal(resolutionTransitions(channel,snapshot('LOCKED'),snapshot('RESOLVED','wrong')).length,0);
 assert.equal(resolutionTransitions('avice',snapshot('ACTIVE'),snapshot('RESOLVED')).length,0);
 assert.equal(resolutionTransitions(channel,snapshot('LOCKED'),snapshot('RESOLVED')).length,1);
 assert.equal(resolutionTransitions(channel,snapshot('ACTIVE'),snapshot('CANCELED',null)).length,1);
});
test('concurrent polls and a restarted notifier deliver a result at most once',async()=>{
 const f=fixture(),notify=createResolutionNotifier(f.api);
 await Promise.all([notify(channel,snapshot('ACTIVE'),snapshot('RESOLVED')),notify(channel,snapshot('ACTIVE'),snapshot('RESOLVED'))]);assert.equal(f.read().opens,1);
 await createResolutionNotifier(f.api)(channel,snapshot('ACTIVE'),snapshot('RESOLVED'));assert.equal(f.read().opens,1);
});
test('an unfocused browser or another stream defers delivery until the relevant stream is active',async()=>{
 const f=fixture(),notify=createResolutionNotifier(f.api);f.focus(false);
 await notify(channel,snapshot('ACTIVE'),snapshot('RESOLVED'));assert.equal(f.read().opens,0);
 f.focus(true);f.url('https://www.twitch.tv/avice');await notify(channel,snapshot('RESOLVED'),snapshot('RESOLVED'));assert.equal(f.read().opens,0);
 f.url('https://www.twitch.tv/gorgc');await createResolutionNotifier(f.api)(channel,snapshot('RESOLVED'),snapshot('RESOLVED'));assert.equal(f.read().opens,1);
});
test('an existing popup receives the result without another open; blocked opening leaves a badge without retry storms',async()=>{
 const f=fixture();f.popup(true);await createResolutionNotifier(f.api)(channel,snapshot('ACTIVE'),snapshot('RESOLVED'));assert.equal(f.read().opens,0);
 const blocked=fixture();blocked.fail();const notify=createResolutionNotifier(blocked.api);await notify(channel,snapshot('ACTIVE'),snapshot('RESOLVED'));await notify(channel,snapshot('RESOLVED'),snapshot('RESOLVED'));assert.equal(blocked.read().opens,1);assert.equal(blocked.read().badge,'!');
});

test('real SOL market completion owns its alert and retains the source prediction identity',()=>{
 const market={id:'pm_round',title:'Astra vs BB',options:['Astra','BB'],currency:'sol' as const,status:'open' as 'open'|'resolved',bettable:true,resolvable:false,openMs:1,closeMs:2,chain:{market:'11111111111111111111111111111111',settled:false},pools:[1,2],total:3,bettors:2,winner:null as number|null,invalidReason:null,notes:{channel,rules:'fixture',createdAt:new Date().toISOString(),twitch:{predictionId:'round',closesAt:2,checkedAt:Date.now(),status:'ACTIVE'}}};
 const old={...snapshot('ACTIVE'),byteMarkets:[market]},pending={...snapshot('RESOLVED'),byteMarkets:[market]};
 assert.equal(resolutionTransitions(channel,old,pending).length,0);
 const complete={...pending,byteMarkets:[{...market,status:'resolved' as const,winner:0}]};
 assert.deepEqual(resolutionTransitions(channel,old,complete).map(a=>[a.id,a.marketId,a.predictionId]),[['gorgc:round','pm_round','round']]);
 assert.equal(resolutionTransitions(channel,old,{...pending,byteMarkets:[{...market,status:'resolved' as const,winner:99}]}).length,0);
});
