import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('native app packages the canonical logo and launcher artwork',async()=>{
  for(const [native,canonical] of [['mobile/assets/brand/plot-logo-transparent.png','public/brand/plot-logo-transparent.png'],['mobile/assets/plot-icon.png','public/brand/plot-logo-128.png'],['mobile/assets/brand/mascot-watching.png','public/brand/mascot-watching.png']])assert.deepEqual(await readFile(native),await readFile(canonical));
});
