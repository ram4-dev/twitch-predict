/** Plan 2 — HTTP router for proposals. Express factory mirroring byte-router.ts conventions.
 * Actor identity comes from the injected resolver (Plan 1 owns identity/auth); frontend-supplied roles
 * are never trusted. Owner/mod authorization inside publishMarket uses the same capabilities() policy. */
import express from 'express';
import {z} from 'zod';
import {type MarketActor, type MarketChannel} from './market-contract.js';
import {ProposalError} from './proposals.js';
import {ProposalService} from './proposals-service.js';

/** Server-side actor/role evidence: how the request binds to an account and to channel roles. */
export interface ProposalActorResolver {
  /** Returns the authenticated account actor with twitchId from the linked session, or null when anonymous. */
  actor(req:express.Request,res:express.Response):Promise<MarketActor|null>;
  /** Channel context for the request's channel id (server-resolved, never from the payload), or null when unknown. */
  channel(req:express.Request,res:express.Response,channelId:string):Promise<MarketChannel|null>;
  /** Verified owner evidence for the actor on that channel (advisory; publishMarket re-validates). */
  isChannelOwner(req:express.Request,res:express.Response,actor:MarketActor,channelId:string):Promise<boolean>;
}

const createInput=z.object({
  title:z.string().min(1).max(140),
  options:z.array(z.string().min(1).max(60)).min(2).max(6),
  durationSeconds:z.number().int().min(30).max(86400).optional(),
});
const acceptInput=z.object({intentId:z.string().min(8).max(120),editedInput:createInput.optional()});

export type ProposalRouteDeps={service:ProposalService;resolver:ProposalActorResolver};

export function proposalsRouter({service,resolver}:ProposalRouteDeps){
  const router=express.Router();
  const route=(fn:(req:express.Request,res:express.Response)=>Promise<unknown>|unknown)=>async(req:express.Request,res:express.Response)=>{
    try{await fn(req,res);}
    catch(e){
      const status=e instanceof z.ZodError?400:e instanceof ProposalError?(e.code==='PROPOSAL_FORBIDDEN'?403:e.code==='PROPOSAL_NOT_FOUND'?404:400):500;
      res.status(status).json({error:e instanceof z.ZodError?'Datos inválidos. Revisá los campos de la operación.':(e as Error).message,
        code:e instanceof ProposalError?e.code:undefined});
    }
  };
  const requireActor=async(req:express.Request,res:express.Response)=>{
    const actor=await resolver.actor(req,res);
    if(!actor)throw new ProposalError('PROPOSAL_FORBIDDEN','Iniciá sesión para operar con propuestas.');
    return actor;
  };
  const intent=(req:express.Request)=>z.string().min(8).max(120).parse(reqBody(req).intentId);
  router.get('/me',route(async(req,res)=>{
    const actor=await resolver.actor(req,res);if(!actor)return res.json({proposals:[]});
    res.json({proposals:await service.listForAuthor(actor.accountId)});
  }));
  router.get('/channels/:channelId',route(async(req,res)=>{
    const actor=await requireActor(req,res);
    const channel=await resolver.channel(req,res,String(req.params.channelId));
    if(!channel)throw new ProposalError('PROPOSAL_NOT_FOUND','Canal desconocido.');
    const isOwner=await resolver.isChannelOwner(req,res,actor,channel.id);
    // Private inbox is owner-only; everyone else only sees their own submissions (server-side filter).
    const proposals=isOwner?await service.listForChannel(channel.id):await service.listForAuthor(actor.accountId,channel.id);
    res.json({proposals,isOwner,pending:proposals.filter(p=>p.status==='pending').length});
  }));
  router.post('/channels/:channelId',route(async(req,res)=>{
    const actor=await requireActor(req,res);
    const channel=await resolver.channel(req,res,String(req.params.channelId));
    if(!channel)throw new ProposalError('PROPOSAL_NOT_FOUND','Canal desconocido.');
    const input=createInput.parse(reqBody(req));
    const intentId=intent(req);
    res.status(201).json(await service.submit({channel,actor,origin:'app',intentId,input}));
  }));
  router.post('/:proposalId/withdraw',route(async(req,res)=>{
    const actor=await requireActor(req,res);
    res.json(await service.withdraw({proposalId:String(req.params.proposalId),actor,intentId:intent(req)}));
  }));
  router.post('/:proposalId/reject',route(async(req,res)=>{
    const actor=await requireActor(req,res);
    const proposal=await service.get(String(req.params.proposalId));
    const isOwner=await resolver.isChannelOwner(req,res,actor,proposal.channelId);
    const reason=z.string().max(280).optional().parse(reqBody(req).reason);
    res.json(await service.reject({proposalId:proposal.id,actor,isChannelOwner:isOwner,intentId:intent(req),reason}));
  }));
  router.post('/:proposalId/accept',route(async(req,res)=>{
    const actor=await requireActor(req,res);
    const proposal=await service.get(String(req.params.proposalId));
    const channel=await resolver.channel(req,res,proposal.channelId);
    if(!channel)throw new ProposalError('PROPOSAL_NOT_FOUND','Canal desconocido.');
    const isOwner=await resolver.isChannelOwner(req,res,actor,channel.id);
    const i=acceptInput.parse(reqBody(req));
    res.json(await service.accept({proposalId:proposal.id,actor,isChannelOwner:isOwner,intentId:i.intentId,editedInput:i.editedInput,channel}));
  }));
  return router;
}

// SAFETY: express.json() guarantees a parsed object body for POST routes mounted after it.
const reqBody=(req:express.Request):Record<string,unknown>=>(req.body??{}) as Record<string,unknown>;
