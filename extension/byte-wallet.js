// The popup owns the wager. This short-lived web window only hosts Phantom's
// injected provider; no session token is placed in its URL or sent to the page.
let starting=false;
const terminal=new Set(['confirmed','failed','expired','cancelled']);
async function saveOperation(operation){
 const {byteReceipts=[]}=await chrome.storage.local.get('byteReceipts');
 const receipts=operation.receipt?[operation.receipt,...byteReceipts.filter(r=>r.signature!==operation.receipt.signature)].slice(0,100):byteReceipts;
 await chrome.storage.local.set({byteOperation:operation,byteReceipts:receipts});
}
export function installByteWallet(appUrl){
 chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(message.type!=='BYTE_BET')return;
  if(sender.id!==chrome.runtime.id||sender.url!==chrome.runtime.getURL('popup.html'))return;
  if(starting){reply({error:'Ya se está abriendo Phantom.'});return;}
  starting=true;
  void (async()=>{
   const stored=await chrome.storage.local.get(['bridgeUrl','pointsToken','byteOperation']);
   const base=appUrl(stored.bridgeUrl),previous=stored.byteOperation;
   if(previous&&!terminal.has(previous.status)&&(previous.receipt||Date.now()-previous.createdAt<120000))throw new Error('Hay una apuesta pendiente. Completá Phantom o revisá la transacción guardada.');
   const me=await fetch(`${base}/api/points/me`,{headers:{Authorization:`Bearer ${stored.pointsToken||''}`},signal:AbortSignal.timeout(10000)});
   const account=await me.json();if(!me.ok||!account.wallet)throw new Error('Conectá Phantom desde la extensión antes de apostar.');
   if(!/^pm_[a-zA-Z0-9_-]{1,100}$/.test(message.marketId)||!Number.isInteger(message.option)||message.option<0||message.option>5||typeof message.amount!=='string'||!/^(0|[1-9]\d*)(\.\d{1,9})?$/.test(message.amount))throw new Error('Apuesta inválida.');
   const operation={id:crypto.randomUUID(),base,marketId:message.marketId,option:message.option,amount:message.amount,wallet:account.wallet,createdAt:Date.now(),status:'signing'};
   await saveOperation(operation);
   try{
    const window=await chrome.windows.create({url:`${base}/extension-wallet.html#request=${operation.id}&extension=${chrome.runtime.id}`,type:'popup',width:440,height:560});
    // The page retries its handshake until the tab identity is durably recorded.
    await saveOperation({...operation,windowId:window.id,tabId:window.tabs[0].id});
    reply({ok:true});
   }catch(e){await saveOperation({...operation,status:'cancelled',error:e.message});throw e;}
  })().catch(e=>reply({error:e.message})).finally(()=>{starting=false;});return true;
 });
 chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(message.type!=='BYTE_CHECK'||sender.url!==chrome.runtime.getURL('popup.html'))return;
  void (async()=>{
   const {byteOperation:op}=await chrome.storage.local.get('byteOperation');
   if(op?.status==='signing'){
    if(op.windowId)try{await chrome.windows.get(op.windowId);}catch{await saveOperation({...op,status:'cancelled',error:'La ventana de firma se cerró. Podés volver a apostar.'});}
    else if(Date.now()-op.createdAt>30000)await saveOperation({...op,status:'cancelled',error:'No se pudo abrir Phantom. Volvé a intentar.'});
    reply({ok:true});return;
   }
   if(!op||op.status!=='pending'||!op.receipt){reply({ok:true});return;}
   const rpc=async(method,params=[])=>{const response=await fetch(`${op.base}/api/byte/rpc`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(10000)});const data=await response.json();if(!response.ok||data.error)throw new Error('No se pudo consultar Solana.');return data.result;};
   if(await rpc('getGenesisHash')!=='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG')throw new Error('La conexión no corresponde a devnet.');
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
 chrome.runtime.onMessageExternal.addListener((message,sender,reply)=>{
  if(!['BYTE_SIGNER_READY','BYTE_SIGNER_RECEIPT','BYTE_SIGNER_RESULT'].includes(message.type))return;
  void (async()=>{
   const {byteOperation:op}=await chrome.storage.local.get('byteOperation');
   if(!op||op.id!==message.id||!sender.url||new URL(sender.url).origin!==op.base||new URL(sender.url).pathname!=='/extension-wallet.html'||sender.tab?.id!==op.tabId)throw new Error('La solicitud no corresponde a esta ventana de firma.');
   if(message.type==='BYTE_SIGNER_READY'){if(op.status!=='signing')throw new Error('Esta solicitud ya terminó.');reply({ok:true,operation:op});return;}
   const receipt=message.receipt;
   if(receipt&&(receipt.wallet!==op.wallet||receipt.marketId!==op.marketId||receipt.option!==op.option||typeof receipt.signature!=='string'||!/^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(receipt.signature)||!Number.isSafeInteger(receipt.lastValidBlockHeight)||BigInt(receipt.amount)!==BigInt(op.amount.split('.')[0])*1000000000n+BigInt((op.amount.split('.')[1]||'').padEnd(9,'0'))))throw new Error('El recibo no coincide con la apuesta.');
   if(message.type==='BYTE_SIGNER_RECEIPT'){
    if(op.status!=='signing'||!receipt||receipt.status!=='pending')throw new Error('Recibo fuera de secuencia.');
    await saveOperation({...op,status:'pending',receipt});reply({ok:true});return;
   }
   if(receipt&&(!op.receipt||!['pending','confirmed','failed','expired'].includes(receipt.status)))throw new Error('El recibo no fue guardado antes del envío.');
   if(!receipt&&op.receipt){reply({ok:true});return;}
   if(op.receipt&&receipt?.signature!==op.receipt.signature)throw new Error('La firma cambió.');
   if(terminal.has(op.status)){reply({ok:true});return;}
   await saveOperation({...op,status:receipt?.status??'failed',receipt,error:typeof message.error==='string'?message.error.slice(0,500):undefined});
   reply({ok:true});
  })().catch(e=>reply({error:e.message}));return true;
 });
 chrome.windows.onRemoved.addListener(windowId=>{void (async()=>{const {byteOperation:op}=await chrome.storage.local.get('byteOperation');if(op?.windowId===windowId&&op.status==='signing')await saveOperation({...op,status:'cancelled',error:'Cerraste la ventana antes de firmar.'});})();});
}
