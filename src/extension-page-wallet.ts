import {Buffer} from 'buffer';
import {Transaction} from '@solana/web3.js';
import {phantom} from './byte-wallet.js';
// This code runs only when requested by Plot, inside the existing page's MAIN
// world. It receives public transaction bytes, never a session or bridge token.
const target=window as unknown as {__plotPhantomSign?:(input:{transaction:number[];wallet:string})=>Promise<{transaction?:number[];error?:string;code?:number}>};
target.__plotPhantomSign=async input=>{
 try{
  const provider=phantom();if(!provider?.isPhantom)throw new Error('Phantom was not found on this tab. Reload Twitch and try again.');
  const {publicKey}=await provider.connect();if(publicKey.toString()!==input.wallet)throw new Error('The wallet changed. Reconnect Phantom from Plot.');
  const tx=Transaction.from(Buffer.from(input.transaction));if(tx.feePayer?.toBase58()!==input.wallet)throw new Error('The wallet does not match the stake.');
  const signed=await provider.signTransaction(tx);
  if(provider.publicKey&&provider.publicKey.toString()!==input.wallet)throw new Error('The wallet changed during signing.');
  return {transaction:Array.from(signed.serialize({requireAllSignatures:false,verifySignatures:false}))};
 }catch(e){const error=e as Error&{code?:number};return {error:error.message,code:error.code};}
};
