/** Plan 2 — proposals service. Atomic acceptance: publish through the injected gateway and persist the transition in one storage transaction (nested Documents.update shares one SQL transaction). Local storage keeps replayable receipts so a crash between publish and transition never duplicates a market or strands an acceptance. */
import {mkdir, readFile, writeFile, rename} from 'node:fs/promises';
import {dirname} from 'node:path';
import {type MarketActor, type MarketChannel, type CreateMarketInput} from './market-contract.js';
import {ProposalDomain, ProposalError, freshProposalState,
  type Proposal, type ProposalLimits, type ProposalOrigin, type ProposalState} from './proposals.js';

/** Session 2 owns this seam. The integration adapter wraps Plan 1 createMarket(token, channelId, input, requestId) with the owner's session token. */
export interface ProposalMarketGateway {
  publishMarket(args:{token:string;channel:MarketChannel;input:CreateMarketInput;actor:MarketActor;requestId:string}):
    Promise<{key:string;id:string}>;
}

export interface ProposalStore {
  read():Promise<ProposalState>;
  /** Runs work against a locked draft; concurrent writers serialize and see committed results. */
  update<R>(work:(state:ProposalState)=>R|Promise<R>):Promise<R>;
}

export const localProposalStore=(file:string):ProposalStore=>{
  // Minimal JSON-file store mirroring Points persistence semantics (temp+rename, serialized queue).
  let queue:Promise<unknown>=Promise.resolve();
  let cache:ProposalState|undefined;
  const load=async()=>{if(cache)return cache;try{cache=JSON.parse(await readFile(file,'utf8')) as ProposalState;}catch{cache=freshProposalState();}return cache;};
  return {
    async read(){return structuredClone(await load());},
    async update<R>(work:(state:ProposalState)=>R|Promise<R>):Promise<R>{
      const task=queue.then(async()=>{
        const state=await load();const result=await work(state);
        await mkdir(dirname(file),{recursive:true,mode:0o700});
        await writeFile(`${file}.tmp`,JSON.stringify(state),{mode:0o600});await rename(`${file}.tmp`,file);
        return result;
      });
      queue=task.catch(()=>undefined);return task;
    },
  };
};

export const cloudProposalStore=(documents:Pick<import('./cloud/documents.js').Documents,'read'|'update'>):ProposalStore=>({
  read:()=>documents.read('proposals',freshProposalState),
  update:<R,>(work:(state:ProposalState)=>R|Promise<R>)=>documents.update('proposals',freshProposalState,work).then(r=>r.result),
});

export type ProposalView=Proposal;

export class ProposalService {
  private readonly limits:ProposalLimits;
  private domain:ProposalDomain;
  constructor(private readonly store:ProposalStore,private readonly gateway:ProposalMarketGateway,
    limits:ProposalLimits={maxPendingPerAccount:3,maxSubmissionsPerHour:5}){
    this.limits=limits;this.domain=new ProposalDomain(limits);
  }

  /** Viewer or moderator submitting a proposal from app or chat. intentId: chat eventId or app requestId. */
  async submit(args:{channel:MarketChannel;actor:MarketActor;origin:ProposalOrigin;intentId:string;input:CreateMarketInput}){
    return this.store.update(state=>{
      const {proposal}=this.domain.create(state,{channelId:args.channel.id,author:args.actor,origin:args.origin,intentId:args.intentId,input:args.input});
      return view(proposal);
    });
  }

  async listForAuthor(accountId:string,channelId?:string){
    const state=await this.store.read();
    return Object.values(state.proposals).filter(p=>p.authorAccountId===accountId&&(!channelId||p.channelId===channelId))
      .sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(view);
  }

  async listForChannel(channelId:string,status?:Proposal['status']){
    const state=await this.store.read();
    return Object.values(state.proposals).filter(p=>p.channelId===channelId&&(!status||p.status===status))
      .sort((a,b)=>a.createdAt.localeCompare(b.createdAt)).map(view);
  }

  async get(proposalId:string):Promise<Proposal>{
    const state=await this.store.read();
    const proposal=state.proposals[proposalId];
    if(!proposal)throw new ProposalError('PROPOSAL_NOT_FOUND','Propuesta desconocida.');
    return view(proposal);
  }

  async withdraw(args:{proposalId:string;actor:MarketActor;intentId:string}){
    return this.store.update(state=>{
      const {proposal,replayed}=this.domain.transition(state,{...args,action:'withdraw',isChannelOwner:false});
      return {...view(proposal),replayed};
    });
  }

  async reject(args:{proposalId:string;actor:MarketActor;isChannelOwner:boolean;intentId:string;reason?:string}){
    return this.store.update(state=>{
      const {proposal,replayed}=this.domain.transition(state,{...args,action:'reject'});
      return {...view(proposal),replayed};
    });
  }

  /**
   * Owner-only. Deterministic publication requestId bound to the proposal (never to the caller intent), so two
   * concurrent accepts race on the transition, not on the market: exactly one wins and publishes; the loser replays
   * the winner's receipt. The gateway runs inside the store lock: nested Documents.update joins one SQL transaction,
   * and the local store serializes. A transition loss after publish is surfaced, never hidden.
   */
  async accept(args:{token:string;proposalId:string;actor:MarketActor;isChannelOwner:boolean;intentId:string;editedInput?:CreateMarketInput;
    channel:MarketChannel}){
    const requestId=`proposal-accept:${args.proposalId}`;
    return this.store.update(async state=>{
      const current=state.proposals[args.proposalId];
      if(!current)throw new ProposalError('PROPOSAL_NOT_FOUND','Propuesta desconocida.');
      if(current.status==='accepted'){
        // Replay: the acceptance already committed; return the stored proposal and its market. No new publication.
        return {...view(current),replayed:true as const};
      }
      if(!args.isChannelOwner)throw new ProposalError('PROPOSAL_FORBIDDEN','Solo el dueño del canal puede revisar propuestas.');
      const finalInput=args.editedInput??current.input;
      // Publication happens inside the lock while the proposal is still pending: the deterministic requestId
      // (proposal + version at publish time) makes a crash-between publish-and-commit recoverable without a
      // second market; the transition then commits in the same store update.
      const published=await this.gateway.publishMarket({token:args.token,channel:args.channel,input:finalInput,actor:args.actor,
        requestId:`${requestId}:${current.version}`});
      const {proposal,replayed}=this.domain.transition(state,{proposalId:args.proposalId,action:'accept',actor:args.actor,
        isChannelOwner:args.isChannelOwner,intentId:args.intentId,editedInput:args.editedInput});
      if(!proposal.acceptedMarketKey){proposal.acceptedMarketKey=published.key;proposal.acceptedMarketId=published.id;}
      return {...view(proposal),replayed};
    });
  }
}

const view=(p:Proposal):ProposalView=>({...p});
