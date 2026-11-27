import {createHash} from 'node:crypto';
import {Router,type Request} from 'express';
import {z} from 'zod';
import type {PaymentReconciler} from './reconcile.js';
import type {PostgresMockPaymentProvider} from './payment.js';
import type {TwitchProjection} from './twitch.js';
import type {Pool} from 'pg';
import {twitchMarketHash} from './identity.js';
import {PointsSessionError} from '../../points-identity.js';

export interface PlotActor { id:string; wallet:string|null; twitch:{id:string}|null }
export interface PlotRouterDependencies {
 payments:PaymentReconciler;
 intentsRouter?:import('express').Router;
 accountRead?:(wallet:string)=>Promise<unknown>;
 chainMarketRead?:(broadcaster:string,prediction:string)=>Promise<{chainStatus:string;options:{id:string;optionIndex:number;stake:string}[];streamerBps:number;treasuryBps:number;streamerFee:string|null;treasuryFee:string|null}>;
 twitch?:TwitchProjection;
 read?:{pool:Pool;namespace:string};
 mock:PostgresMockPaymentProvider;
 actor:(req:Request)=>Promise<PlotActor>;
 /** Explicitly enabled in test deployments only. */
 allowMockConfirmation:boolean;
}
const packages={small:'600',medium:'400'} as const;
const input=z.object({idempotencyKey:z.string().min(1).max(128),package:z.enum(['small','medium'])}).strict();
const key=(actor:string,id:string)=>createHash('sha256').update(JSON.stringify([actor,id])).digest('hex');
export function plotRouter(deps:PlotRouterDependencies){
 const router=Router();
 router.get('/account',async(req,res)=>{try{
  const actor=await deps.actor(req);if(!actor.wallet){res.status(403).json({error:'Wallet no verificada'});return;}
  if(!deps.accountRead){res.status(503).json({error:'Lectura PLOT no disponible'});return;}
  res.json(await deps.accountRead(actor.wallet));
 }catch(error){res.status(error instanceof PointsSessionError?401:503).json({error:'Lectura PLOT no disponible'});}});
 router.post('/orders',async(req,res)=>{try{
  const actor=await deps.actor(req);if(!actor.wallet){res.status(403).json({error:'Wallet no verificada'});return;}
  const body=input.parse(req.body),id=key(actor.id,body.idempotencyKey);
  res.json(await deps.payments.create({id,wallet:actor.wallet,amount:packages[body.package]}));
 }catch{res.status(400).json({error:'No se pudo crear la orden'});}});
 router.post('/orders/:idempotencyKey/confirm',async(req,res)=>{try{
  if(!deps.allowMockConfirmation){res.sendStatus(404);return;}
  const actor=await deps.actor(req);if(!actor.wallet){res.sendStatus(403);return;}
  const id=key(actor.id,String(req.params.idempotencyKey));await deps.mock.confirm(id,actor.wallet);res.json({status:'paid',simulated:true});
 }catch{res.status(400).json({error:'No se pudo confirmar la orden'});}});
 router.post('/orders/:idempotencyKey/reconcile',async(req,res)=>{try{
  const actor=await deps.actor(req);if(!actor.wallet){res.sendStatus(403);return;}
  const id=key(actor.id,String(req.params.idempotencyKey));const order=await deps.mock.getOrder(id);
  if(!order||order.wallet!==actor.wallet){res.sendStatus(404);return;}
  res.json(await deps.payments.reconcile(id));
 }catch{res.status(409).json({error:'Pago pendiente de verificación o conciliación'});}});
 if(deps.read)router.get('/markets',marketReadHandler(deps.read.pool,deps.read.namespace,deps.chainMarketRead));
 router.post('/markets',async(req,res)=>{try{
  if(!deps.twitch){res.sendStatus(503);return;}
  const actor=await deps.actor(req),body=z.object({broadcaster:z.string().min(1).max(128),prediction:z.string().min(1).max(128),outcomes:z.array(z.string().min(1).max(128)).min(2).max(6),closesAt:z.iso.datetime(),timeoutAt:z.iso.datetime()}).strict().parse(req.body);
  await deps.twitch.register(actor,body);res.status(201).json({status:'registered'});
 }catch{res.status(400).json({error:'No se pudo registrar el mercado'});}});
 return router;
}

export function marketReadHandler(pool:Pool,namespace:string,chainMarketRead?:PlotRouterDependencies['chainMarketRead']){
 return async (_req:Request,res:import('express').Response)=>{try{
  const {rows}=await pool.query('SELECT broadcaster,prediction,title,outcomes,outcome_labels,phase,winner,closes_at,timeout_at FROM plot_private.plot_twitch_markets WHERE namespace=$1 ORDER BY closes_at DESC LIMIT 100',[namespace]);
  const markets=await Promise.all(rows.map(async m=>{
   let chain:Awaited<ReturnType<NonNullable<PlotRouterDependencies['chainMarketRead']>>>|null=null;
   if(chainMarketRead)try{const candidate=await chainMarketRead(m.broadcaster,m.prediction);const ids=candidate.options.map(o=>o.id);if(ids.length===m.outcomes.length&&new Set(ids).size===ids.length&&m.outcomes.every((id:string)=>ids.includes(id)))chain=candidate;}catch{/* Source unavailable: never infer chain state. */}
   return {id:`${m.broadcaster}:${m.prediction}`,broadcasterId:m.broadcaster,predictionId:m.prediction,marketIdentity:twitchMarketHash(m.broadcaster,m.prediction),title:m.title,options:m.outcomes.map((id:string)=>{const option=chain?.options.find(o=>o.id===id);return {id,label:m.outcome_labels?.[id]??null,stake:option?.stake??null,optionIndex:option?.optionIndex??null};}),twitchStatus:m.phase,winnerId:m.winner,chainStatus:chain?.chainStatus??null,streamerBps:chain?.streamerBps??null,treasuryBps:chain?.treasuryBps??null,streamerFee:chain?.streamerFee??null,treasuryFee:chain?.treasuryFee??null,closesAt:m.closes_at.toISOString(),timeoutAt:m.timeout_at.toISOString()};
  }));res.json({markets});
 }catch{res.status(503).json({error:'Mercados no disponibles'});}};
}
