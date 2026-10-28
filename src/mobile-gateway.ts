import express from "express";
import { z } from "zod";
import {
  byteConfigSchema,
  byteMarketSchema,
  marketId,
  type DisplayByteMarket,
} from "./byte-model.js";
import { twitchChannel } from "./mobile-model.js";

const rpcMethods = new Set([
  "getGenesisHash",
  "getBalance",
  "getLatestBlockhash",
  "getBlockHeight",
  "getSignatureStatuses",
  "getAccountInfo",
  "getMinimumBalanceForRentExemption",
  "simulateTransaction",
  "sendTransaction",
]);
/** A separate, allowlisted mobile surface. Never forwards cookies, auth, or operator headers. */
export function mobileGateway(
  upstream: string,
  transport: typeof fetch = fetch,
) {
  const origin = new URL(upstream);
  if (
    !["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname) &&
    !origin.hostname.endsWith(".localhost")
  )
    throw new Error("El upstream móvil debe ser el backend local de Plot.");
  if (
    !["http:", "https:"].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  )
    throw new Error("Upstream inválido.");
  const app = express();
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    res.set("X-Content-Type-Options", "nosniff");
    next();
  });
  const buckets = new Map<string, { start: number; count: number }>();
  app.use((req, res, next) => {
    const now = Date.now(),
      key = req.socket.remoteAddress ?? "unknown";
    if (buckets.size > 10000)
      for (const [ip, b] of buckets)
        if (now - b.start >= 60000) buckets.delete(ip);
    const old = buckets.get(key),
      bucket = old && now - old.start < 60000 ? old : { start: now, count: 0 };
    buckets.set(key, bucket);
    if (++bucket.count > 240) {
      res.set("Retry-After", "60");
      res
        .status(429)
        .json({ error: "Demasiadas consultas. Esperá un minuto." });
      return;
    }
    next();
  });
  app.use(express.json({ limit: "16kb" }));
  async function request(path: string, body?: unknown) {
    const response = await transport(`${origin.origin}/api${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        accept: "application/json",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(25000),
      redirect: "error",
    });
    if (!response.ok)
      throw Object.assign(
        new Error(
          "El servicio de mercados no está disponible. Reintentá en unos instantes.",
        ),
        { status: response.status === 429 ? 429 : 503 },
      );
    return response.json();
  }
  const route =
    (fn: (req: express.Request, res: express.Response) => Promise<unknown>) =>
    async (req: express.Request, res: express.Response) => {
      try {
        await fn(req, res);
      } catch (e) {
        const status =
          e instanceof z.ZodError
            ? 400
            : ((e as { status?: number }).status ?? 503);
        res
          .status(status)
          .json({
            error:
              status === 400
                ? "Canal o datos inválidos."
                : status === 503
                  ? "No se pudo consultar Plot. Revisá la conexión y reintentá."
                  : (e as Error).message,
          });
      }
    };
  app.get("/api/health", (_req, res) =>
    res.json({ ok: true, service: "plot-mobile", network: "devnet" }),
  );
  app.get(
    "/api/byte/config",
    route(async (_req, res) =>
      res.json(byteConfigSchema.parse(await request("/byte/config"))),
    ),
  );
  app.get(
    "/api/mobile/channels/:channel",
    route(async (req, res) => {
      let channel: string;
      try {
        channel = twitchChannel(String(req.params.channel));
      } catch {
        res.status(400).json({ error: "Nombre de canal inválido." });
        return;
      }
      const data = (await request("/byte/markets")) as {
        markets: DisplayByteMarket[];
      };
      if (!Array.isArray(data.markets)) throw new Error("Respuesta inválida");
      const markets = data.markets.filter(
        (m) =>
          m.notes?.channel === channel &&
          m.status === "open" &&
          m.currency === "sol" &&
          m.bettable &&
          m.closeMs > Date.now(),
      );
      res.json({ channel, markets, checkedAt: Date.now() });
    }),
  );
  app.get(
    "/api/byte/markets/:id",
    route(async (req, res) => {
      const data = await request(
        `/byte/markets/${marketId.parse(req.params.id)}`,
      );
      byteMarketSchema.parse(data.market);
      res.json(data);
    }),
  );
  app.post(
    "/api/byte/markets/:id/sync",
    route(async (req, res) => {
      const body = z
        .object({ wallet: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/) })
        .strict()
        .parse(req.body);
      res.json(
        await request(
          `/byte/markets/${marketId.parse(req.params.id)}/sync`,
          body,
        ),
      );
    }),
  );
  app.post(
    "/api/byte/rpc",
    route(async (req, res) => {
      const body = z
        .object({
          jsonrpc: z.literal("2.0"),
          id: z.union([z.string(), z.number()]),
          method: z.string(),
          params: z.array(z.unknown()).optional(),
        })
        .strict()
        .parse(req.body);
      if (!rpcMethods.has(body.method)) {
        res.status(403).json({ error: "Método RPC no permitido." });
        return;
      }
      res.json(await request("/byte/rpc", body));
    }),
  );
  app.use((_req, res) =>
    res.status(404).json({ error: "Ruta móvil no disponible." }),
  );
  app.use(
    (
      error: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) =>
      res
        .status(400)
        .json({
          error:
            error.name === "PayloadTooLargeError"
              ? "Solicitud demasiado grande."
              : "Solicitud inválida.",
        }),
  );
  return app;
}
