/** Plan 2 — proposals domain. Proposals never move balance or accept bets; publication happens only through the injected gateway. */
import {type MarketActor, type CreateMarketInput} from './market-contract.js';

export type ProposalStatus='pending'|'accepted'|'rejected'|'withdrawn';
export type ProposalOrigin='app'|'chat';

export type Proposal = {
  id:string; shortId:string; channelId:string; authorAccountId:string;
  origin:ProposalOrigin; input:CreateMarketInput; status:ProposalStatus; version:number;
  createdAt:string; reviewedAt?:string; reviewerAccountId?:string;
  rejectionReason?:string; editedInput?:CreateMarketInput;
  acceptedMarketKey?:string; acceptedMarketId?:string;
};

export type ProposalLimits={maxPendingPerAccount:number;maxSubmissionsPerHour:number};
export const DEFAULT_PROPOSAL_LIMITS:ProposalLimits={maxPendingPerAccount:3,maxSubmissionsPerHour:5};

export type ProposalState = {
  version:1;
  proposals:Record<string,Proposal>;
  /** Stable receipt per intention: chat eventId or app requestId. Replay returns the original result. */
  receipts:Record<string,{fingerprint:string;result:unknown}>;
};

export const freshProposalState=():ProposalState=>({version:1,proposals:{},receipts:{}});

export const proposalReceiptId=(channelId:string,origin:ProposalOrigin,intentId:string)=>`proposal:${channelId}:${origin}:${intentId}`;

export type ProposalErrorCode =
  | 'PROPOSAL_INVALID'        // rejected content (validation)
  | 'PROPOSAL_LIMIT'          // rate or pending limits
  | 'PROPOSAL_NOT_FOUND'
  | 'PROPOSAL_NOT_PENDING'
  | 'PROPOSAL_FORBIDDEN';     // wrong actor for the action

export class ProposalError extends Error {
  constructor(readonly code:ProposalErrorCode,message:string){super(message);}
}

const MIN_OPTIONS=2,MAX_OPTIONS=6,MAX_TITLE=140,MAX_OPTION=60,MAX_REASON=280;

/** Same content validation the owner/moderator direct-creation path uses (Plan 1 rules). */
export function validateProposalInput(input:CreateMarketInput){
  const title=typeof input.title==='string'?input.title.trim():'';
  if(!title||title.length>MAX_TITLE)throw new ProposalError('PROPOSAL_INVALID',`La pregunta debe tener entre 1 y ${MAX_TITLE} caracteres.`);
  const options=Array.isArray(input.options)?input.options.map(o=>typeof o==='string'?o.trim():''):[];
  if(options.length<MIN_OPTIONS||options.length>MAX_OPTIONS)throw new ProposalError('PROPOSAL_INVALID',`Ingresá entre ${MIN_OPTIONS} y ${MAX_OPTIONS} opciones distintas.`);
  if(options.some(o=>!o||o.length>MAX_OPTION))throw new ProposalError('PROPOSAL_INVALID',`Cada opción debe tener entre 1 y ${MAX_OPTION} caracteres.`);
  if(new Set(options.map(o=>o.toLocaleLowerCase())).size!==options.length)throw new ProposalError('PROPOSAL_INVALID','Las opciones deben ser distintas entre sí.');
  const durationSeconds=input.durationSeconds===undefined?undefined:Number(input.durationSeconds);
  if(durationSeconds!==undefined&&(!Number.isInteger(durationSeconds)||durationSeconds<30||durationSeconds>86400))throw new ProposalError('PROPOSAL_INVALID','La duración debe estar entre 30 y 86400 segundos.');
  return {title,options,durationSeconds};
}

/** Pure decision core; persistence adapters wrap this inside their own atomic transactions. */
export class ProposalDomain {
  constructor(private readonly limits:ProposalLimits=DEFAULT_PROPOSAL_LIMITS){}

  /** Role decision for !plot crear lives in the chat adapter (Plan 1 contract); the domain only registers the proposal outcome. */
  create(state:ProposalState,args:{channelId:string;author:MarketActor;origin:ProposalOrigin;intentId:string;input:CreateMarketInput;now?:()=>string}):{proposal:Proposal}{
    const {channelId,author,origin,intentId}=args;
    if(!author.accountId)throw new ProposalError('PROPOSAL_FORBIDDEN','Se requiere una cuenta identificada para proponer.');
    const validated=validateProposalInput(args.input);
    const receiptId=proposalReceiptId(channelId,origin,intentId);
    const fingerprint=JSON.stringify([channelId,author.accountId,validated]);
    const previous=state.receipts[receiptId];
    if(previous){
      if(previous.fingerprint!==fingerprint)throw new ProposalError('PROPOSAL_INVALID','ID de evento reutilizado con otros datos.');
      return {proposal:previous.result as Proposal};
    }
    const stamp=(args.now??(()=>new Date().toISOString()))();
    // Limits: per account and channel, sliding one-hour window over submission receipts.
    const pending=Object.values(state.proposals).filter(p=>p.channelId===channelId&&p.authorAccountId===author.accountId&&p.status==='pending');
    if(pending.length>=this.limits.maxPendingPerAccount)throw new ProposalError('PROPOSAL_LIMIT',`Ya tenés ${this.limits.maxPendingPerAccount} propuestas pendientes en este canal.`);
    const hourAgo=Date.parse(stamp)-3_600_000;
    const recent=Object.entries(state.receipts).filter(([id,r])=>{
      if(!id.startsWith('proposal:')||id.startsWith('proposal-action:'))return false; // submissions only, never action receipts
      const p=(r.result as Proposal);return p&&p.authorAccountId===author.accountId&&p.channelId===channelId&&Date.parse(p.createdAt)>hourAgo;}).length;
    if(recent>=this.limits.maxSubmissionsPerHour)throw new ProposalError('PROPOSAL_LIMIT',`Máximo ${this.limits.maxSubmissionsPerHour} propuestas por hora en este canal.`);
    const id=`prop-${cryptoRandomHex(12)}`;
    const shortId=proposalShortId(stamp,id);
    const proposal:Proposal={id,shortId,channelId,authorAccountId:author.accountId,origin,input:validated,status:'pending',version:1,createdAt:stamp};
    state.proposals[id]=proposal;
    state.receipts[receiptId]={fingerprint,result:proposal};
    return {proposal};
  }

  /** Single transition winner between accept / reject / withdraw; a terminal proposal never returns to pending. */
  transition(state:ProposalState,args:{proposalId:string;action:'accept'|'reject'|'withdraw';actor:MarketActor;isChannelOwner:boolean;
    intentId:string;reason?:string;editedInput?:CreateMarketInput;now?:()=>string}){
    const receiptId=`proposal-action:${args.proposalId}:${args.action}:${args.intentId}`;
    const previous=state.receipts[receiptId];
    if(previous)return {proposal:previous.result as Proposal,replayed:true as const};
    const proposal=state.proposals[args.proposalId];
    if(!proposal)throw new ProposalError('PROPOSAL_NOT_FOUND','Propuesta desconocida.');
    if(proposal.status!=='pending')throw new ProposalError('PROPOSAL_NOT_PENDING',`La propuesta ya está ${proposal.status}.`);
    const stamp=(args.now??(()=>new Date().toISOString()))();
    if(args.action==='withdraw'){
      if(proposal.authorAccountId!==args.actor.accountId)throw new ProposalError('PROPOSAL_FORBIDDEN','Solo el autor puede retirar su propuesta.');
    }else{
      if(!args.isChannelOwner)throw new ProposalError('PROPOSAL_FORBIDDEN','Solo el dueño del canal puede revisar propuestas.');
    }
    if(args.action==='reject'&&args.reason&&args.reason.length>MAX_REASON)throw new ProposalError('PROPOSAL_INVALID',`El motivo no puede superar ${MAX_REASON} caracteres.`);
    if(args.action==='accept'&&args.editedInput)proposal.editedInput=validateProposalInput(args.editedInput);
    proposal.status=args.action==='accept'?'accepted':args.action==='reject'?'rejected':'withdrawn';
    proposal.version+=1;
    proposal.reviewedAt=stamp;
    proposal.reviewerAccountId=args.actor.accountId;
    if(args.action==='reject')proposal.rejectionReason=args.reason;
    state.receipts[receiptId]={fingerprint:JSON.stringify([proposal.status]),result:proposal};
    return {proposal,replayed:false as const};
  }
}

export function proposalShortId(stamp:string,id:string){
  const slot=Math.floor(Date.parse(stamp)/1000).toString(36);
  return `P${slot.slice(-3)}${id.slice(-4).toUpperCase()}`;
}

/** Crypto available in Node and modern runtimes; tests may inject determinism through ids/receipts. */
export function cryptoRandomHex(bytes:number){
  const g=globalThis as {crypto?:{getRandomValues(b:Uint8Array):Uint8Array}};
  if(g.crypto?.getRandomValues){const b=new Uint8Array(bytes);g.crypto.getRandomValues(b);return [...b].map(x=>x.toString(16).padStart(2,'0')).join('');}
  // Deterministic fallback (test runtimes without WebCrypto): still unique per call sequence.
  fallbackState=(fallbackState+1)>>>0;
  return fallbackState.toString(16).padStart(bytes*2,'0');
}
let fallbackState=0;
