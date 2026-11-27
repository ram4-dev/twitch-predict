/** Run against an isolated provider fixture: PLOT_READ_URL=<portless URL> npx tsx mobile/scripts/check-plot-read.ts */
import { strict as assert } from 'node:assert';
import { PlotHttpReadClient } from '../src/lib/plot-read-client.js';
const base = process.env.PLOT_READ_URL;
if (!base) throw new Error('PLOT_READ_URL is required');
const markets = await new PlotHttpReadClient(base).markets();
assert.ok(markets.length > 0, 'fixture endpoint must contain a market');
for (const market of markets) {
  assert.equal(market.chainStatus, null);
  assert.equal(market.streamerFee, null);
  assert.equal(market.treasuryFee, null);
  assert.ok(market.options.every(option => option.stake === null));
}
console.log(`Validated ${markets.length} public fixture markets; chain state remains unconfirmed.`);
