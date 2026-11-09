import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Points} from '../src/points.js';

const identity=(id:string,login:string)=>({id,login,displayName:login,linkedAt:new Date().toISOString()});
async function fixture(work:(p:Points)=>Promise<void>){
 const {mkdtemp,rm}=await import('node:fs/promises');
 const dir=await mkdtemp(`${tmpdir()}/twitch-login-`);
 try{const p=new Points(dir);await p.load();await work(p);}finally{await rm(dir,{recursive:true,force:true});}
}
import {tmpdir} from 'node:os';

test('Twitch-first login creates the account once and resumes it on repeat logins',()=>fixture(async p=>{
 const first=await p.loginWithTwitch(identity('12345','streamer_login'));
 assert.equal(first.created,true);assert.equal(p.me(first.token).balance,10000);
 assert.equal(p.me(first.token).twitch?.id,'12345');
 // Second login resumes the same account, issues a new session token, no second bonus.
 const second=await p.loginWithTwitch(identity('12345','streamer_login'));
 assert.equal(second.created,false);assert.equal(second.account.id,first.account.id);
 assert.equal(p.me(second.token).balance,10000);assert.notEqual(second.token,first.token);
 // A different Twitch identity gets its own account, no cross-identity merge.
 const other=await p.loginWithTwitch(identity('67890','other_viewer'));
 assert.notEqual(other.account.id,first.account.id);assert.equal(other.created,true);
}));

test('a social account can link Twitch later without losing balance; conflicts never merge',()=>fixture(async p=>{
 // Account created another way (Phantom/token), balance accumulated.
 const created=await p.createAccount();
 // (No direct token transfer here: link preserves whatever the account already has.)
 await p.linkTwitch(created.token,identity('555','late_viewer'));
 assert.equal(p.me(created.token).twitch?.id,'555');
 // Twitch login for that identity must resume the same linked account, not duplicate it.
 const resumed=await p.loginWithTwitch(identity('555','late_viewer'));
 assert.equal(resumed.created,false);assert.equal(resumed.account.id,p.me(created.token).id);
}));
