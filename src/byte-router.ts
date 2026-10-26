import express from 'express';
import {timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {ByteError,ByteService} from './byte.js';
import {DEVNET_GENESIS,marketId} from './byte-model.js';
import type {ByteTwitchMirror} from './byte-twitch.js';
import type {Points} from './points.js';

const rpcMethods=new Set(['getGenesisHash','getBalance','getLatestBlockhash','getBlockHeight','getSignatureStatuses','getAccountInfo','getMinimumBalanceForRentExemption','simulateTransaction','sendTransaction']);
const equal=(a:string,b:string)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
export function byteRouter(service:ByteService,points:Points,localToken:string,environment:NodeJS.ProcessEnv=process.env,extensionId='',mirror?:ByteTwitchMirror){
  const router=express.Router();
  const rpcURL=environment.BYTE_RPC_URL||'https://api.devnet.solana.com';
  const rpc=new URL(rpcURL);
  if((rpc.protocol!=='https:'&&!(rpc.protocol==='http:'&&['localhost','127.0.0.1'].includes(rpc.hostname)))||rpc.username||rpc.password)throw new Error('BYTE_RPC_URL debe ser HTTPS.');
  const operators=(environment.BYTE_OPERATOR_WALLETS??'').split(',').map(v=>v.trim()).filter(Boolean);
  const bearer=(req:express.Request)=>req.get('authorization')?.replace(/^Bearer /,'')??'';
  const local=(req:express.Request)=>!operators.length&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress??'');
  const operator=(req:express.Request)=>{
    if(req.get('sec-fetch-site')!=='same-origin')throw new ByteError(403,'Abrí el panel desde este servidor para operar.');
    if(local(req)&&equal(req.get('x-operator-token')??'',localToken))return;
    let wallet:string|null=null;try{wallet=points.me(bearer(req)).wallet;}catch{/* A missing session is not operator access. */}
    if(!wallet||!operators.includes(wallet))throw new ByteError(403,'Esta wallet no está habilitada como operadora.');
  };
  const route=(fn:(req:express.Request,res:express.Response)=>Promise<unknown>|unknown)=>async(req:express.Request,res:express.Response)=>{
    try{await fn(req,res);}catch(e){res.status(e instanceof ByteError?e.status:e instanceof z.ZodError?400:500).json({error:e instanceof ByteError?e.message:e instanceof z.ZodError?'Datos inválidos. Revisá los campos de la operación.':'No se pudo completar la operación de byte.'});}
  };
  router.get('/status',(_req,res)=>res.json({configured:service.configured,network:'devnet',currency:'sol',operatorMode:operators.length?'wallet':'local',automaticTwitchResolution:!!mirror,extensionId}));
  router.get('/twitch/channels',(_req,res)=>res.json({channels:mirror?.channels()??[]}));
  router.post('/twitch/watch',route(async(req,res)=>{
    if(!mirror)throw new ByteError(503,'La réplica de Twitch no está disponible');
    if(operators.length){const wallet=points.me(bearer(req)).wallet;if(!wallet||!operators.includes(wallet))throw new ByteError(403,'Esta wallet no está habilitada para replicar mercados');}
    else if(!local(req)||!equal(req.get('x-operator-token')??bearer(req),localToken))throw new ByteError(403,'Vinculá la extensión al panel para replicar las predicciones');
    const input=z.object({channel:z.string().regex(/^[a-zA-Z0-9_]{1,40}$/).transform(v=>v.toLowerCase())}).parse(req.body);
    try{res.json(await mirror.watch(input.channel));}catch(e){throw new ByteError(502,`No se pudo verificar Twitch: ${(e as Error).message}`);}
  }));
  router.get('/config',route(async(_req,res)=>res.json(await service.config())));
  router.get('/markets',route(async(_req,res)=>res.json({markets:await service.list()})));
  router.get('/markets/:id',route(async(req,res)=>res.json({market:await service.get(marketId.parse(req.params.id))})));
  router.post('/markets',route(async(req,res)=>{operator(req);res.status(201).json({market:await service.create(req.body)});}));
  router.get('/operations',route((req,res)=>{operator(req);res.json({operations:service.operations()});}));
  router.post('/reconcile',route(async(req,res)=>{
    operator(req);const i=z.object({requestId:z.string().uuid(),marketId}).parse(req.body);res.json({market:await service.reconcile(i.requestId,i.marketId)});
  }));
  router.post('/markets/:id/resolve',route(async(req,res)=>{
    operator(req);const i=z.object({winner:z.number().int().min(0).max(5),evidence:z.string().trim().min(10).max(2000)}).parse(req.body);
    res.json({market:await service.settle(marketId.parse(req.params.id),i.winner,i.evidence)});
  }));
  router.post('/markets/:id/invalidate',route(async(req,res)=>{
    operator(req);const i=z.object({reason:z.string().trim().min(10).max(2000)}).parse(req.body);
    res.json({market:await service.settle(marketId.parse(req.params.id),null,i.reason)});
  }));
  router.post('/markets/:id/sync',route(async(req,res)=>{
    const i=z.object({wallet:z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)}).parse(req.body);
    res.json({market:await service.sync(marketId.parse(req.params.id),i.wallet)});
  }));
  let verifiedAt=0;
  const rpcFetch=async(body:unknown)=>{
    try{const response=await fetch(rpcURL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000),redirect:'error'});if(!response.ok)throw new ByteError(response.status===429?429:502,'El RPC de Solana no está disponible. Reintentá la consulta.');return await response.json();}
    catch(e){if(e instanceof ByteError)throw e;throw new ByteError(504,'No se pudo confirmar la respuesta del RPC. Revisá la transacción antes de volver a apostar.');}
  };
  router.post('/rpc',route(async(req,res)=>{
    const input=z.object({jsonrpc:z.literal('2.0'),id:z.union([z.string(),z.number()]),method:z.string(),params:z.array(z.unknown()).optional()}).parse(req.body);
    if(!rpcMethods.has(input.method))throw new ByteError(403,'Método RPC no permitido.');
    // A custom RPC URL must never make a wallet send funds to mainnet by accident.
    if(Date.now()-verifiedAt>60000){
      const genesis=await rpcFetch({jsonrpc:'2.0',id:1,method:'getGenesisHash'});
      if(genesis.result!==DEVNET_GENESIS)throw new ByteError(503,'El RPC configurado no corresponde a Solana devnet.');
      verifiedAt=Date.now();
    }
    const result=await rpcFetch(input);
    if(result.error)res.json({jsonrpc:'2.0',id:input.id,error:{code:typeof result.error.code==='number'?result.error.code:-32000,message:'Solana rechazó la solicitud. Revisá saldo, límites y cierre del mercado.'}});
    else res.json({jsonrpc:'2.0',id:input.id,result:result.result});
  }));
  return router;
}
