import {ComputeBudgetProgram,Transaction} from '@solana/web3.js';

// Phantom may recompile account keys or add priority-fee instructions. Compare the
// actual wager, rather than requiring an identical serialized account table.
export function validateSignedBet(expected:Transaction,returned:Transaction):Transaction{
 const signed=Transaction.from(returned.serialize({requireAllSignatures:false,verifySignatures:false}));
 if(!signed.feePayer?.equals(expected.feePayer!)||signed.recentBlockhash!==expected.recentBlockhash||signed.nonceInfo)throw new Error('Phantom devolvió otra wallet o un blockhash distinto.');
 const wagers=signed.instructions.filter(i=>!i.programId.equals(ComputeBudgetProgram.programId));
 const a=expected.instructions[0],b=wagers[0];
 if(wagers.length!==1||!b.programId.equals(a.programId)||!b.data.equals(a.data)||b.keys.length!==a.keys.length||b.keys.some((k,i)=>!k.pubkey.equals(a.keys[i].pubkey)||k.isSigner!==a.keys[i].isSigner||k.isWritable!==a.keys[i].isWritable))throw new Error('La transacción firmada no coincide con la apuesta.');
 let limit=200_000n,price=0n;const seen=new Set<number>();
 for(const i of signed.instructions.filter(i=>i.programId.equals(ComputeBudgetProgram.programId))){
  const kind=i.data[0];if(i.keys.length||seen.has(kind))throw new Error('Comisiones de Phantom inválidas.');seen.add(kind);
  if(kind===2&&i.data.length===5){limit=BigInt(i.data.readUInt32LE(1));if(limit===0n||limit>1_400_000n)throw new Error('Límite de cómputo inválido.');}
  else if(kind===3&&i.data.length===9)price=i.data.readBigUInt64LE(1);
  else throw new Error('Phantom agregó una instrucción no permitida.');
 }
 if((limit*price+999_999n)/1_000_000n>100_000n)throw new Error('La comisión adicional supera 0,0001 SOL.');
 if(signed.signatures.length!==1||!signed.signature||!signed.verifySignatures())throw new Error('La firma de Phantom no es válida para esta transacción.');
 return signed;
}
