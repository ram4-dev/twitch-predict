import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ProposalDomain, ProposalError, freshProposalState} from '../src/proposals.js';
import {ProposalService, localProposalStore, type ProposalMarketGateway} from '../src/proposals-service.js';

const actor=(accountId:string,twitchId?:string)=>({accountId,twitchId});
const channel={id:'123',login:'demo_streamer'};
const input={title:'¿Gana el equipo rojo?',options:['Sí','No'],durationSeconds:120};

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
  for(let i=0;i<3;i++){domain.create(state,{channelId:channel.id,author:actor('a1'),origin:'app',intentId:`p${i}`,input:{...input,title:`Q${i}`},now:()=>new Date(old).toISOString()});}
  assert.throws(()=>domain.create(state,{channelId:channel.id,author:actor('a1'),origin:'app',intentId:'p4',input:{...input,title:'Q4'},now}),
    (e:ProposalError)=>e.code==='PROPOSAL_LIMIT');
  // Different channel or author is unaffected.
  domain.create(state,{channelId:'other',author:actor('a1'),origin:'app',intentId:'p5',input:{...input,title:'Q5'},now});
  domain.create(state,{channelId:channel.id,author:actor('a2'),origin:'app',intentId:'p6',input:{...input,title:'Q6'},now});
  // Sliding hour window: submit 5 new ones (after rejecting the old pendings one by one as room is needed) and the 6th is blocked by the hour limit.
  let n=0;
  for(let i=0;i<6;i++){
    const pendings=Object.values(state.proposals).filter(p=>p.channelId===channel.id&&p.authorAccountId==='a1'&&p.status==='pending');
    if(pendings.length>=3)domain.transition(state,{proposalId:pendings[0].id,action:'reject',actor:actor('owner'),isChannelOwner:true,intentId:`r-${pendings[0].id}`,now});
    if(i===5)assert.throws(()=>domain.create(state,{channelId:channel.id,author:actor('a1'),origin:'app',intentId:`h${i}`,input:{...input,title:`H${i}`},now}),
      (e:ProposalError)=>e.code==='PROPOSAL_LIMIT');
    else domain.create(state,{channelId:channel.id,author:actor('a1'),origin:'app',intentId:`h${i}`,input:{...input,title:`H${i}`},now});
    n++;
  }
  assert.equal(n,6);
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

test('accept with edit preserves original input and records the edited version',()=>{
  const state=freshProposalState();const domain=new ProposalDomain();
  const {proposal}=domain.create(state,{channelId:channel.id,author:actor('a1'),origin:'app',intentId:'e0',input});
  domain.transition(state,{proposalId:proposal.id,action:'accept',actor:actor('owner'),isChannelOwner:true,intentId:'e1',
    editedInput:{title:'¿Gana el equipo rojo hoy?',options:['Sí','No'],durationSeconds:120}});
  assert.equal(proposal.input.title,'¿Gana el equipo rojo?');
  assert.equal(proposal.editedInput?.title,'¿Gana el equipo rojo hoy?');
});

test('service: double accept creates exactly one market (replayed receipt, same market id)',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'plot-prop-'));try{
    const receipts=new Map<string,{key:string;id:string}>();
    const gateway:ProposalMarketGateway={publishMarket:async({requestId})=>{
      const existing=receipts.get(requestId);
      if(existing)return existing;
      const id=`m-${requestId.length}-${receipts.size}`;
      const market={key:`plot:${channel.login}:${id}`,id};receipts.set(requestId,market);return market;
    }};
    const service=new ProposalService(localProposalStore(join(dir,'proposals.json')),gateway);
    const {id}=await service.submit({channel,actor:actor('a1'),origin:'app',intentId:'s1',input});
    const owner={token:'owner-token',actor:actor('owner','123')};
    const [first,second]=await Promise.all([
      service.accept({token:owner.token,proposalId:id,actor:owner.actor,isChannelOwner:true,intentId:'acc-1',channel}),
      service.accept({token:owner.token,proposalId:id,actor:owner.actor,isChannelOwner:true,intentId:'acc-2',channel}),
    ]);
    assert.equal(first.acceptedMarketId,second.acceptedMarketId);
    assert.ok(first.version>=2);
    assert.equal(receipts.size,1); // exactly one market, deterministic requestId
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('service: accept concurrent with withdraw has a single transition winner and no orphaned acceptance',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'plot-prop-'));try{
    let published=0;
    const gateway:ProposalMarketGateway={publishMarket:async()=>{published++;return {key:`plot:${channel.login}:m${published}`,id:`m${published}`};}};
    const service=new ProposalService(localProposalStore(join(dir,'proposals.json')),gateway);
    const {id}=await service.submit({channel,actor:actor('a1'),origin:'app',intentId:'s1',input});
    const results=await Promise.allSettled([
      service.accept({token:'t',proposalId:id,actor:actor('owner','123'),isChannelOwner:true,intentId:'a1',channel}),
      service.withdraw({proposalId:id,actor:actor('a1'),intentId:'w1'}),
    ]);
    const fulfilled=results.filter(r=>r.status==='fulfilled').map(r=>(r as {value:{status:string}}).value);
    const rejected=results.filter(r=>r.status==='rejected').map(r=>(r as {reason:unknown}).reason);
    // Exactly one of the two actions wins; the loser sees the terminal state.
    assert.equal(fulfilled.length,1);
    const winner=fulfilled[0];
    if(winner.status==='accepted'){assert.equal(published,1);assert.equal((rejected[0] as ProposalError|undefined)?.code,'PROPOSAL_NOT_PENDING');}
    else{assert.equal(winner.status,'withdrawn');assert.equal(published,0);assert.equal((rejected[0] as ProposalError|undefined)?.code,'PROPOSAL_NOT_PENDING');}
  }finally{await rm(dir,{recursive:true,force:true});}
});
