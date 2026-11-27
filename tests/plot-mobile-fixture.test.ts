import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PlotFixtureClient } from '../mobile/src/lib/plot-fixture-client.js';
function storage() { const map = new Map<string,string>(); return { async getItem(k: string) { return map.get(k) ?? null; }, async setItem(k: string,v: string) { map.set(k,v); } }; }
test('fixture recovers a pending operation across reopening without duplicating it', async () => {
 const store = storage(), first = new PlotFixtureClient(store);
 await first.login(); const buy = await first.purchase('600');
 const reopened = new PlotFixtureClient(store);
 assert.equal((await reopened.session()).pending?.id, buy.id);
 await assert.rejects(() => reopened.purchase('600'));
 await reopened.reconcile(buy.id); assert.equal((await reopened.read()).balance, '600');
 await assert.rejects(() => reopened.reconcile(buy.id));
 const bet = await reopened.predict('open','yes','600'); await reopened.reconcile(bet.id);
 assert.equal((await reopened.read()).balance, '0');
 await assert.rejects(() => reopened.predict('open','no','1'));
 const claim = await reopened.claim('resolved'); await reopened.reconcile(claim.id);
 assert.equal((await reopened.read()).balance, '960');
 await assert.rejects(() => reopened.claim('resolved'));
 const refund = await reopened.claim('cancelled'); await reopened.reconcile(refund.id);
 assert.equal((await reopened.read()).balance, '1560');
});
test('failed persistence cannot confirm or apply a purchase', async () => {
 const base = storage(); let fail = false;
 const store = { getItem: base.getItem, async setItem(k: string, v: string) { if (fail) throw new Error('storage unavailable'); await base.setItem(k, v); } };
 const client = new PlotFixtureClient(store); await client.login();
 fail = true; await assert.rejects(() => client.purchase('600'));
 fail = false; assert.equal((await client.session()).pending, null); assert.equal((await client.read()).balance, '0');
});
test('concurrent fixture requests admit only one pending intention', async () => {
 const client = new PlotFixtureClient(storage()); await client.login();
 const results = await Promise.allSettled([client.purchase('600'), client.purchase('600')]);
 assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
 assert.equal(results.filter(r => r.status === 'rejected').length, 1);
});
