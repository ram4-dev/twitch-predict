import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const state = process.env.PORTLESS_STATE_DIR ?? join(homedir(), ".portless");
const route = JSON.parse(readFileSync(join(state, "routes.json"), "utf8")).find(
  (r) => r.hostname === "plot-mobile-test.localhost",
);
if (!route?.port) throw new Error("Arrancá primero npm run dev:fixture.");
const result = spawnSync("npm", ["run", "build:android"], {
  cwd: new URL("..", import.meta.url),
  stdio: "inherit",
  env: {
    ...process.env,
    EXPO_PUBLIC_LOCAL_GATEWAY: "1",
    EXPO_PUBLIC_API_URL: `http://10.0.2.2:${route.port}`,
  },
});
process.exit(result.status ?? 1);
