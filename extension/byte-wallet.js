import {performExtensionBet} from './byte-transaction.js';
let starting=false,betting;
const terminal=new Set(['confirmed','failed','expired','cancelled']);
async function saveOperation(operation){
 const {byteReceipts=[]}=await chrome.storage.local.get('byteReceipts');
 const receipts=operation.receipt?[operation.receipt,...byteReceipts.filter(r=>r.signature!==operation.receipt.signature)].slice(0,100):byteReceipts;
 await chrome.storage.local.set({byteOperation:operation,byteReceipts:receipts});
}
function eligibleTab(tab,base){
 try{const url=new URL(tab.url);return url.origin===base&&['/','/byte'].includes(url.pathname)||url.origin==='https://www.twitch.tv'&&/^\/[a-zA-Z0-9_]{1,40}\/?$/.test(url.pathname)&&!/^\/(directory|downloads|settings|videos|inventory|wallet|subscriptions|search)(\/|$)/i.test(url.pathname);}catch{return false;}
}
async function signerTab(base){
 const active=await chrome.tabs.query({active:true,lastFocusedWindow:true});
 if(active[0]&&eligibleTab(active[0],base))return active[0];
 const tabs=await chrome.tabs.query({url:['https://www.twitch.tv/*',`${base}/*`]});
 return tabs.find(tab=>tab.url?.startsWith('https://www.twitch.tv/')&&eligibleTab(tab,base))??tabs.find(tab=>eligibleTab(tab,base));
}
async function signInTab(tabId,transaction,wallet){
 const injected=await chrome.scripting.executeScript({target:{tabId,frameIds:[0]},world:'MAIN',files:['page-wallet.js']});
 const documentId=injected[0]?.documentId;if(!documentId)throw new Error('The tab changed. Try again from Twitch.');
 const [response]=await chrome.scripting.executeScript({target:{tabId,documentIds:[documentId]},world:'MAIN',func:async input=>{
  const sign=globalThis.__plotPhantomSign;if(typeof sign!=='function')return {error:'Phantom is not available on this tab.'};return sign(input);
 },args:[{transaction,wallet}]});
 if(!response?.result)throw new Error('Phantom did not respond from the tab.');return response.result;
}
function runBet(op,receipts){
 const keeper=setInterval(()=>void chrome.runtime.getPlatformInfo(),20000);
 let timeout;
 const task=performExtensionBet(op,receipts,(transaction,wallet)=>signInTab(op.tabId,transaction,wallet),async receipt=>{
  const {byteOperation:current}=await chrome.storage.local.get('byteOperation');
  if(current?.id!==op.id||(terminal.has(current.status)&&!(current.receipt?.signature===receipt.signature&&current.status===receipt.status)))throw new Error('This stake request is already finished.');
  await saveOperation({...current,status:receipt.status,receipt});
 });
 return Promise.race([task,new Promise((_resolve,reject)=>{timeout=setTimeout(()=>reject(new Error('The Phantom request expired. Try again.')),150000);})]).catch(async error=>{
  const {byteOperation:current}=await chrome.storage.local.get('byteOperation');
  if(current?.id===op.id&&!terminal.has(current.status))await saveOperation({...current,status:current.receipt?'pending':'failed',error:error.message});
 }).finally(()=>{clearInterval(keeper);clearTimeout(timeout);});
}
export function installByteWallet(appUrl){
 chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(message.type!=='BYTE_BET')return;
  if(sender.id!==chrome.runtime.id||sender.url!==chrome.runtime.getURL('popup.html'))return;
  if(starting||betting){reply({error:'A request is already pending in Phantom.'});return;}
  starting=true;
  void (async()=>{
   const stored=await chrome.storage.local.get(['bridgeUrl','pointsToken','byteOperation','byteReceipts']);
   const base=appUrl(stored.bridgeUrl),previous=stored.byteOperation;
   if(previous&&!terminal.has(previous.status)&&(previous.receipt||Date.now()-previous.createdAt<120000))throw new Error('A stake is still pending. Finish it in Phantom or check the saved transaction.');
   const tab=await signerTab(base);if(!tab)throw new Error('Open a Twitch channel or the Plot dashboard to use Phantom. No extra windows will open.');
   const me=await fetch(`${base}/api/points/me`,{headers:{Authorization:`Bearer ${stored.pointsToken||''}`},signal:AbortSignal.timeout(10000)});
   const account=await me.json();if(!me.ok||!account.wallet)throw new Error('Connect Phantom from the extension before staking.');
   if(!/^pm_[a-zA-Z0-9_-]{1,100}$/.test(message.marketId)||!Number.isInteger(message.option)||message.option<0||message.option>5||typeof message.amount!=='string'||!/^(0|[1-9]\d*)(\.\d{1,9})?$/.test(message.amount))throw new Error('Invalid stake.');
   const operation={id:crypto.randomUUID(),base,marketId:message.marketId,option:message.option,amount:message.amount,wallet:account.wallet,tabId:tab.id,createdAt:Date.now(),status:'signing'};
   await saveOperation(operation);
   betting=runBet(operation,stored.byteReceipts??[]).finally(()=>{betting=undefined;});
   reply({ok:true});
  })().catch(e=>reply({error:e.message})).finally(()=>{starting=false;});return true;
 });
 chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(message.type!=='BYTE_CHECK'||sender.url!==chrome.runtime.getURL('popup.html'))return;
  void (async()=>{
   const {byteOperation:op}=await chrome.storage.local.get('byteOperation');
   if(op?.status==='signing'){
    if(!betting&&!starting)await saveOperation({...op,status:'cancelled',error:'The signature request was interrupted. You can stake again.'});
    reply({ok:true});return;
   }
   if(!op||op.status!=='pending'||!op.receipt){reply({ok:true});return;}
   const rpc=async(method,params=[])=>{const response=await fetch(`${op.base}/api/byte/rpc`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(10000)});const data=await response.json();if(!response.ok||data.error)throw new Error('Could not reach Solana.');return data.result;};
   if(await rpc('getGenesisHash')!=='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG')throw new Error('The connection is not devnet.');
   const status=(await rpc('getSignatureStatuses',[[op.receipt.signature],{searchTransactionHistory:true}])).value[0];
   let next='pending';if(status?.err)next='failed';else if(['confirmed','finalized'].includes(status?.confirmationStatus))next='confirmed';else if(!status&&await rpc('getBlockHeight',[{commitment:'finalized'}])>op.receipt.lastValidBlockHeight)next='expired';
   if(next!=='pending'){
    if(next==='confirmed')await fetch(`${op.base}/api/byte/markets/${encodeURIComponent(op.marketId)}/sync`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({wallet:op.wallet}),signal:AbortSignal.timeout(25000)}).catch(()=>{});
    const current=(await chrome.storage.local.get('byteOperation')).byteOperation;
    if(current?.id===op.id)await saveOperation({...current,status:next,receipt:{...op.receipt,status:next}});
   }
   reply({ok:true});
  })().catch(e=>reply({error:e.message}));return true;
 });
 chrome.tabs.onRemoved.addListener(tabId=>{void (async()=>{const {byteOperation:op}=await chrome.storage.local.get('byteOperation');if(op?.tabId===tabId&&op.status==='signing')await saveOperation({...op,status:'cancelled',error:'You closed the tab before signing.'});})();});
}
