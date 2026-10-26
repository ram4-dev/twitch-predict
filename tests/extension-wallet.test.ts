import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
const base='https://twitch-predict-byte.localhost:1357',extension='a'.repeat(32),url=`chrome-extension://${extension}/popup.html`;
test('betting uses an existing tab, never creates windows, persists before sending and rejects page-origin requests',async()=>{
 const listeners:((message:unknown,sender:unknown,reply:(data:Record<string,unknown>)=>void)=>boolean|undefined)[]=[];
 const state:Record<string,unknown>={bridgeUrl:base,pointsToken:'opaque-session'};
 let tabs:{id:number;url:string}[]=[],injections=0,done!:()=>void;
 const completion=new Promise<void>(resolve=>{done=resolve;});
 const receipt={wallet:'wallet',marketId:'pm_test',option:1,amount:'10000000',signature:'1'.repeat(88),lastValidBlockHeight:100,status:'pending'};
 const chrome={runtime:{id:extension,getURL:(path:string)=>`chrome-extension://${extension}/${path}`,getPlatformInfo:async()=>({}),onMessage:{addListener:(fn:typeof listeners[number])=>listeners.push(fn)}},storage:{local:{get:async()=>structuredClone(state),set:async(value:Record<string,unknown>)=>{Object.assign(state,structuredClone(value));}}},tabs:{query:async()=>tabs,onRemoved:{addListener:()=>{}}},scripting:{executeScript:async(options:{files?:string[]})=>{injections++;return options.files?[{documentId:'document'}]:[{result:{transaction:[1,2,3]}}];}},windows:{create:()=>{assert.fail('No extra window is allowed');}}};
 const performExtensionBet=async(_op:unknown,_receipts:unknown,sign:(bytes:number[],wallet:string)=>Promise<unknown>,save:(receipt:unknown)=>Promise<void>)=>{
  await sign([1,2,3],'wallet');await save(receipt);
  assert.equal((state.byteReceipts as unknown[]).length,1);done();return receipt;
 };
 const source=(await readFile('extension/byte-wallet.js','utf8')).replace(/^import .*;\n/,'').replace('export function','function');
 runInNewContext(source+'\ninstallByteWallet(value=>value);',{chrome,performExtensionBet,crypto,URL,AbortSignal,setInterval,clearInterval,setTimeout,clearTimeout,fetch:async()=>({ok:true,json:async()=>({wallet:'wallet'})})});
 const dispatch=(message:unknown,sender:unknown)=>new Promise<Record<string,unknown>>(resolve=>{for(const handle of listeners)if(handle(message,sender,resolve))return;resolve({ignored:true});});
 const wager={type:'BYTE_BET',marketId:'pm_test',amount:'0.01',option:1};
 assert.equal((await dispatch(wager,{id:extension,url:'https://www.twitch.tv/foo'})).ignored,true);
 assert.match(String((await dispatch(wager,{id:extension,url})).error),/Abrí un canal/);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(injections,0);tabs=[{id:11,url:'https://www.twitch.tv/fixture_streamer'}];
 assert.equal((await dispatch(wager,{id:extension,url})).ok,true);await completion;
 assert.equal(injections,2);assert.equal((state.byteOperation as {tabId:number}).tabId,11);
 assert.match(String((await dispatch(wager,{id:extension,url})).error),/pendiente/);
});
