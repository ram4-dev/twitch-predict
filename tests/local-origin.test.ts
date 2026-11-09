import {test} from 'node:test';
import assert from 'node:assert/strict';
import {trustedLocalHostname} from '../src/local-origin.js';
test('secure preview only trusts its configured authentication hostname',()=>{
  const origin='https://plot-dev.tailfb789f.ts.net:8443';
  assert.equal(trustedLocalHostname('plot-dev.tailfb789f.ts.net',origin),true);
  for(const name of ['evil.ts.net','plot-dev.tailfb789f.ts.net.evil.example','evil.example'])assert.equal(trustedLocalHostname(name,origin),false);
  for(const invalid of ['https://evil.example/path','https://evil.example?x=1','file://evil.example','invalid'])assert.equal(trustedLocalHostname('evil.example',invalid),false);
  assert.equal(trustedLocalHostname('100.69.138.52',origin),true);
});
