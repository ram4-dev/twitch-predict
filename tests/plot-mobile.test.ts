import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { estimatePayout } from '../mobile/src/lib/plot-onchain.js';
import { plotFixtureV1 } from '../mobile/src/fixtures/plot-v1.js';
test('estimate includes own stake and separately rounded fees', () => {
  assert.equal(estimatePayout(plotFixtureV1.markets[0], 'yes', '600'), '960');
  const market = { ...plotFixtureV1.markets[0], options: [{ id: 'yes', label: 'Sí', stake: '300' }, { id: 'no', label: 'No', stake: '400' }] };
  assert.equal(estimatePayout(market, 'yes', '300', '300'), '960');
  assert.throws(() => estimatePayout(plotFixtureV1.markets[0], 'yes', '-1'));
  assert.throws(() => estimatePayout(plotFixtureV1.markets[0], 'missing', '1'));
  assert.throws(() => estimatePayout({ ...market, status: null }, 'yes', '300'));
  assert.throws(() => estimatePayout({ ...market, treasuryFee: null }, 'yes', '300'));
  assert.throws(() => estimatePayout({ ...market, options: [{ ...market.options[0], stake: null }] }, 'yes', '300'));
});
test('fixture distinguishes payout, fees and cancellation', () => {
  assert.equal(plotFixtureV1.positions[0].payout, '960');
  assert.equal(plotFixtureV1.markets[1].streamerFee, '20');
  assert.equal(plotFixtureV1.markets[1].treasuryFee, '20');
  assert.equal(plotFixtureV1.positions[1].payout, '600');
  assert.equal(plotFixtureV1.markets[2].streamerFee, '0');
});
