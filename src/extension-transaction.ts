import {Buffer} from 'buffer';
import {Transaction} from '@solana/web3.js';
import {sendBet,type BetReceipt,type WalletProvider} from './byte-wallet.js';
import type {ByteConfig,DisplayByteMarket} from './byte-model.js';
type Operation={base:string;marketId:string;option:number;amount:string;wallet:string};
type WalletReply={transaction?:number[];error?:string;code?:number};
const englishBetError=(message:string)=>(({
 'Hay una transacción pendiente para este mercado. Revisala en Mis apuestas antes de enviar otra.':'A transaction is still pending for this market. Check it in My stakes before sending another.',
 'La configuración de devnet no está habilitada.':'Devnet configuration is not enabled.',
 'Este mercado no acepta apuestas en SOL.':'This market is not taking SOL stakes.',
 'La apuesta supera los límites del mercado.':'The stake is over the market limits.',
 'La conexión no corresponde a devnet.':'The connection is not devnet.',
 'La wallet cambió. Volvé a conectar antes de apostar.':'The wallet changed. Reconnect before staking.',
 'Necesitás SOL devnet para la apuesta, la cuenta y las comisiones.':'You need devnet SOL for the stake, the account, and fees.',
 'No se pudo verificar el estado actual del mercado.':'Could not verify the market’s current state.',
 'El mercado cerró o cambió. Actualizá la lista.':'The market closed or changed. Refresh the list.',
 'La wallet cambió durante la firma.':'The wallet changed during signing.',
 'Phantom devolvió otra wallet o un blockhash distinto.':'Phantom returned a different wallet or blockhash.',
 'La transacción firmada no coincide con la apuesta.':'The signed transaction does not match the stake.',
 'Comisiones de Phantom inválidas.':'Phantom fees are invalid.',
 'Límite de cómputo inválido.':'Invalid compute limit.',
 'Phantom agregó una instrucción no permitida.':'Phantom added an instruction that is not allowed.',
 'La comisión adicional supera 0,0001 SOL.':'The extra fee is over 0.0001 SOL.',
 'La firma de Phantom no es válida para esta transacción.':'The Phantom signature is not valid for this transaction.',
 'Ingresá SOL con hasta 9 decimales.':'Enter SOL with up to 9 decimal places.',
 'La apuesta mínima es 0,0001 SOL.':'The minimum stake is 0.0001 SOL.',
 'Apuesta inválida':'Invalid stake',
 'Firma inesperada del RPC':'Unexpected signature from the RPC',
} as Record<string,string>)[message]??message);
export async function performExtensionBet(op:Operation,stored:BetReceipt[],sign:(transaction:number[],wallet:string)=>Promise<WalletReply>,save:(receipt:BetReceipt)=>Promise<void>){
 const load=async(path:string)=>{const response=await fetch(`${op.base}${path}`,{signal:AbortSignal.timeout(25000)});if(!response.ok)throw new Error('Could not verify the market.');return response.json();};
 const [{market},config]=await Promise.all([load(`/api/byte/markets/${encodeURIComponent(op.marketId)}`) as Promise<{market:DisplayByteMarket}>,load('/api/byte/config') as Promise<ByteConfig>]);
 const provider:WalletProvider={isPhantom:true,connect:async()=>({publicKey:{toString:()=>op.wallet}}),signTransaction:async tx=>{
  const result=await sign(Array.from(tx.serialize({requireAllSignatures:false,verifySignatures:false})),op.wallet);
  if(result.error)throw Object.assign(new Error(result.code===4001?'You canceled the signature in Phantom.':englishBetError(result.error)),{code:result.code});
  if(!result.transaction||result.transaction.length>1232)throw new Error('Phantom did not return a valid transaction.');
  return Transaction.from(Buffer.from(result.transaction));
 }};
 try{return await sendBet(market,op.option,op.amount,op.wallet,config,()=>{},undefined,{provider,store:{base:op.base,save},receipts:stored});}
 catch(error){throw new Error(englishBetError(error instanceof Error?error.message:String(error)),{cause:error});}
}
