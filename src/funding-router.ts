import express from 'express';
import {z} from 'zod';
import {PointsSessionError} from './points-identity.js';
import type {Funding} from './funding.js';

/** Same authenticated API for the local store and cloud's request-scoped PostgreSQL aggregate. */
export function fundingRouter(resolve:(req:express.Request,res:express.Response)=>Funding){
  const router=express.Router();
  const token=(req:express.Request)=>req.get('authorization')?.replace(/^Bearer /,'')??'';
  const route=(work:(req:express.Request,res:express.Response)=>unknown)=>async(req:express.Request,res:express.Response)=>{
    try{await work(req,res);}catch(error){
      const unavailable='code' in Object(error);
      res.status(error instanceof PointsSessionError?401:unavailable?503:400).json({error:error instanceof z.ZodError?'Datos de la operación inválidos':unavailable?'No se pudo completar la operación':(error as Error).message});
    }
  };
  router.get('/config',route((req,res)=>res.json(resolve(req,res).config())));
  router.get('/orders',route((req,res)=>res.json(resolve(req,res).list(token(req)))));
  router.post('/quote',route(async(req,res)=>{
    const i=z.union([z.object({direction:z.literal('deposit'),currency:z.enum(['USDC','SOL']),packageId:z.string().min(1).max(40)}).strict(),z.object({direction:z.enum(['deposit','withdraw']),currency:z.enum(['USDC','SOL']),amount:z.string().min(1).max(30)}).strict()]).parse(req.body);
    res.json(await resolve(req,res).quote(token(req),i.direction,i.currency,'packageId' in i?{packageId:i.packageId}:i.amount));
  }));
  router.post('/submit',route(async(req,res)=>{
    const i=z.object({id:z.string().uuid(),signedTransaction:z.string().min(1).max(4000).optional()}).parse(req.body);
    res.json(await resolve(req,res).submit(token(req),i.id,i.signedTransaction));
  }));
  return router;
}
