import {createHash} from 'node:crypto';
import {Router,type Request} from 'express';
import {z} from 'zod';
import type {PaymentReconciler} from './reconcile.js';
import type {PostgresMockPaymentProvider} from './payment.js';
import type {TwitchProjection} from './twitch.js';

export interface PlotActor { id:string; wallet:string|null; twitch:{id:string}|null }
export interface PlotRouterDependencies {
 payments:PaymentReconciler;
 twitch?:TwitchProjection;
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
 router.post('/markets',async(req,res)=>{try{
  if(!deps.twitch){res.sendStatus(503);return;}
  const actor=await deps.actor(req),body=z.object({broadcaster:z.string().min(1).max(128),prediction:z.string().min(1).max(128),outcomes:z.array(z.string().min(1).max(128)).min(2).max(6),closesAt:z.iso.datetime(),timeoutAt:z.iso.datetime()}).strict().parse(req.body);
  await deps.twitch.register(actor,body);res.status(201).json({status:'registered'});
 }catch{res.status(400).json({error:'No se pudo registrar el mercado'});}});
 return router;
}
