/** Plan 2 — ProposalCreateHandler per the Plan 1 contract: one !plot crear command, role decided server-side.
 * The chat adapter (Plan 1, src/cloud/twitch-bot.ts) calls this with signed evidence; it never parses roles from chat text. */
import {type MarketActor, type MarketChannel, type ChannelCapabilities, type CreateMarketInput} from './market-contract.js';
import {capabilities} from './market-contract.js';
import {ProposalService} from './proposals-service.js';

export type ProposalCreateResult =
  | {kind:'market';key:string;text:string}
  | {kind:'proposal';id:string;shortId:string;text:string};

export type CreateRoleDepsWithProposal = {
  proposals:ProposalService;
  /** Plan 1 publication operation for owner/moderator direct creation (same one the console uses). */
  publishMarket(args:{token:string;channel:MarketChannel;input:CreateMarketInput;actor:MarketActor;requestId:string}):Promise<{key:string;id:string}>;
  token(actor:MarketActor):string|null;
};

/** Role decision: owner/moderator publish, authenticated viewers get a pending proposal. verifiedModerator comes from signed adapter evidence. */
export async function handleProposalCreate(deps:CreateRoleDepsWithProposal,args:{actor:MarketActor;channel:MarketChannel;
  input:CreateMarketInput;eventId:string;verifiedModerator:boolean}):Promise<ProposalCreateResult>{
  const caps:ChannelCapabilities=capabilities(args.actor,args.channel,args.verifiedModerator);
  if(caps.create){
    const token=deps.token(args.actor);
    if(!token)throw new ProposalErrorForbidden();
    const market=await deps.publishMarket({token,channel:args.channel,input:args.input,actor:args.actor,requestId:`plot-create:${args.eventId}`});
    return {kind:'market',key:market.key,text:`Mercado publicado (${market.id}). Abrí las apuestas desde la consola o con !plot cerrar.`};
  }
  if(caps.propose){
    const proposal=await deps.proposals.submit({channel:args.channel,actor:args.actor,origin:'chat',intentId:args.eventId,input:args.input});
    return {kind:'proposal',id:proposal.id,shortId:proposal.shortId,
      text:`Propuesta ${proposal.shortId} enviada al streamer; pendiente de aprobación.`};
  }
  throw new ProposalErrorForbidden();
}

class ProposalErrorForbidden extends Error {
  constructor(){super('Iniciá sesión y vinculá Twitch para crear o proponer.');}
}
