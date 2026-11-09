/** Trusted adapters construct actors; never accept roles from an HTTP payload. */
export type MarketActor={accountId:string;twitchId?:string};
export type MarketChannel={id:string;login:string};
export type ChannelCapabilities={create:boolean;propose:boolean;close:boolean;resolve:boolean;cancel:boolean;reviewProposals:boolean};

/** Owner is the broadcaster; a verified moderator may create but never close, resolve or cancel. */
export function capabilities(actor:MarketActor,channel:MarketChannel,verifiedModerator=false):ChannelCapabilities {
  const owner=actor.twitchId===channel.id;
  return {create:owner||verifiedModerator,propose:!!actor.accountId,close:owner,resolve:owner,cancel:owner,reviewProposals:owner};
}

export type CreateMarketInput={title:string;options:string[];durationSeconds?:number};
export type MarketOperation={key:string;expectedVersion?:number;requestId:string};

/** Session 2 supplies this handler; signed chat role evidence is provided by the adapter. */
export type ProposalCreateHandler=(input:{actor:MarketActor;channel:MarketChannel;input:CreateMarketInput;eventId:string})=>Promise<{kind:'proposal';id:string;text:string}>;

/** Accepting a proposal publishes synchronously inside the same Points aggregate transaction. */
export type PublishMarketInput={actor:MarketActor;channel:MarketChannel;input:CreateMarketInput;requestId:string};
export type PublishedMarket={kind:'market';id:string;key:string;shortId:string;text:string};

/** Draft view of the Points aggregate handed to proposal handlers; everything commits or rolls back together. */
export type ProposalTransaction={
  /** Store proposal state (pending/accepted/rejected) on the same aggregate draft. */
  proposals:Record<string,unknown>;
  /** Publish synchronously: validates capabilities, allocates the persistent shortId and returns its receipt. */
  publishMarket(input:PublishMarketInput):PublishedMarket;
};
