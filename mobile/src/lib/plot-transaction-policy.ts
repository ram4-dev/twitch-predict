import { Buffer } from 'buffer';
import { PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import type { PlotRequest } from './plot-intent-client';
const TOKEN=new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
const ATA=new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const readU64=(data:Uint8Array,offset:number)=>{let value=0n;for(let i=7;i>=0;i--)value=(value<<8n)+BigInt(data[offset+i]);return value;};
const discriminator={place_prediction:Buffer.from([79,46,195,197,50,91,88,229]),claim:Buffer.from([62,198,214,193,213,159,108,210])};
export type PlotSigningPolicy = {program:PublicKey;mint:PublicKey};
/** Pin program/mint and bind every instruction account and argument to the reviewed request. */
export function validatePlotTransaction(tx:Transaction, request:PlotRequest, policy:PlotSigningPolicy) {
 const owner=new PublicKey(request.wallet), ix=tx.instructions[0];
 if(tx.instructions.length!==1||!ix||!ix.programId.equals(policy.program)||!tx.feePayer||tx.feePayer.equals(owner))throw new Error('La transacción no corresponde al programa PLOT configurado.');
 const pda=(...seeds:Buffer[])=>PublicKey.findProgramAddressSync(seeds,policy.program)[0];
 const config=pda(Buffer.from('config')),market=pda(Buffer.from('market'),config.toBuffer(),Buffer.from(request.parameters.marketIdentity,'hex')),position=pda(Buffer.from('position'),market.toBuffer(),owner.toBuffer());
 const token=PublicKey.findProgramAddressSync([owner.toBuffer(),TOKEN.toBuffer(),policy.mint.toBuffer()],ATA)[0];
 const place=request.operation==='place_prediction';
 const accounts=place?[owner,tx.feePayer,config,market,position,policy.mint,token,TOKEN,SystemProgram.programId]:[owner,config,market,position,policy.mint,token,pda(Buffer.from('mint_authority')),TOKEN];
 const signers=place?[true,true,false,false,false,false,false,false,false]:[true,false,false,false,false,false,false,false];
 const writable=place?[false,true,false,true,true,true,true,false,false]:[false,false,false,true,true,true,false,false];
 if(ix.keys.length!==accounts.length||ix.keys.some((key,i)=>!key.pubkey.equals(accounts[i])||key.isSigner!==signers[i]||key.isWritable!==writable[i]))throw new Error('Las cuentas de la transacción PLOT no coinciden.');
 const data=Buffer.from(ix.data), expected=discriminator[request.operation];
 if(!expected.every((byte,i)=>data[i]===byte)||data.length!==(place?25:8))throw new Error('Instrucción PLOT no reconocida.');
 if(place&&(data[8]!==request.parameters.option||readU64(data,9)!==BigInt(request.parameters.amount!)||readU64(data,17)!==BigInt(request.parameters.sequence!)))throw new Error('La predicción preparada no coincide con la solicitud.');
}
