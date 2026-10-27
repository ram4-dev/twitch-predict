import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mobileGateway } from "../src/mobile-gateway.js";
import { mobileApiOrigin, twitchChannel } from "../src/mobile-model.js";
import { BYTE_PROGRAM } from "../src/byte-model.js";
test("normalizes only Twitch channels and rejects misleading links and production HTTP", () => {
  for (const input of [
    "@Eggsterr",
    "https://www.twitch.tv/Eggsterr?ref=tv",
    "https://m.twitch.tv/eggsterr/",
  ])
    assert.equal(twitchChannel(input), "eggsterr");
  for (const input of [
    "https://twitch.tv.evil.test/eggsterr",
    "https://user@twitch.tv/eggsterr",
    "https://twitch.tv/videos/123",
    "../operator",
    "@",
    "https://twitch.tv:9999/eggsterr",
  ])
    assert.throws(() => twitchChannel(input));
  assert.equal(mobileApiOrigin("https://plot.example"), "https://plot.example");
  assert.equal(
    mobileApiOrigin("http://10.0.2.2:4567", true),
    "http://10.0.2.2:4567",
  );
  for (const [url, dev] of [
    ["http://10.0.2.2:4567", false],
    ["http://evil.test", true],
    ["https://secret@plot.example", false],
    ["https://plot.example/operator", false],
  ] as const)
    assert.throws(() => mobileApiOrigin(url, dev));
});
test("mobile gateway filters markets and cannot forward operator, auth, arbitrary RPC or credentials", async () => {
  const calls: { url: string; headers: Headers; body: unknown }[] = [];
  const now = Date.now();
  const sample = {
    id: "pm_mobile",
    title: "¿Gana?",
    currency: "sol",
    status: "open",
    bettable: true,
    closeMs: now + 60000,
    notes: { channel: "eggsterr" },
  };
  const transport: typeof fetch = async (input, init) => {
    calls.push({
      url: String(input),
      headers: new Headers(init?.headers),
      body: init?.body,
    });
    if (String(input).endsWith("/markets"))
      return Response.json({
        markets: [
          sample,
          { ...sample, id: "pm_other", notes: { channel: "other" } },
          { ...sample, id: "pm_closed", closeMs: now - 1 },
          { ...sample, id: "pm_unverified", bettable: false },
          { ...sample, id: "pm_byte", currency: "byte" },
        ],
      });
    if (String(input).endsWith("/config"))
      return Response.json({
        enabled: true,
        sol: {
          programId: BYTE_PROGRAM,
          cluster: "devnet",
          maxBet: 100000000,
          maxPool: 2000000000,
        },
      });
    return Response.json({ jsonrpc: "2.0", id: 1, result: 123 });
  };
  assert.throws(() => mobileGateway("https://evil.test", transport));
  const server = mobileGateway("http://127.0.0.1:9999", transport).listen(
    0,
    "127.0.0.1",
  );
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    const response = await fetch(`${origin}/api/mobile/channels/eggsterr`, {
      headers: {
        authorization: "Bearer should-not-forward",
        cookie: "secret=test",
        "x-operator-token": "private",
      },
    });
    const body = await response.json();
    assert.deepEqual(body.markets, [sample]);
    assert.equal(body.channel, "eggsterr");
    assert.ok(
      calls.every(
        (c) =>
          !c.headers.has("authorization") &&
          !c.headers.has("cookie") &&
          !c.headers.has("x-operator-token"),
      ),
    );
    const count = calls.length;
    for (const path of [
      "/api/byte/markets",
      "/api/byte/operations",
      "/api/bridge",
      "/api/auth/challenge",
      "/api/byte/twitch/watch",
      "/api/byte/markets/pm_mobile/resolve",
    ])
      assert.equal(
        (
          await fetch(origin + path, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "{}",
          })
        ).status,
        404,
      );
    assert.equal(calls.length, count);
    assert.equal(
      (
        await fetch(`${origin}/api/byte/rpc`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "requestAirdrop",
          }),
        })
      ).status,
      403,
    );
    assert.equal(calls.length, count);
    assert.equal(
      (
        await fetch(`${origin}/api/byte/rpc`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "getBalance",
            params: [],
          }),
        })
      ).status,
      200,
    );
    assert.equal(calls.at(-1)?.url, "http://127.0.0.1:9999/api/byte/rpc");
    assert.equal(
      (await fetch(`${origin}/api/mobile/channels/%40`)).status,
      400,
    );
    assert.equal((await fetch(`${origin}/api/byte/config`)).status, 200);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
