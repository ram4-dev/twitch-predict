import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createPlotSponsorRouter, type SponsorRouteService } from '../src/plot/sponsor-router.js';

test('authenticated HTTP routes bind user, validate amounts and preserve ambiguous submissions', async () => {
  let seenUser = '';
  const service: SponsorRouteService = {
    async prepare(req) { seenUser = req.userId; return {id:'one',transaction:'dHg=',lastValidBlockHeight:100,status:'prepared'}; },
    async submit() { throw new Error('RPC timeout'); },
    async getIntent(user,id) { if (user !== 'alice' || id !== 'one') throw new Error('missing'); return {id,status:'submitted',signature:'sig',lastValidBlockHeight:100}; },
    async reconcile() { return 'submitted'; },
    async expireUnsigned() { return 'prepared'; },
  };
  const app = express(); app.use(express.json()); app.use('/api/plot/v1/intents',createPlotSponsorRouter(service,async req=>req.get('Authorization') === 'test-session' ? 'alice' : null));
  const server = app.listen(0,'127.0.0.1');
  try {
    await new Promise<void>(resolve => server.once('listening',resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/plot/v1/intents`;
    assert.equal((await fetch(base,{method:'POST'})).status,401);
    const headers = {'Authorization':'test-session','Idempotency-Key':'key','Content-Type':'application/json'};
    const request = {wallet:'1'.repeat(32),operation:'place_prediction',parameters:{marketIdentity:'aa'.repeat(32),option:0,amount:'600',sequence:'0'}};
    assert.equal((await fetch(base,{method:'POST',headers,body:JSON.stringify({...request,userId:'attacker'})})).status,400);
    assert.equal((await fetch(base,{method:'POST',headers,body:JSON.stringify(request)})).status,200); assert.equal(seenUser,'alice');
    const response = await fetch(`${base}/one/submit`,{method:'POST',headers,body:JSON.stringify({transaction:'dHg='})});
    assert.equal(response.status,503); assert.deepEqual(await response.json(),{error:'submission_unconfirmed',intentId:'one'});
    const status = await fetch(`${base}/one`,{headers}); assert.equal((await status.json() as {status:string}).status,'submitted');
    assert.equal((await fetch(`${base}/one/reconcile`,{method:'POST',headers})).status,200);
  } finally { await new Promise<void>((resolve,reject)=>server.close(error=>error ? reject(error) : resolve())); }
});
