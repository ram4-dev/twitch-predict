/** Trusted adapters construct actors; never accept roles from an HTTP payload. */
export type MarketActor={accountId:string;twitchId?:string};
export type MarketChannel={id:string;login:string};
export type ChannelCapabilities={create:boolean;propose:boolean;close:boolean;resolve:boolean;cancel:boolean;reviewProposals:boolean};
export function capabilities(actor:MarketActor,channel:MarketChannel,verifiedModerator=false):ChannelCapabilities {
 const owner=actor.twitchId===channel.id;
 return {create:owner||verifiedModerator,propose:!!actor.accountId,close:owner,resolve:owner,cancel:owner,reviewProposals:owner};
}
export type CreateMarketInput={title:string;options:string[];durationSeconds?:number};
export type MarketOperation={key:string;expectedVersion?:number;requestId:string};
/** Session 2 supplies this handler; signed chat role evidence is provided by the adapter. */
export type ProposalCreateHandler=(input:{actor:MarketActor;channel:MarketChannel;input:CreateMarketInput;eventId:string})=>Promise<{kind:'proposal';id:string;text:string}>;
