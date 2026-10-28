import {
  byteConfigSchema,
  byteMarketSchema,
  type ByteConfig,
  type DisplayByteMarket,
} from "../../../src/byte-model";
import { mobileApiOrigin, twitchChannel } from "../../../src/mobile-model";
export { mobileApiOrigin, twitchChannel };
export async function api<T>(base: string, path: string): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(25000),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "No se pudo consultar Plot.");
  return body;
}
export async function channelMarkets(base: string, input: string) {
  const channel = twitchChannel(input);
  const [data, rawConfig] = await Promise.all([
    api<{ channel: string; markets: DisplayByteMarket[]; checkedAt: number }>(
      base,
      `/api/mobile/channels/${channel}`,
    ),
    api<ByteConfig>(base, "/api/byte/config"),
  ]);
  for (const market of data.markets) byteMarketSchema.parse(market);
  return { ...data, config: byteConfigSchema.parse(rawConfig) };
}
