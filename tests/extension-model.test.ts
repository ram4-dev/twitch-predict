import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demoPrediction } from '../src/mirror.js';
import { parseTwitchPrediction, pointShare, countdown, totalMetric, isOpen } from '../src/extension-model.js';
test('preserves native Twitch totals, timings, winner, and IDs',()=>{
  const p=demoPrediction();const parsed=parseTwitchPrediction({...p,lockedAt:null,endedAt:null,winningOutcome:{id:'victory'},outcomes:p.outcomes.map(o=>({...o,color:'BLUE',totalPoints:12,totalUsers:2}))},'PGL');
  assert.equal(parsed.channel,'pgl');assert.equal(parsed.winningOutcomeId,'victory');assert.equal(totalMetric(parsed.outcomes,'totalPoints'),24);assert.equal(pointShare(parsed.outcomes[0],parsed.outcomes),50);
});
test('unknown counts are not invented and zero-point outcomes do not show 50/50 odds',()=>{
  const p=demoPrediction();assert.equal(totalMetric(p.outcomes,'totalPoints'),null);assert.equal(pointShare(p.outcomes[0],p.outcomes),null);
  const zero=p.outcomes.map(o=>({...o,totalPoints:0}));assert.equal(pointShare(zero[0],zero),0);
});
test('countdown closes at deadline and honors Twitch lock even before the deadline',()=>{
  const p=demoPrediction();const start=Date.parse(p.createdAt);assert.equal(countdown(p,start),'30:00');assert.equal(countdown(p,start+1800_000),'Apuestas cerradas');assert.equal(isOpen({...p,status:'LOCKED'},start),false);assert.equal(countdown({...p,status:'RESOLVED'}),'Resuelta');
});
test('untrusted prediction input is rejected before storage or market creation',()=>{
  assert.throws(()=>parseTwitchPrediction({...demoPrediction(),outcomes:[{id:'a',title:'A',totalPoints:-1}]},'pgl'));
});
