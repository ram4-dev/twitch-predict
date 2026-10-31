import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isDevHostPattern, toStoreManifest } from '../scripts/store-manifest.js';

test('store manifest drops the pinned key and local hosts, and can add one public origin', async () => {
  const dev = JSON.parse(await readFile('extension/manifest.json', 'utf8'));
  assert.equal(typeof dev.key, 'string');
  assert.ok(dev.host_permissions.some((pattern: string) => isDevHostPattern(pattern)));
  const store = toStoreManifest(dev, 'https://plot.example');
  assert.equal(store.key, undefined);
  assert.deepEqual(store.host_permissions, ['https://gql.twitch.tv/*', 'https://www.twitch.tv/*', 'https://plot.example/*']);
  assert.deepEqual(store.externally_connectable, { matches: ['https://plot.example/*'] });
  assert.equal(dev.key.length > 0, true);
  assert.ok(dev.host_permissions.includes('http://127.0.0.1/*'));
});

test('a store manifest without a public origin omits an empty externally_connectable block', async () => {
  const dev = JSON.parse(await readFile('extension/manifest.json', 'utf8'));
  const store = toStoreManifest(dev);
  assert.equal(store.externally_connectable, undefined);
  assert.ok(store.host_permissions!.includes('https://www.twitch.tv/*'));
  assert.equal(store.host_permissions!.some((pattern: string) => isDevHostPattern(pattern)), false);
});
