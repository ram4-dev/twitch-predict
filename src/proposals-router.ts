/** Plan 2 — HTTP router for proposals. Express factory mirroring byte-router.ts conventions.
 * Actor identity and channel-owner evidence come from the injected resolver (Plan 1 owns identity/auth);
 * frontend-supplied roles are never trusted. */
import express from 'express';
import {z} from 'zod';
import {type MarketActor, type MarketChannel} from './market-contract.js';
import {ProposalError} from './proposals.js';
import {ProposalService} from './proposals-service.js';

/** Server-side actor/role evidence: how the request binds to an account and to channel roles. */
export interface ProposalActorResolver {
  /** Returns the authenticated account actor, or null for an anonymous request. */
  actor(req:express.Request):Promise<MarketActor|null>;
  /** Returns the session token the publication gateway needs (Plan 1 createMarket), or null when anonymous. */
  token(req:express.Request):Promise<string|null>;
  /** Channel context for the request's channel id (server-resolved, not from the payload), or null when unknown. */
  channel(channelId:string):Promise<MarketChannel|null>;
  /** Verified owner evidence for the actor on that channel (never from the client). */
  isChannelOwner(actor:MarketActor,channelId:string):Promise<boolean>;
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
  const requireActor=async(req:express.Request)=>{const actor=await resolver.actor(req);if(!actor)throw new ProposalError('PROPOSAL_FORBIDDEN','Iniciá sesión para operar con propuestas.');return actor;};

  router.get('/me',route(async(req,res)=>{
    const actor=await resolver.actor(req);if(!actor)return res.json({proposals:[]});
    res.json({proposals:await service.listForAuthor(actor.accountId)});
  }));
  router.get('/channels/:channelId',route(async(req,res)=>{
    const actor=await requireActor(req);
    const channel=await resolver.channel(String(req.params.channelId));
    if(!channel)throw new ProposalError('PROPOSAL_NOT_FOUND','Canal desconocido.');
    const isOwner=await resolver.isChannelOwner(actor,channel.id);
    // Private inbox is owner-only; everyone else only sees their own submissions (server-side filter).
    const proposals=isOwner?await service.listForChannel(channel.id):await service.listForAuthor(actor.accountId,channel.id);
    res.json({proposals,isOwner,pending:proposals.filter(p=>p.status==='pending').length});
  }));
  router.post('/channels/:channelId',route(async(req,res)=>{
    const actor=await requireActor(req);
    const channel=await resolver.channel(String(req.params.channelId));
    if(!channel)throw new ProposalError('PROPOSAL_NOT_FOUND','Canal desconocido.');
    const input=createInput.parse(req.body);
    const intentId=z.string().min(8).max(120).parse(req.body?.intentId);
    res.status(201).json(await service.submit({channel,actor,origin:'app',intentId,input}));
  }));
  router.post('/:proposalId/withdraw',route(async(req,res)=>{
    const actor=await requireActor(req);
    const intentId=z.string().min(8).max(120).parse(req.body?.intentId);
    res.json(await service.withdraw({proposalId:String(req.params.proposalId),actor,intentId}));
  }));
  router.post('/:proposalId/reject',route(async(req,res)=>{
    const actor=await requireActor(req);
    const channelOf=await service.get(String(req.params.proposalId));
    const isOwner=await resolver.isChannelOwner(actor,channelOf.channelId);
    const intentId=z.string().min(8).max(120).parse(req.body?.intentId);
    const reason=z.string().max(280).optional().parse(req.body?.reason);
    res.json(await service.reject({proposalId:String(req.params.proposalId),actor,isChannelOwner:isOwner,intentId,reason}));
  }));
  router.post('/:proposalId/accept',route(async(req,res)=>{
    const actor=await requireActor(req);
    const proposal=await service.get(String(req.params.proposalId));
    const channel=await resolver.channel(proposal.channelId);
    if(!channel)throw new ProposalError('PROPOSAL_NOT_FOUND','Canal desconocido.');
    const isOwner=await resolver.isChannelOwner(actor,channel.id);
    const token=await resolver.token(req);
    if(!token)throw new ProposalError('PROPOSAL_FORBIDDEN','Se requiere sesión del dueño del canal para publicar.');
    const i=acceptInput.parse(req.body);
    res.json(await service.accept({token,proposalId:proposal.id,actor,isChannelOwner:isOwner,intentId:i.intentId,editedInput:i.editedInput,channel}));
  }));
  return router;
}
