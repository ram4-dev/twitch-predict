import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {cloudConfig} from '../src/cloud/config.js';
test('HTTP auth origin is limited to explicit test networks and loopback',()=>{
 const env={DATABASE_URL:'postgresql://localhost/test',AUTH_ORIGIN:'http://127.0.0.1:18080',PLOT_E2E_LOCAL_ORIGIN:'true',PLOT_TEST_NETWORK:'devnet'};
 assert.equal(cloudConfig(env).origin,env.AUTH_ORIGIN);
 assert.throws(()=>cloudConfig({...env,PLOT_E2E_LOCAL_ORIGIN:'false'}));
 assert.throws(()=>cloudConfig({...env,PLOT_TEST_NETWORK:'mainnet'}));
 assert.throws(()=>cloudConfig({...env,AUTH_ORIGIN:'http://example.com'}));
});
