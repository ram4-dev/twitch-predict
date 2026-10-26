import {Buffer} from 'buffer';
import {Transaction} from '@solana/web3.js';
import {sendBet,type BetReceipt,type WalletProvider} from './byte-wallet.js';
import type {ByteConfig,DisplayByteMarket} from './byte-model.js';
type Operation={base:string;marketId:string;option:number;amount:string;wallet:string};
type WalletReply={transaction?:number[];error?:string;code?:number};
export async function performExtensionBet(op:Operation,stored:BetReceipt[],sign:(transaction:number[],wallet:string)=>Promise<WalletReply>,save:(receipt:BetReceipt)=>Promise<void>){
 const load=async(path:string)=>{const response=await fetch(`${op.base}${path}`,{signal:AbortSignal.timeout(25000)});if(!response.ok)throw new Error('No se pudo verificar el mercado.');return response.json();};
 const [{market},config]=await Promise.all([load(`/api/byte/markets/${encodeURIComponent(op.marketId)}`) as Promise<{market:DisplayByteMarket}>,load('/api/byte/config') as Promise<ByteConfig>]);
 const provider:WalletProvider={isPhantom:true,connect:async()=>({publicKey:{toString:()=>op.wallet}}),signTransaction:async tx=>{
  const result=await sign(Array.from(tx.serialize({requireAllSignatures:false,verifySignatures:false})),op.wallet);
  if(result.error)throw Object.assign(new Error(result.code===4001?'Cancelaste la firma en Phantom.':result.error),{code:result.code});
  if(!result.transaction||result.transaction.length>1232)throw new Error('Phantom no devolvió una transacción válida.');
  return Transaction.from(Buffer.from(result.transaction));
 }};
 return sendBet(market,op.option,op.amount,op.wallet,config,()=>{},undefined,{provider,store:{base:op.base,save},receipts:stored});
}
