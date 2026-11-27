import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {Keypair,PublicKey,SystemProgram,Transaction,TransactionInstruction} from '@solana/web3.js';
import {validatePlotTransaction} from '../mobile/src/lib/plot-transaction-policy.js';
import type {PlotRequest} from '../mobile/src/lib/plot-intent-client.js';
test('signing policy binds program, mint, PDAs, instruction and amount',()=>{
 const owner=Keypair.generate().publicKey,payer=Keypair.generate().publicKey,program=Keypair.generate().publicKey,mint=Keypair.generate().publicKey,identity='ab'.repeat(32);
 const request:PlotRequest={wallet:owner.toBase58(),operation:'place_prediction',parameters:{marketIdentity:identity,option:0,amount:'600',sequence:'0'}};
 const pda=(...s:Buffer[])=>PublicKey.findProgramAddressSync(s,program)[0],config=pda(Buffer.from('config')),market=pda(Buffer.from('market'),config.toBuffer(),Buffer.from(identity,'hex')),position=pda(Buffer.from('position'),market.toBuffer(),owner.toBuffer());
 const token=new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'),ataProgram=new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'),ata=PublicKey.findProgramAddressSync([owner.toBuffer(),token.toBuffer(),mint.toBuffer()],ataProgram)[0];
 const keys=[owner,payer,config,market,position,mint,ata,token,SystemProgram.programId].map((pubkey,i)=>({pubkey,isSigner:i<2,isWritable:[1,3,4,5,6].includes(i)}));
 const data=Buffer.alloc(25);Buffer.from([79,46,195,197,50,91,88,229]).copy(data);data.writeBigUInt64LE(600n,9);
 const tx=new Transaction({feePayer:payer,recentBlockhash:Keypair.generate().publicKey.toBase58()}).add(new TransactionInstruction({programId:program,keys,data}));
 validatePlotTransaction(Transaction.from(tx.serialize({requireAllSignatures:false,verifySignatures:false})),request,{program,mint});
 assert.throws(()=>validatePlotTransaction(tx,{...request,parameters:{...request.parameters,amount:'601'}},{program,mint}));
 assert.throws(()=>validatePlotTransaction(tx,request,{program:Keypair.generate().publicKey,mint}));
 tx.instructions[0].keys[6].pubkey=Keypair.generate().publicKey;assert.throws(()=>validatePlotTransaction(tx,request,{program,mint}));
});
