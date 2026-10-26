import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {contentSecurityPolicy} from '../src/content-security-policy.js';
test('CSP permits exactly the installed Paper Shaders stylesheet and preserves strict script sources',async()=>{
 const source=await readFile(new URL('../node_modules/@paper-design/shaders/dist/shader-mount.js',import.meta.url),'utf8');
 const css=source.match(/const defaultStyle = `([\s\S]*?)`;/)?.[1];assert.ok(css,'Review the dependency stylesheet if its injection changes');
 const hash=createHash('sha256').update(css).digest('base64');
 const styles=contentSecurityPolicy.split(';').find(v=>v.trim().startsWith('style-src'))?.trim();
 assert.equal(styles,`style-src 'self' 'sha256-${hash}'`);
 assert.ok(contentSecurityPolicy.includes("script-src 'self';"));assert.ok(!contentSecurityPolicy.includes('unsafe-inline'));assert.ok(!contentSecurityPolicy.includes('unsafe-eval'));
});
