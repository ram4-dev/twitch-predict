import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextVersion, verifyManifest, versionFromStatus } from '../scripts/publish-cws.js';

test('increments the highest version numerically, including submitted revisions', () => {
  assert.equal(versionFromStatus('0.19.7', {
    publishedItemRevisionStatus: { distributionChannels: [{ crxVersion: '0.19.9' }, { crxVersion: '0.19.10' }] },
    submittedItemRevisionStatus: { distributionChannels: [{ crxVersion: '0.20.1' }] },
  }), '0.20.2');
  assert.equal(nextVersion(['1.2.3.9', '1.2.3']), '1.2.4');
  assert.equal(nextVersion(['2.0', '1.99.99']), '2.0.1');
});

test('fails closed on invalid, missing or exhausted versions', () => {
  assert.throws(() => nextVersion(['1.2.65535']));
  assert.throws(() => nextVersion(['1.02.3']));
  assert.throws(() => versionFromStatus('1.0.0', {}));
  assert.throws(() => versionFromStatus('1.0.0', { publishedItemRevisionStatus: {} }));
});

test('rejects local addresses and key anywhere in a store manifest', () => {
  verifyManifest({ version: '1.0.0', host_permissions: ['https://example.com/*'] });
  assert.throws(() => verifyManifest({ key: 'x' }));
  assert.throws(() => verifyManifest({ nested: ['https://app.localhost/*'] }));
  assert.throws(() => verifyManifest({ host_permissions: ['http://127.0.0.1/*'] }));
});
