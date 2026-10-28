import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {Waitlist} from '../src/waitlist.js';

test('waitlist normalizes, deduplicates concurrent signups and persists across restart',async()=>{
  const dir=await mkdtemp(`${tmpdir()}/plot-waitlist-`);
  try{
    const list=new Waitlist(dir);await list.load();
    await Promise.all([list.join(' Viewer@Example.com '),list.join('viewer@example.com'),list.join('other@example.com')]);
    const entries=JSON.parse(await readFile(`${dir}/waitlist.json`,'utf8'));
    assert.deepEqual(entries.map((entry:{email:string})=>entry.email),['viewer@example.com','other@example.com']);
    assert.equal((await stat(`${dir}/waitlist.json`)).mode&0o777,0o600);
    const restored=new Waitlist(dir);await restored.load();await restored.join('VIEWER@example.com');
    assert.equal(JSON.parse(await readFile(`${dir}/waitlist.json`,'utf8')).length,2);
    for(const email of [undefined,null,'not an email','a'.repeat(255)+'@example.com'])assert.throws(()=>restored.join(email));
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('failed writes do not confirm a signup and the queue recovers for a retry',async()=>{
  const dir=await mkdtemp(`${tmpdir()}/plot-waitlist-`);
  try{
    const list=new Waitlist(dir);await list.load();
    await list.join('existing@example.com');
    // A directory at the temporary-file path forces the actual filesystem write to fail.
    await mkdir(`${dir}/waitlist.json.tmp`);
    await assert.rejects(list.join('retry@example.com'));
    assert.equal(JSON.parse(await readFile(`${dir}/waitlist.json`,'utf8')).length,1);
    await rm(`${dir}/waitlist.json.tmp`,{recursive:true});await list.join('retry@example.com');
    assert.equal(JSON.parse(await readFile(`${dir}/waitlist.json`,'utf8')).length,2);
  }finally{await rm(dir,{recursive:true,force:true});}
});
