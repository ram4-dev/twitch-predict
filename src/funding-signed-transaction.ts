import {Transaction} from '@solana/web3.js';

/** Account-table ordering is not payment intent. All instructions and fee settings are. */
export function validateSignedFunding(expected:Transaction,signed:Transaction){
  if(!signed.feePayer?.equals(expected.feePayer!)||signed.recentBlockhash!==expected.recentBlockhash||signed.nonceInfo)throw new Error('La transacción firmada cambió la wallet o el blockhash de la compra');
  if(signed.instructions.length!==expected.instructions.length||signed.instructions.some((actual,index)=>{
    const quoted=expected.instructions[index];
    return !actual.programId.equals(quoted.programId)||!actual.data.equals(quoted.data)||actual.keys.length!==quoted.keys.length||actual.keys.some((key,i)=>!key.pubkey.equals(quoted.keys[i].pubkey)||key.isSigner!==quoted.keys[i].isSigner||key.isWritable!==quoted.keys[i].isWritable);
  }))throw new Error('La transacción firmada no coincide con la compra');
  if(signed.signatures.length!==1||!signed.signature||!signed.verifySignatures())throw new Error('La firma de Phantom no es válida para esta compra');
  return signed;
}
