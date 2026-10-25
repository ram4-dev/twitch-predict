import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Trading, parseStake } from '../src/trading.js';
import { SolanaMarkets } from '../src/solana.js';
import { demoPrediction, Mirror } from '../src/mirror.js';
import { Store, type MarketRecord } from '../src/store.js';
test('stake conversion is exact and rejects exponent, negative, subminimum, and excessive stakes', () => {
  assert.equal(parseStake('0.123456789'), 123456789n); assert.equal(parseStake('1'), 1_000_000_000n);
  for (const value of ['1e-2', '-1', '0', '0.000000001', '1.000000001', '0.1234567891', 0.01]) assert.throws(() => parseStake(value));
});
function record(): MarketRecord { const prediction = demoPrediction(); return { key:'localnet:test:id', prediction, network:'localnet', phase:'open', signatures:[], outcomes:prediction.outcomes, createdAt:prediction.createdAt, updatedAt:prediction.createdAt }; }
test('duplicate action ID returns the original result without executing payment twice', async () => {
  const trading = new Trading(new SolanaMarkets('/unused','http://127.0.0.1:8899'),async()=>{});
  const market = record(); const id=crypto.randomUUID(); let executions=0;
  const first=await trading.run(market,id,'buy',async()=>{executions++;});
  const second=await trading.run(market,id,'buy',async()=>{executions++;});
  assert.equal(executions,1); assert.equal(first,second);
  await assert.rejects(trading.run(market,id,'claim',async()=>{}),/otra acción/);
});
test('ambiguous submitted actions stay pending and block a new transaction', async()=>{
  const trading = new Trading(new SolanaMarkets('/unused','http://127.0.0.1:8899'),async()=>{}); const market=record();
  await assert.rejects(trading.run(market,crypto.randomUUID(),'buy',async action=>{action.signatures.push('submitted');throw new Error('RPC disconnected');}),/RPC disconnected/);
  assert.equal(market.actions?.[0].status,'pending');
  await assert.rejects(trading.run(market,crypto.randomUUID(),'buy',async()=>assert.fail('Must not send')),/pendiente/);
});
test('creation and financial operations share a queue that recovers after rejected work',async()=>{
  const mirror=new Mirror(new Store('/unused'),{network:'localnet',async create(){}});const seen:string[]=[];
  const first=mirror.execute(async()=>{seen.push('first');throw new Error('rejected');});
  const second=mirror.execute(async()=>{seen.push('second');return 2;});
  await assert.rejects(first,/rejected/);assert.equal(await second,2);assert.deepEqual(seen,['first','second']);
});
