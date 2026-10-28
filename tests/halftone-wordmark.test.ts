import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hwfHex,hwfRadius,hwfStep,hwfWarmth,hwfFitSize} from '../components/ui/halftone-wordmark-footer.js';

test('halftone cell coverage preserves area and clamps invalid coverage',()=>{
 assert.equal(hwfRadius(0,6),0);assert.equal(hwfRadius(-1,6),0);assert.equal(hwfRadius(2,6),hwfRadius(1,6));
 assert.ok(Math.abs(hwfRadius(.25,6)**2/hwfRadius(1,6)**2-.25)<1e-10);
 assert.deepEqual(hwfHex('#f70'),[255,119,0]);assert.equal(hwfHex('invalid'),null);assert.equal(hwfFitSize(0,300),0);
});
test('pushed particles warm and converge back home at different refresh rates',()=>{
 for(const dt of [.5,1,2]){
  let [x,y,vx,vy]=[11,10,0,0];
  for(let i=0;i<20/dt;i++)[x,y,vx,vy]=hwfStep(x,y,vx,vy,11,10,10,10,65,dt);
  assert.ok(hwfWarmth(x,y,11,10,28)>0);
  for(let i=0;i<600/dt;i++)[x,y,vx,vy]=hwfStep(x,y,vx,vy,11,10,-1e5,-1e5,65,dt);
  assert.ok(Math.hypot(x-11,y-10)<.001);assert.ok(Math.abs(vx)+Math.abs(vy)<.001);
 }
});
