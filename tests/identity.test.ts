import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {Points} from '../src/points.js';

const identity=(id:string,login:string)=>({id,login,displayName:login,linkedAt:new Date().toISOString()});
async function fixture(work:(p:Points)=>Promise<void>){
 const dir=await mkdtemp(join(tmpdir(),'points-identity-'));
 try{const p=new Points(dir);await p.load();await work(p);}finally{await rm(dir,{recursive:true,force:true});}
}

test('Twitch is a first-class login: no wallet required for points, bets or claims',()=>fixture(async p=>{
 const viewer=await p.createAccount();await p.linkTwitch(viewer.token,identity('777','social_viewer'));
 const m=await p.accept((await import('../src/mirror.js')).demoPrediction(),true);
 await p.bet(viewer.token,m.key,'victory',500,randomUUID());
 assert.equal(p.me(viewer.token).balance,9500);
 await p.demoResolve(m.key,'victory');
 const claim=await p.claim(viewer.token,m.key,randomUUID()) as {paid:number};
 assert.equal(claim.paid,500);assert.equal(p.me(viewer.token).balance,10000);
 assert.equal(p.me(viewer.token).wallet,null);
}));

test('link/unlink preserves the accountId; conflicts never merge or steal identities',()=>fixture(async p=>{
 const first=await p.createAccount();await p.linkTwitch(first.token,identity('777','shared_login'));
 const firstId=p.me(first.token).id;
 // Unlink keeps the account, balance and bets; only Twitch capabilities go away.
 await p.unlinkTwitch(first.token);
 assert.equal(p.me(first.token).id,firstId);assert.equal(p.me(first.token).twitch,null);
 await p.linkTwitch(first.token,identity('777','shared_login'));
 assert.equal(p.me(first.token).id,firstId);
 // A different Plot account cannot claim an identity owned by someone else.
 const other=await p.createAccount();
 await assert.rejects(p.linkTwitch(other.token,identity('777','shared_login')),/otra cuenta de Plot/);
 // Changing the Twitch identity on the same account requires unlinking first.
 await assert.rejects(p.linkTwitch(first.token,identity('888','other_login')),/otra cuenta de Twitch/);
}));

test('re-linking a removed Twitch identity does not resurrect streamer registration',()=>fixture(async p=>{
 const streamer=await p.createAccount();
 await p.linkTwitch(streamer.token,identity('999','channel_owner'));
 await p.unlinkTwitch(streamer.token);
 assert.equal(p.channels().includes('channel_owner'),false);
 assert.equal(Object.values(p.botChannels()).includes('channel_owner'),false);
 await p.linkTwitch(streamer.token,identity('999','channel_owner'));
 // Without a wallet the viewer path never claims the channel again.
 assert.equal(p.channels().includes('channel_owner'),false);
}));
