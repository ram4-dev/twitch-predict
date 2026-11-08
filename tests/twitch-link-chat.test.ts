import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {Points,CHAT_BET_POINTS} from '../src/points.js';
import {demoPrediction} from '../src/mirror.js';

async function fixture(run:(points:Points)=>Promise<void>){const dir=await mkdtemp(`${tmpdir()}/points-link-test-`);try{const p=new Points(dir);await p.load();await run(p);}finally{await rm(dir,{recursive:true,force:true});}}
const identity=(id:string,login:string)=>({id,login,displayName:login,linkedAt:new Date().toISOString()});

test('a viewer links Twitch without a wallet; a wallet account keeps claiming the channel',()=>fixture(async p=>{
  const viewer=await p.createAccount();
  const linked=await p.linkTwitch(viewer.token,identity('777','viewer_one'));
  assert.equal(linked.twitch?.login,'viewer_one');
  // No channel registration: viewers must not claim channels or add watch targets.
  assert.deepEqual(p.channels().filter(c=>c==='viewer_one'),[]);
  assert.equal(p.me(viewer.token).twitch?.id,'777');
  // A second Plot account cannot steal the same Twitch identity.
  const other=await p.createAccount();
  await assert.rejects(p.linkTwitch(other.token,identity('777','viewer_one')),/(otra cuenta de Plot|otra wallet)/);
  // Wallet-backed accounts keep the streamer path: channel claimed into the watch list.
  const streamer=await p.walletLogin(`wallet-${randomUUID()}`);
  const walletAccount=p.me(streamer.token);assert.ok(walletAccount.wallet);
  const linkedStreamer=await p.linkTwitch(streamer.token,identity('888','streamer_one'));
  assert.deepEqual(p.channels().filter(c=>c==='streamer_one'),['streamer_one']);
  assert.ok(linkedStreamer.channel);
}));

test('chat bets debit the internal balance once per prediction and option',()=>fixture(async p=>{
  const viewer=await p.createAccount();await p.linkTwitch(viewer.token,identity('777','chat_viewer'));
  const m=await p.accept(demoPrediction(),true);
  const first=await p.chatBet(...([] as const),'777',m.key,'victory',`chat:777:${m.key}:victory`);
  assert.equal(first.amount,CHAT_BET_POINTS);
  assert.equal(p.me(viewer.token).balance,10_000-CHAT_BET_POINTS);
  // Idempotent: the same chat command replayed by Twitch must not double-debit.
  const replay=await p.chatBet('777',m.key,'victory',`chat:777:${m.key}:victory`) as {betId:string};
  assert.equal(replay.betId,first.betId);
  assert.equal(p.me(viewer.token).balance,10_000-CHAT_BET_POINTS);
  // A different option is a separate bet.
  await p.chatBet('777',m.key,'defeat',`chat:777:${m.key}:defeat`);
  assert.equal(p.me(viewer.token).balance,10_000-2*CHAT_BET_POINTS);
  // Unlinked chatters are told to link, not silently ignored.
  await assert.rejects(p.chatBet('999',m.key,'victory',`chat:999:${m.key}:victory`),/Vinculá tu cuenta de Twitch/);
  // Closed markets refuse chat bets.
  await p.demoResolve(m.key,'victory');
  await assert.rejects(p.chatBet('777',m.key,'victory',`chat:777:${m.key}:victory2`),/cerrada/);
}));
