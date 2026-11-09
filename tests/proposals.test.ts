import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ProposalDomain,ProposalError,freshProposalState} from '../src/proposals.js';
import {ProposalService} from '../src/proposals-service.js';
import {Points} from '../src/points.js';

const actor=(accountId:string,twitchId?:string)=>({accountId,twitchId});
const channel={id:'123',login:'demo_streamer'};
const input={title:'¿Gana el equipo rojo?',options:['Sí','No'],durationSeconds:120};

// Real aggregate: Points with local persistence (temp dir), exactly like production offchain mode.
async function fixture(){
  const dir=await mkdtemp(join(tmpdir(),'plot-prop-'));
  const points=new Points(dir);await points.load();
  // Real accounts through the public API: author (viewer) and owner (broadcaster of the channel).
  const author=await points.loginWithTwitch({id:'555',login:'viewer_author',displayName:'Viewer',linkedAt:new Date().toISOString()});
  const owner=await points.loginWithTwitch({id:'123',login:'demo_streamer',displayName:'Owner',linkedAt:new Date().toISOString()});
  return {dir,points,service:new ProposalService(points),authorId:author.account.id,ownerId:owner.account.id};
}

test('proposal content validation: title, options, duplicates, duration',()=>{
  const state=freshProposalState();const domain=new ProposalDomain();
  assert.throws(()=>domain.create(state,{channelId:channel.id,author:actor('a1'),origin:'app',intentId:'i1',input:{title:'',options:['A','B']}}),ProposalError);
  assert.throws(()=>domain.create(state,{channelId:channel.id,author:actor('a1'),origin:'app',intentId:'i2',input:{title:'?',options:['A']}}),ProposalError);
  assert.throws(()=>domain.create(state,{channelId:channel.id,author:actor('a1'),origin:'app',intentId:'i3',input:{title:'?',options:['A','A']}}),ProposalError);
  assert.throws(()=>domain.create(state,{channelId:channel.id,author:actor('a1'),origin:'app',intentId:'i4',input:{title:'?',options:['A','B'],durationSeconds:10}}),ProposalError);
  const {proposal}=domain.create(state,{channelId:channel.id,author:actor('a1'),origin:'app',intentId:'i5',input});
  assert.equal(proposal.status,'pending');
});

test('receipts: same event replay returns original proposal; changed payload rejected',()=>{
  const state=freshProposalState();const domain=new ProposalDomain();
  const {proposal}=domain.create(state,{channelId:channel.id,author:actor('a1'),origin:'chat',intentId:'evt-1',input});
  const replay=domain.create(state,{channelId:channel.id,author:actor('a1'),origin:'chat',intentId:'evt-1',input});
  assert.equal(replay.proposal.id,proposal.id);
  assert.throws(()=>domain.create(state,{channelId:channel.id,author:actor('a1'),origin:'chat',intentId:'evt-1',input:{...input,title:'Otra cosa'}}),ProposalError);
});

test('limits: 3 pending per account/channel, 5 submissions per hour (sliding window)',()=>{
  const state=freshProposalState();const domain=new ProposalDomain({maxPendingPerAccount:3,maxSubmissionsPerHour:5});
  const t=Date.now();const now=()=>new Date(t).toISOString();
  const old=t-7_200_000;
  for(let i=0;i<3;i++)domain.create(state,{channelId:channel.id,author:actor('a1'),origin:'app',intentId:`p${i}`,input:{...input,title:`Q${i}`},now:()=>new Date(old).toISOString()});
  assert.throws(()=>domain.create(state,{channelId:channel.id,author:actor('a1'),origin:'app',intentId:'p4',input:{...input,title:'Q4'},now}),
    (e:ProposalError)=>e.code==='PROPOSAL_LIMIT');
  // Different channel or author is unaffected.
  domain.create(state,{channelId:'other',author:actor('a1'),origin:'app',intentId:'p5',input:{...input,title:'Q5'},now});
  domain.create(state,{channelId:channel.id,author:actor('a2'),origin:'app',intentId:'p6',input:{...input,title:'Q6'},now});
  // Sliding hour window: 5 submissions (rejecting old pendings as room is needed) pass; a 6th in the hour is blocked.
  for(let i=0;i<6;i++){
    const pendings=Object.values(state.proposals).filter(p=>p.channelId===channel.id&&p.authorAccountId==='a1'&&p.status==='pending');
    if(pendings.length>=3)domain.transition(state,{proposalId:pendings[0].id,action:'reject',actor:actor('owner'),isChannelOwner:true,intentId:`r-${pendings[0].id}`,now});
    if(i===5)assert.throws(()=>domain.create(state,{channelId:channel.id,author:actor('a1'),origin:'app',intentId:`h${i}`,input:{...input,title:`H${i}`},now}),
      (e:ProposalError)=>e.code==='PROPOSAL_LIMIT');
    else domain.create(state,{channelId:channel.id,author:actor('a1'),origin:'app',intentId:`h${i}`,input:{...input,title:`H${i}`},now});
  }
});

test('transitions: only owner reviews, only author withdraws, terminal never returns to pending',()=>{
  const state=freshProposalState();const domain=new ProposalDomain();
  const {proposal}=domain.create(state,{channelId:channel.id,author:actor('a1'),origin:'app',intentId:'t0',input});
  assert.throws(()=>domain.transition(state,{proposalId:proposal.id,action:'reject',actor:actor('a2'),isChannelOwner:false,intentId:'t1'}),ProposalError);
  assert.throws(()=>domain.transition(state,{proposalId:proposal.id,action:'withdraw',actor:actor('a2'),isChannelOwner:false,intentId:'t2'}),ProposalError);
  const {proposal:rejected}=domain.transition(state,{proposalId:proposal.id,action:'reject',actor:actor('owner'),isChannelOwner:true,intentId:'t3',reason:'Fuera de tema'});
  assert.equal(rejected.status,'rejected');assert.equal(rejected.rejectionReason,'Fuera de tema');
  assert.throws(()=>domain.transition(state,{proposalId:proposal.id,action:'accept',actor:actor('owner'),isChannelOwner:true,intentId:'t4'}),
    (e:ProposalError)=>e.code==='PROPOSAL_NOT_PENDING');
});

test('service: viewer submits, owner accepts -> exactly one published market on the shared aggregate',async()=>{
  const {dir,points,service,ownerId}=await fixture();
  try{
    const proposal=await service.submit({channel,actor:actor('a1'),origin:'app',intentId:'s1aaaaaaaa',input});
    assert.equal(proposal.status,'pending');
    // Owner publishes with the aggregate transaction: same document as points.
    const result=await service.accept({proposalId:proposal.id,actor:actor(ownerId,'123'),isChannelOwner:true,intentId:'acc-1aaaaaaaa',channel});
    assert.equal(result.status,'accepted');
    assert.ok(result.acceptedMarketKey?.startsWith('plot:demo_streamer:'));
    // The market exists on the Points aggregate (same document), not a parallel store.
    assert.ok(points.market(result.acceptedMarketKey!));
    // Persisted to the aggregate file.
    const raw=await readFile(join(dir,'points.json'),'utf8');
    const parsed=JSON.parse(raw) as {proposals:Record<string,{status:string}>;markets:Record<string,unknown>};
    assert.equal(parsed.proposals[proposal.id].status,'accepted');
    assert.ok(parsed.markets[result.acceptedMarketKey!]);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('service: double accept replays the same receipt and creates no second market',async()=>{
  const {dir,points,service,ownerId}=await fixture();
  try{
    const {id}=await service.submit({channel,actor:actor('a1'),origin:'app',intentId:'s1aaaaaaaa',input});
    const owner=actor(ownerId,'123');
    const [first,second]=await Promise.all([
      service.accept({proposalId:id,actor:owner,isChannelOwner:true,intentId:'acc-1aaaaaaaa',channel}),
      service.accept({proposalId:id,actor:owner,isChannelOwner:true,intentId:'acc-2aaaaaaaa',channel}),
    ]);
    assert.equal(first.acceptedMarketId,second.acceptedMarketId);
    assert.ok(first.replayed===true||second.replayed===true);
    assert.equal(Object.values(points.markets()).filter(m=>m.source==='plot').length,1);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('service: accept concurrent with withdraw — single winner, no orphaned market',async()=>{
  const {dir,points,service,ownerId}=await fixture();
  try{
    const {id}=await service.submit({channel,actor:actor('a1'),origin:'app',intentId:'s1aaaaaaaa',input});
    const results=await Promise.allSettled([
      service.accept({proposalId:id,actor:actor(ownerId,'123'),isChannelOwner:true,intentId:'acc-1aaaaaaaa',channel}),
      service.withdraw({proposalId:id,actor:actor('a1'),intentId:'w1aaaaaaaaaaa'}),
    ]);
    const fulfilled=results.filter(r=>r.status==='fulfilled').map(r=>(r as {value:{status?:string;replayed?:boolean}}).value);
    const rejected=results.filter(r=>r.status==='rejected').map(r=>(r as {reason:ProposalError}).reason);
    assert.equal(fulfilled.length,1);
    const winner=fulfilled[0];
    const plotMarkets=Object.values(points.markets()).filter(m=>m.source==='plot');
    if(winner.status==='accepted'){assert.equal(plotMarkets.length,1);}
    else{assert.equal(winner.status,'withdrawn');assert.equal(plotMarkets.length,0);assert.equal(rejected[0]?.code,'PROPOSAL_NOT_PENDING');}
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('service: withdraw by non-author is forbidden and proposal stays pending',async()=>{
  const {dir,service}=await fixture();
  try{
    const {id}=await service.submit({channel,actor:actor('a1'),origin:'app',intentId:'s1aaaaaaaa',input});
    await assert.rejects(service.withdraw({proposalId:id,actor:actor('a2'),intentId:'w1aaaaaaaaaaa'}),ProposalError);
    const after=await service.get(id);
    assert.equal(after.status,'pending');
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('service: acceptance with edit keeps original input and publishes the edited content',async()=>{
  const {dir,points,service,ownerId}=await fixture();
  try{
    const {id}=await service.submit({channel,actor:actor('a1'),origin:'app',intentId:'s1aaaaaaaa',input});
    const result=await service.accept({proposalId:id,actor:actor(ownerId,'123'),isChannelOwner:true,intentId:'acc-1aaaaaaaa',channel,
      editedInput:{title:'¿Gana el equipo rojo hoy?',options:['Sí','No'],durationSeconds:120}});
    const stored=await service.get(id);
    assert.equal(stored.input.title,'¿Gana el equipo rojo?');
    assert.equal(stored.editedInput?.title,'¿Gana el equipo rojo hoy?');
    assert.equal(points.market(result.acceptedMarketKey!).prediction.title,'¿Gana el equipo rojo hoy?');
  }finally{await rm(dir,{recursive:true,force:true});}
});
