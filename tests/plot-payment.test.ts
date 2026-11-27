import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {MockPaymentProvider,paymentReceiptKey} from '../src/cloud/plot/payment.js';
import {verifyReceipt} from '../src/cloud/plot/chain.js';

test('mock orders are idempotent, conflict on altered terms, and confirm deterministically',async()=>{
 const provider=new MockPaymentProvider(),input={id:'a',wallet:'wallet',amount:'600'};
 assert.deepEqual(await provider.createOrder(input),await provider.createOrder(input));
 await assert.rejects(provider.createOrder({...input,amount:'400'}));
 provider.confirm('a');provider.confirm('a');assert.equal((await provider.getOrder('a'))?.status,'paid');
});
test('receipt identity includes provider and environment; mismatches fail closed',()=>{
 const key=paymentReceiptKey('mock','test','1');assert.notEqual(key,paymentReceiptKey('mock','live','1'));
 assert.throws(()=>verifyReceipt({key,wallet:'other',amount:'600',signature:'sig',finalized:true},{key,wallet:'wallet',amount:'600'}));
});
