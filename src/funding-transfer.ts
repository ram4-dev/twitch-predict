import {PublicKey,SystemProgram,TransactionInstruction} from '@solana/web3.js';
import {USDC_DEVNET} from './funding-model.js';

// SPL Token's TransferChecked ABI and associated-token CreateIdempotent ABI.
// USDC uses the original Token program, six decimals, and a Circle mint for the selected network.
export const TOKEN_PROGRAM=new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
export const ASSOCIATED_PROGRAM=new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
export function usdcAccount(owner:PublicKey,mint=new PublicKey(USDC_DEVNET)){
  if(!PublicKey.isOnCurve(owner.toBytes()))throw new Error('Wallet inválida');
  return PublicKey.findProgramAddressSync([owner.toBuffer(),TOKEN_PROGRAM.toBuffer(),mint.toBuffer()],ASSOCIATED_PROGRAM)[0];
}
export function usdcTransfer(sender:PublicKey,recipient:PublicKey,units:bigint,mint=new PublicKey(USDC_DEVNET)){
  if(units<=0n||units>0xffffffffffffffffn)throw new Error('Importe USDC inválido');
  const from=usdcAccount(sender,mint),to=usdcAccount(recipient,mint);
  const key=(pubkey:PublicKey,isSigner=false,isWritable=false)=>({pubkey,isSigner,isWritable});
  const create=new TransactionInstruction({programId:ASSOCIATED_PROGRAM,keys:[key(sender,true,true),key(to,false,true),key(recipient),key(mint),key(SystemProgram.programId),key(TOKEN_PROGRAM)],data:Buffer.from([1])});
  const data=Buffer.alloc(10);data[0]=12;data.writeBigUInt64LE(units,1);data[9]=6;
  const transfer=new TransactionInstruction({programId:TOKEN_PROGRAM,keys:[key(from,false,true),key(mint),key(to,false,true),key(sender,true)],data});
  return [create,transfer];
}
