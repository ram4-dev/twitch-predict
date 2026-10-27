/** Isolated backend + allowlisted gateway. No private keys or live partner requests. */
import { spawn } from "node:child_process";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { mobileGateway } from "../src/mobile-gateway.js";
const directory = resolve("mobile/artifacts/fixture");
await mkdir(directory, { recursive: true });
const fixture = resolve(directory, "byte-fixture.json"),
  twitch = resolve(directory, "twitch-fixture.json");
await writeFile(
  fixture,
  JSON.stringify({
    markets: [],
    signatures: {},
    broadcasts: 0,
    resolutions: 0,
    invalidations: 0,
    syncs: 0,
  }),
);
await writeFile(twitch, "[]");
const child = spawn(
  "portless",
  [
    "plot-mobile-fixture",
    process.execPath,
    "--import",
    "tsx",
    "--import",
    resolve("tests/fixtures/twitch-preload.mjs"),
    "--import",
    resolve("tests/fixtures/byte-preload.mjs"),
    "src/server.ts",
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      MARKET_MODE: "byte",
      APP_ENV_FILE: "",
      BYTE_API_KEY: "byte-e2e-only",
      BYTE_BASE_URL: "https://app.bytearena.fun",
      BYTE_RPC_URL: "https://api.devnet.solana.com",
      BYTE_OPERATOR_WALLETS: "",
      BYTE_FIXTURE_FILE: fixture,
      TWITCH_FIXTURE_FILE: twitch,
      DATA_DIR: directory,
      E2E_SERVER_PID_FILE: resolve(directory, "backend.pid"),
    },
  },
);
// Backend deliberately retains its host allowlist. Use Portless's assigned listener directly.
const pidFile = resolve(directory, "backend.pid");
let backendPort = 0;
for (let i = 0; i < 100; i++) {
  try {
    const routes = JSON.parse(
      await readFile(
        resolve(
          process.env.PORTLESS_STATE_DIR ?? resolve(homedir(), ".portless"),
          "routes.json",
        ),
        "utf8",
      ),
    );
    const route = routes.find(
      (r: { hostname: string }) =>
        r.hostname === "plot-mobile-fixture.localhost",
    );
    if (route?.port) {
      backendPort = route.port;
      break;
    }
  } catch {
    /* Wait until Portless registered the isolated route. */
  }
  await new Promise((r) => setTimeout(r, 200));
}
if (!backendPort) {
  child.kill();
  throw new Error("No se encontró el puerto de Portless.");
}
const upstream = `http://127.0.0.1:${backendPort}`;
for (let i = 0; i < 100; i++) {
  try {
    if ((await fetch(upstream + "/api/health")).ok) break;
  } catch {
    /* Booting. */
  }
  await new Promise((r) => setTimeout(r, 200));
}
const headers = {
  "content-type": "application/json",
  "sec-fetch-site": "same-origin",
  origin: upstream,
};
const token = (
  await readFile(resolve(directory, "bridge-token"), "utf8")
).trim();
for (const title of ["¿Gana la próxima partida?", "¿Llega a la final?"]) {
  const response = await fetch(upstream + "/api/byte/markets", {
    method: "POST",
    headers: { ...headers, "x-operator-token": token },
    body: JSON.stringify({
      channel: "fixture_streamer",
      title,
      options: ["Sí, gana", "No, pierde"],
      currency: "sol",
      windowSecs: 604800,
      rules:
        "Mercado de prueba para validar la app Android. Transporte simulado; no hay fondos reales.",
      requestId: crypto.randomUUID(),
    }),
  });
  if (!response.ok) throw new Error("No se pudo crear el fixture móvil");
}
const gateway = mobileGateway(upstream).listen(
  Number(process.env.PORT ?? 3000),
  "127.0.0.1",
  () => console.log("Mobile fixture gateway ready. Buscar @fixture_streamer."),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    void readFile(pidFile, "utf8")
      .then((pid) => process.kill(Number(pid), signal))
      .catch(() => {});
    child.kill(signal);
    gateway.close(() => process.exit(0));
  });
