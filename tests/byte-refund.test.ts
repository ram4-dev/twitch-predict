import {test} from 'node:test';
import assert from 'node:assert/strict';
import {confirmedRefund} from '../src/byte-refund.js';
import type {DisplayByteMarket} from '../src/byte-model.js';
import type {BetReceipt} from '../src/byte-bet-core.js';
const market={id:'pm_refund',currency:'sol',status:'invalid',chain:{settled:true},options:['Yes','No'],total:30000000} as DisplayByteMarket;
const receipt={signature:'signature',marketId:market.id,wallet:'my-wallet',option:0,amount:'10000000',status:'confirmed'} as BetReceipt;
test('refund sums unique confirmed principal for the active wallet and market without computing profit',()=>{
 assert.deepEqual(confirmedRefund(market,'my-wallet',[receipt,receipt,{...receipt,signature:'second',amount:'20000000'},{...receipt,signature:'pending',status:'pending'},{...receipt,wallet:'other'},{...receipt,marketId:'pm_other'}]),{lamports:30000000,count:2,precision:2});
});
test('refund is unavailable before settlement, for resolved markets or without own confirmed bets',()=>{
 assert.equal(confirmedRefund({...market,chain:{...market.chain,settled:false}},'my-wallet',[receipt]),undefined);
 assert.equal(confirmedRefund({...market,status:'resolved'},'my-wallet',[receipt]),undefined);
 assert.equal(confirmedRefund(market,undefined,[receipt]),undefined);assert.equal(confirmedRefund(market,'other',[receipt]),undefined);
});
test('conflicting signatures, invalid amounts and totals above the known pool do not produce a refund figure',()=>{
 for(const amount of ['-1','1.5','nope','0','9007199254740992','30000001'])assert.equal(confirmedRefund(market,'my-wallet',[{...receipt,amount}]),undefined);
 assert.equal(confirmedRefund(market,'my-wallet',[receipt,{...receipt,amount:'20000000'}]),undefined);
 assert.equal(confirmedRefund(market,'my-wallet',[{...receipt,option:5}]),undefined);
 assert.deepEqual(confirmedRefund(market,'my-wallet',[{...receipt,amount:'12345678'}]),{lamports:12345678,count:1,precision:9});
});
