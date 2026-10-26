import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ComputeBudgetProgram,Keypair,Transaction,SystemProgram} from '@solana/web3.js';
import {placeBetInstruction} from '../src/byte-wallet.js';
import {validateSignedBet} from '../src/byte-signed-transaction.js';
const wallet=Keypair.generate(),market=Keypair.generate().publicKey;
const build=()=>new Transaction({feePayer:wallet.publicKey,recentBlockhash:Keypair.generate().publicKey.toBase58()}).add(placeBetInstruction(market.toBase58(),wallet.publicKey.toBase58(),1,10000000n,123n));
test('validates real Phantom signature and bounded priority-fee enrichment',()=>{
 const expected=build(),signed=Transaction.from(expected.serialize({requireAllSignatures:false,verifySignatures:false}));
 signed.instructions.unshift(ComputeBudgetProgram.setComputeUnitLimit({units:300000}),ComputeBudgetProgram.setComputeUnitPrice({microLamports:10000}));signed.sign(wallet);
 assert.ok(validateSignedBet(expected,signed).verifySignatures());
});
test('rejects changed wager, wallet, blockhash, extra transfer, invalid signature and excessive fees',()=>{
 for(const mutate of [
  (tx:Transaction)=>{tx.instructions[0].data[8]=0;},
  (tx:Transaction)=>{tx.instructions[0].data[9]++;},
  (tx:Transaction)=>{tx.instructions[0].keys[0].pubkey=Keypair.generate().publicKey;},
  (tx:Transaction)=>{tx.recentBlockhash=Keypair.generate().publicKey.toBase58();},
  (tx:Transaction)=>{tx.add(SystemProgram.transfer({fromPubkey:wallet.publicKey,toPubkey:market,lamports:1}));},
  (tx:Transaction)=>{tx.add(ComputeBudgetProgram.setComputeUnitPrice({microLamports:1000000000}));},
 ]){const expected=build(),signed=Transaction.from(expected.serialize({requireAllSignatures:false,verifySignatures:false}));mutate(signed);signed.sign(wallet);assert.throws(()=>validateSignedBet(expected,signed));}
 const expected=build();assert.throws(()=>validateSignedBet(expected,expected),/firma/);
});
