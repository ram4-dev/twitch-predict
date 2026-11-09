/** Plan 2 — proposals service over the session-1 Points aggregate.
 * Acceptance = publish + transition in ONE Points.proposalTransaction (single SQL transaction in cloud,
 * atomic file snapshot locally). Proposal state and receipts live in draft.proposals on the shared aggregate. */
import {type MarketActor, type MarketChannel, type CreateMarketInput, type ProposalTransaction, type PublishedMarket} from './market-contract.js';
import {ProposalDomain, ProposalError, freshProposalState, type Proposal, type ProposalLimits, type ProposalState} from './proposals.js';

export type PointsAggregate={proposalTransaction<T>(work:(draft:ProposalTransaction)=>T):Promise<T>};

/** Internal shape stored per proposal on the aggregate: the proposal plus its idempotency receipts. */
type StoredProposal=Proposal&{receipts:Record<string,{fingerprint:string;result:unknown}>};

type DraftState=ProposalState&{proposals:Record<string,StoredProposal>};

const loadState=(draft:ProposalTransaction):DraftState=>{
  // SAFETY: the aggregate stores plain JSON objects; every entry written by this service is a StoredProposal
  // (Proposal plus its receipts). Session-1 code never touches draft.proposals entries.
  const stored=draft.proposals as unknown as Record<string,StoredProposal>;
  const state=freshProposalState() as DraftState;
  for(const [id,p] of Object.entries(stored)){
    state.proposals[id]=p;
    for(const [key,r] of Object.entries(p.receipts??{}))state.receipts[key]=r;
  }
  return state;
};

const saveState=(draft:ProposalTransaction,state:DraftState)=>{
  // SAFETY: same invariant as loadState — the proposals map holds only StoredProposal JSON written here.
  const stored=draft.proposals as unknown as Record<string,StoredProposal>;
  for(const k of Object.keys(stored))delete stored[k];
  for(const [id,p] of Object.entries(state.proposals)){
    const rest=p as Proposal&{receipts?:unknown};
    stored[id]={...rest,receipts:(rest.receipts??{}) as Record<string,{fingerprint:string;result:unknown}>};
  }
};

export class ProposalService {
  private readonly domain:ProposalDomain;
  constructor(private readonly points:PointsAggregate,limits:ProposalLimits={maxPendingPerAccount:3,maxSubmissionsPerHour:5}){
    this.domain=new ProposalDomain(limits);
  }

  /** Viewer or moderator submitting a proposal from app or chat. intentId: chat eventId or app requestId. */
  async submit(args:{channel:MarketChannel;actor:MarketActor;origin:'app'|'chat';intentId:string;input:CreateMarketInput}){
    return this.points.proposalTransaction(draft=>{
      const state=loadState(draft);
      const {proposal}=this.domain.create(state,{channelId:args.channel.id,author:args.actor,origin:args.origin,intentId:args.intentId,input:args.input});
      saveState(draft,state);
      return view(proposal);
    });
  }

  async get(proposalId:string):Promise<Proposal>{
    return this.points.proposalTransaction(draft=>{
      // SAFETY: aggregate proposals map holds only StoredProposal JSON written by this service.
      const stored=(draft.proposals as unknown as Record<string,StoredProposal>)[proposalId];
      if(!stored)throw new ProposalError('PROPOSAL_NOT_FOUND','Propuesta desconocida.');
      return view(stored);
    });
  }

  async listForAuthor(accountId:string,channelId?:string){
    return this.points.proposalTransaction(draft=>{
      // SAFETY: aggregate proposals map holds only StoredProposal JSON written by this service.
      const stored=draft.proposals as unknown as Record<string,StoredProposal>;
      return Object.values(stored).filter(p=>p.authorAccountId===accountId&&(!channelId||p.channelId===channelId))
        .sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(view);
    });
  }

  async listForChannel(channelId:string,status?:Proposal['status']){
    return this.points.proposalTransaction(draft=>{
      // SAFETY: aggregate proposals map holds only StoredProposal JSON written by this service.
      const stored=draft.proposals as unknown as Record<string,StoredProposal>;
      return Object.values(stored).filter(p=>p.channelId===channelId&&(!status||p.status===status))
        .sort((a,b)=>a.createdAt.localeCompare(b.createdAt)).map(view);
    });
  }

  async withdraw(args:{proposalId:string;actor:MarketActor;intentId:string}){
    return this.points.proposalTransaction(draft=>{
      const state=loadState(draft);
      const {proposal,replayed}=this.domain.transition(state,{...args,action:'withdraw',isChannelOwner:false});
      saveState(draft,state);
      return {...view(proposal),replayed};
    });
  }

  async reject(args:{proposalId:string;actor:MarketActor;isChannelOwner:boolean;intentId:string;reason?:string}){
    return this.points.proposalTransaction(draft=>{
      const state=loadState(draft);
      const {proposal,replayed}=this.domain.transition(state,{...args,action:'reject'});
      saveState(draft,state);
      return {...view(proposal),replayed};
    });
  }

  /**
   * Owner/moderator direct creation (chat or app) through the same atomic aggregate transaction:
   * synchronous publishOnDraft with a deterministic requestId derived from the chat eventId (replay-safe:
   * the same event reproduces the same market id and receipt).
   */
  async createDirectly(args:{channel:MarketChannel;actor:MarketActor;input:CreateMarketInput;eventId:string}){
    return this.points.proposalTransaction(draft=>
      draft.publishMarket({actor:args.actor,channel:args.channel,input:args.input,requestId:`plot-create:${args.channel.id}:${args.eventId}`}));
  }

  /**
   * Owner-only. The whole accept runs inside one Points.proposalTransaction: the synchronous
   * draft.publishMarket validates owner/mod capabilities, allocates the persistent shortId, and the
   * transition commits in the same aggregate write. Crash between publish and commit rolls back both;
   * the deterministic requestId ("proposal-accept:<id>:<version>") yields a deterministic market id,
   * so a retried acceptance after a crash reproduces the same market receipt instead of a second one.
   * A transition loss (withdrawn/rejected between tabs) throws before any publication: no orphan.
   */
  async accept(args:{proposalId:string;actor:MarketActor;isChannelOwner:boolean;intentId:string;editedInput?:CreateMarketInput;
    channel:MarketChannel}){
    return this.points.proposalTransaction(draft=>{
      const state=loadState(draft);
      const current=state.proposals[args.proposalId];
      if(!current)throw new ProposalError('PROPOSAL_NOT_FOUND','Propuesta desconocida.');
      if(current.status==='accepted'){
        // Replay: acceptance already committed; return the stored proposal with its market. No new publication.
        return {...view(current),replayed:true as const};
      }
      // Owner check inside the lock (the passed isChannelOwner is advisory; domain enforces again below).
      const finalInput=args.editedInput??current.input;
      let published:PublishedMarket|undefined;
      // Publish only while still pending; a losing race never publishes.
      if(current.status==='pending'){
        // Authorization BEFORE publication: a non-owner never reaches publishOnDraft (its own capability
        // check stays as defense in depth). Surface a typed 403 instead of a 500.
        if(!args.isChannelOwner)throw new ProposalError('PROPOSAL_FORBIDDEN','Solo el dueño del canal puede aceptar propuestas.');
        const requestId=`proposal-accept:${args.proposalId}:${current.version}`;
        published=draft.publishMarket({actor:args.actor,channel:args.channel,input:finalInput,requestId});
        // Transition inside the same draft; if it loses to withdraw/reject it throws AFTER publish, so we
        // surface the race instead of silently keeping the market: the caller sees PROPOSAL_NOT_PENDING
        // and the draft rollback removes the publication from the aggregate.
      }
      const {proposal,replayed}=this.domain.transition(state,{proposalId:args.proposalId,action:'accept',actor:args.actor,
        isChannelOwner:args.isChannelOwner,intentId:args.intentId,editedInput:args.editedInput});
      if(published){proposal.acceptedMarketKey=published.key;proposal.acceptedMarketId=published.id;}
      saveState(draft,state);
      return {...view(proposal),replayed};
    });
  }
}

const view=(p:Proposal):Proposal=>({...p});
