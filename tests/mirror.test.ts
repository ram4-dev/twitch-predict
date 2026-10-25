import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { Store } from '../src/store.js';
import { Mirror, demoPrediction } from '../src/mirror.js';
import { predictionSchema } from '../src/prediction.js';
test('concurrent polls create exactly once and survive disk reload', async () => {
  const dir = await mkdtemp(`${tmpdir()}/mirror-`);
  try {
    const store = new Store(dir); await store.load(); let calls = 0;
    const mirror = new Mirror(store, { network: 'test', async create(record, persist) { calls++; record.phase = 'open'; await persist(); } });
    const p = demoPrediction();
    await Promise.all(Array.from({length:20}, () => mirror.accept(p))); await mirror.idle();
    assert.equal(calls, 1); assert.equal(Object.values(store.records)[0].phase, 'open');
    const reloaded = new Store(dir); await reloaded.load();
    assert.deepEqual(reloaded.records, store.records);
  } finally { await rm(dir, { recursive:true }); }
});
test('creation failures are durable and do not become phantom successes', async () => {
  const dir = await mkdtemp(`${tmpdir()}/mirror-`);
  try {
    const store = new Store(dir); await store.load();
    const mirror = new Mirror(store, { network:'test', async create() { throw new Error('RPC unavailable'); } });
    const record = await mirror.accept(demoPrediction()); await mirror.idle();
    assert.equal(record.phase, 'failed'); assert.equal(record.error, 'RPC unavailable');
    await mirror.accept(record.prediction); await mirror.idle(); assert.equal(Object.keys(store.records).length,1);
  } finally { await rm(dir,{recursive:true}); }
});
test('rejects expired, locked, malformed, future, and duplicate outcomes', async () => {
  const store = new Store('/unused'); const mirror = new Mirror(store, { network:'test', async create() { assert.fail('Must not create'); } });
  const p = demoPrediction();
  await assert.rejects(mirror.accept({...p,createdAt:'2000-01-01T00:00:00.000Z'}), /closed/);
  await assert.rejects(mirror.accept({...p,status:'LOCKED'}), /ACTIVE/);
  await assert.rejects(mirror.accept({...p,createdAt:new Date(Date.now()+60000).toISOString()}), /future/);
  assert.equal(predictionSchema.safeParse({...p,outcomes:[p.outcomes[0],p.outcomes[0]]}).success,false);
  assert.equal(predictionSchema.safeParse({...p,channel:'../evil'}).success,false);
});
