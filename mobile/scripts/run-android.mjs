import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const state = process.env.PORTLESS_STATE_DIR ?? join(homedir(), ".portless");
const route = JSON.parse(readFileSync(join(state, "routes.json"), "utf8")).find(
  (r) => r.hostname === "plot-mobile.localhost",
);
if (!route?.port)
  throw new Error("Arrancá primero npm start para abrir Metro con Portless.");
const env = { ...process.env };
if (process.platform === "darwin") {
  const sdk = join(homedir(), "Library/Android/sdk"),
    jdk = "/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home";
  if (!env.ANDROID_HOME && existsSync(sdk)) env.ANDROID_HOME = sdk;
  if (!env.JAVA_HOME && existsSync(jdk)) env.JAVA_HOME = jdk;
}
const result = spawnSync(
  "npx",
  [
    "expo",
    "run:android",
    "--no-bundler",
    "--port",
    String(route.port),
    ...process.argv.slice(2),
  ],
  { cwd: new URL("..", import.meta.url), stdio: "inherit", env },
);
process.exit(result.status ?? 1);
