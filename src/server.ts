import express from 'express';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from './store.js';
import { SolanaMarkets } from './solana.js';
import { Trading } from './trading.js';
import { z } from 'zod';
import { Mirror, demoPrediction } from './mirror.js';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const directory = resolve(process.env.DATA_DIR ?? `${root}/data`);
await mkdir(directory, { recursive: true, mode: 0o700 });
try { await writeFile(`${directory}/bridge-token`, randomBytes(32).toString('hex'), { mode: 0o600, flag: 'wx' }); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; }
const token = (await readFile(`${directory}/bridge-token`, 'utf8')).trim();
const store = new Store(directory); await store.load();
const solana = new SolanaMarkets(directory, process.env.SOLANA_RPC_URL);
const mirror = new Mirror(store, solana);
const trading = new Trading(solana, () => store.save());
// A previous in-flight transaction needs inspection; never silently repeat it on restart.
for (const record of Object.values(store.records)) if (record.phase === 'creating') { record.phase = 'failed'; record.error = 'Bridge restarted during creation. Inspect saved transaction receipts before resuming.'; }
await store.save();
const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  const host = req.hostname;
  if (!['twitch-predict.localhost', 'localhost', '127.0.0.1'].includes(host)) { res.status(403).json({ error: 'Untrusted host' }); return; }
  const origin = req.headers.origin;
  if (origin && !origin.startsWith('chrome-extension://') && origin !== `${req.protocol}://${req.get('host')}`) { res.status(403).json({ error: 'Untrusted origin' }); return; }
  res.set('Cache-Control', 'no-store'); res.set('X-Content-Type-Options', 'nosniff');
  res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'");
  next();
});
app.use(express.json({ limit: '16kb' }));
app.get('/api/health', async (_req, res) => {
  try { res.json({ ok: true, protocol: 'Doppler', features: ['buy', 'resolve', 'claim'], ...await solana.health() }); }
  catch (e) { res.status(503).json({ ok: false, network: solana.network, error: (e as Error).message }); }
});
app.get('/api/markets', (_req, res) => res.json(Object.values(store.records).reverse()));
// Pairing is same-origin only. Tokens are transferred directly, never printed or copied by the agent.
app.get('/api/pair', (req, res) => {
  if (req.get('sec-fetch-site') !== 'same-origin') { res.status(403).json({ error: 'Open the dashboard to pair' }); return; }
  res.json({ token });
});
app.use('/api', (req, res, next) => {
  const provided = Buffer.from(req.get('authorization')?.replace(/^Bearer /, '') ?? ''); const expected = Buffer.from(token);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) { res.status(401).json({ error: 'Bridge pairing required' }); return; }
  next();
});
app.get('/api/participant', async (_req, res) => { try { res.json(await trading.wallet()); } catch (e) { res.status(503).json({ error: (e as Error).message }); } });
app.post('/api/faucet', async (_req, res) => { try { res.json(await mirror.execute(() => trading.fund())); } catch (e) { res.status(400).json({ error: (e as Error).message }); } });
const actionInput = z.object({ key: z.string().min(1).max(300), requestId: z.string().uuid().optional(), outcomeId: z.string().max(128).optional(), amount: z.string().max(20).optional(), quoteId: z.string().uuid().optional() });
app.post('/api/trade/:action', async (req, res) => {
  try {
    const input = actionInput.parse(req.body);
    const record = store.records[input.key]; if (!record) throw new Error('Mercado desconocido');
    const result = await mirror.execute(async () => {
      switch (req.params.action) {
        case 'quote': return trading.quote(record, z.string().parse(input.outcomeId), input.amount);
        case 'buy': return trading.buy(record, z.string().uuid().parse(input.quoteId), z.string().uuid().parse(input.requestId));
        case 'resolve': return trading.resolve(record, z.string().parse(input.outcomeId), z.string().uuid().parse(input.requestId));
        case 'claim': return trading.claim(record, z.string().uuid().parse(input.requestId));
        case 'position': return trading.position(record);
        default: throw new Error('Acción desconocida');
      }
    });
    res.json(result);
  } catch (e) { res.status(400).json({ error: (e as Error).message }); }
});
app.post('/api/predictions', async (req, res) => { try { res.status(202).json(await mirror.accept(req.body)); } catch (e) { res.status(400).json({ error: (e as Error).message }); } });
app.post('/api/demo', async (_req, res) => { try { res.status(202).json(await mirror.accept(demoPrediction())); } catch (e) { res.status(400).json({ error: (e as Error).message }); } });
app.use(express.static(`${root}/public`));
app.use('/extension', express.static(`${root}/extension`));
app.listen(Number(process.env.PORT ?? 3000), '127.0.0.1', () => console.log('Prediction Mirror ready (devnet/localnet only).'));
