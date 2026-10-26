import {sendBet,checkReceipt,receipts,type BetReceipt} from './byte-wallet.js';
import type {ByteConfig,DisplayByteMarket} from './byte-model.js';
type Operation={id:string;marketId:string;option:number;amount:string;wallet:string};
const parameters=new URLSearchParams(location.hash.slice(1)),id=parameters.get('request'),extension=parameters.get('extension');
const status=document.getElementById('signer-status')!,detail=document.getElementById('signer-detail')!;
const runtime=(globalThis as unknown as {chrome?:{runtime?:{sendMessage(id:string,message:unknown):Promise<{ok?:boolean;error?:string;operation?:Operation}>}}}).chrome?.runtime;
const message=async(type:string,extra:Record<string,unknown>={})=>{if(!runtime||!extension||!/^[a-p]{32}$/.test(extension)||!id)throw new Error('Abrí la apuesta desde la extensión de Plot.');const result=await runtime.sendMessage(extension,{type,id,...extra});if(!result?.ok)throw new Error(result?.error??'La extensión no respondió.');return result;};
async function run(){
 let operation:Operation|undefined;
 for(let attempt=0;attempt<20;attempt++){try{operation=(await message('BYTE_SIGNER_READY')).operation;break;}catch(e){if(attempt===19)throw e;await new Promise(resolve=>setTimeout(resolve,100));}}
 if(!operation)throw new Error('No se encontró la apuesta.');
 detail.textContent=`${operation.amount} SOL devnet · opción ${operation.option+1}`;
 const load=async(path:string)=>{const response=await fetch(path,{signal:AbortSignal.timeout(25000)});if(!response.ok)throw new Error('No se pudo verificar el mercado.');return response.json();};
 const [{market},config]=await Promise.all([load(`/api/byte/markets/${encodeURIComponent(operation.marketId)}`) as Promise<{market:DisplayByteMarket}>,load('/api/byte/config') as Promise<ByteConfig>]);
 detail.textContent=`${market.title} · ${market.options[operation.option]} · ${operation.amount} SOL devnet`;
 let receipt:BetReceipt;
 const existing=receipts().find(r=>r.marketId===operation.marketId&&r.wallet===operation.wallet&&r.status==='pending');
 if(existing){receipt=await checkReceipt(existing);await message('BYTE_SIGNER_RECEIPT',{receipt:{...receipt,status:'pending'}});}
 else receipt=await sendBet(market,operation.option,operation.amount,operation.wallet,config,text=>{status.textContent=text;},async receipt=>{await message('BYTE_SIGNER_RECEIPT',{receipt});});
 await message('BYTE_SIGNER_RESULT',{receipt});
 status.textContent=receipt.status==='confirmed'?'Apuesta confirmada en Solana.':'Transacción guardada. Podés seguirla desde la extensión.';
 const link=document.getElementById('signer-receipt') as HTMLAnchorElement;link.href=`https://explorer.solana.com/tx/${receipt.signature}?cluster=devnet`;link.hidden=false;
 if(receipt.status==='confirmed')window.close();
}
void run().catch(async error=>{status.textContent=error.code===4001?'Cancelaste la firma en Phantom.':error.message;await message('BYTE_SIGNER_RESULT',{error:status.textContent}).catch(()=>{});});
