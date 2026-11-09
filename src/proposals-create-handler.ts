/** Plan 2 — ProposalCreateHandler per the Plan 1 contract: one !plot crear command, role decided server-side.
 * The chat adapter (Plan 1, src/cloud/twitch-bot.ts) calls this with signed evidence; it never parses roles from chat text.
 * Publication for owner/moderator goes through Points.proposalTransaction (synchronous publishOnDraft), never a separate async createMarket. */
import {type MarketActor, type MarketChannel, type ChannelCapabilities, type CreateMarketInput} from './market-contract.js';
import {capabilities} from './market-contract.js';
import {ProposalService} from './proposals-service.js';

export type ProposalCreateResult =
  | {kind:'market';key:string;id:string;text:string}
  | {kind:'proposal';id:string;shortId:string;text:string};

export type CreateRoleDepsWithProposal = {
  proposals:ProposalService;
};

/** Role decision: owner/moderator publish synchronously inside the aggregate; authenticated viewers get a pending proposal. */
export async function handleProposalCreate(deps:CreateRoleDepsWithProposal,args:{actor:MarketActor;channel:MarketChannel;
  input:CreateMarketInput;eventId:string;verifiedModerator:boolean}):Promise<ProposalCreateResult>{
  const caps:ChannelCapabilities=capabilities(args.actor,args.channel,args.verifiedModerator);
  if(caps.create){
    // Direct owner/moderator creation via the same atomic transaction used for acceptance.
    // publishMarket validates capabilities again from signed evidence; deterministic requestId from eventId.
    const service=deps.proposals as ProposalService&{createDirectly?:unknown};
    const market=await (service as {createDirectly(args:{channel:MarketChannel;actor:MarketActor;input:CreateMarketInput;eventId:string}):Promise<{key:string;id:string;text:string}>})
      .createDirectly({channel:args.channel,actor:args.actor,input:args.input,eventId:args.eventId});
    return {kind:'market',key:market.key,id:market.id,text:market.text};
  }
  if(caps.propose){
    const proposal=await deps.proposals.submit({channel:args.channel,actor:args.actor,origin:'chat',intentId:args.eventId,input:args.input});
    return {kind:'proposal',id:proposal.id,shortId:proposal.shortId,
      text:`Propuesta ${proposal.shortId} enviada al streamer; pendiente de aprobación.`};
  }
  throw new ProposalErrorUnauthorized();
}

class ProposalErrorUnauthorized extends Error {
  constructor(){super('Iniciá sesión y vinculá Twitch para crear o proponer.');}
}
