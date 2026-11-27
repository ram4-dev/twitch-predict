import { Router, type Request } from 'express';
import { z } from 'zod';
import type { PlotSponsor, SponsorRequest } from './sponsor.js';

const u64 = z.string().regex(/^(0|[1-9][0-9]*)$/).refine(v => BigInt(v) <= 0xffffffffffffffffn);
const identity = z.string().regex(/^[0-9a-f]{64}$/);
const body = z.discriminatedUnion('operation', [
  z.object({ wallet:z.string().min(32).max(44),operation:z.literal('place_prediction'),parameters:z.object({marketIdentity:identity,option:z.number().int().min(0).max(255),amount:u64.refine(v => v !== '0'),sequence:u64}).strict() }).strict(),
  z.object({ wallet:z.string().min(32).max(44),operation:z.literal('claim'),parameters:z.object({marketIdentity:identity}).strict() }).strict(),
]);
const submitBody = z.object({ transaction:z.string().min(1).max(2000) }).strict();
export type SponsorRouteService = Pick<PlotSponsor,'prepare' | 'submit' | 'getIntent' | 'reconcile' | 'expireUnsigned'>;
/** Mount at /api/plot/v1/intents. resolveUser must validate the application's session.
 * The builder must independently bind the session user to wallet and market permissions. */
export function createPlotSponsorRouter(service: SponsorRouteService, resolveUser: (request: Request) => Promise<string | null>): Router {
  const router = Router();
  router.use(async (req,res,next) => {
    try {
      const user = await resolveUser(req);
      if (!user) { res.status(401).json({error:'unauthorized'}); return; }
      res.locals.plotUserId = user; next();
    } catch { res.status(503).json({error:'authentication_unavailable'}); }
  });
  router.post('/', async (req,res) => {
    const parsed = body.safeParse(req.body), key = req.get('Idempotency-Key');
    if (!parsed.success || !key || key.length > 128) { res.status(400).json({error:'invalid_request'}); return; }
    try {
      const request: SponsorRequest = {userId:res.locals.plotUserId,idempotencyKey:key,...parsed.data};
      res.json(await service.prepare(request));
    } catch { res.status(409).json({error:'intent_not_prepared'}); }
  });
  router.get('/:id', async (req,res) => {
    try { res.json(await service.getIntent(res.locals.plotUserId,req.params.id)); }
    catch { res.status(404).json({error:'intent_not_found'}); }
  });
  router.post('/:id/submit', async (req,res) => {
    const parsed = submitBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({error:'invalid_request'}); return; }
    try {
      const signature = await service.submit(res.locals.plotUserId,req.params.id,parsed.data.transaction);
      const intent = await service.getIntent(res.locals.plotUserId,req.params.id);
      res.json({signature,status:intent.status});
    } catch {
      // Submission may have reached RPC. The client must inspect the same intent.
      res.status(503).json({error:'submission_unconfirmed',intentId:req.params.id});
    }
  });
  router.post('/:id/reconcile', async (req,res) => {
    try {
      const user = res.locals.plotUserId;
      const intent = await service.getIntent(user,req.params.id);
      if (intent.status === 'prepared') await service.expireUnsigned(user,req.params.id);
      else if (intent.status === 'submitted') await service.reconcile(user,req.params.id);
      res.json(await service.getIntent(user,req.params.id));
    } catch { res.status(503).json({error:'reconciliation_unavailable',intentId:req.params.id}); }
  });
  return router;
}
