import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PlotHttpReadClient, parsePlotMarkets } from '../mobile/src/lib/plot-read-client.js';
const market = { id: 'm', broadcasterId: 'b', predictionId: 'p', title: null, options: [{id:'yes',label:'Sí',stake:null},{id:'no',label:null,stake:null}], twitchStatus:'resolved', winnerId:'yes', chainStatus:null, streamerFee:null, treasuryFee:null, closesAt:'2026-11-27T00:00:00Z', timeoutAt:'2026-11-28T00:00:00Z' };
test('read client requests public projection and preserves unconfirmed chain fields', async () => {
 let path = '', authorization: unknown;
 const client = new PlotHttpReadClient('https://example.test', async (url, init) => { path = url; authorization = (init.headers as Record<string,string>).authorization; return {ok:true, async json() { return { markets:[market] }; }}; });
 const rows = await client.markets();
 assert.equal(path, 'https://example.test/api/plot/v1/markets'); assert.equal(authorization, undefined);
 assert.equal(rows[0].chainStatus, null); assert.equal(rows[0].options[0].stake, null); assert.equal(rows[0].twitchStatus, 'resolved');
});
test('rejects incompatible or speculative chain data instead of treating it as confirmed', () => {
 assert.throws(() => parsePlotMarkets({ markets:[{...market, chainStatus:'resolved'}] }));
 assert.throws(() => parsePlotMarkets({ markets:[{...market, options:[{id:'yes',label:'Sí',stake:'600'}]}] }));
});
