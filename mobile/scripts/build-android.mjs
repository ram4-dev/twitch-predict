import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
const env = { ...process.env, NODE_ENV: "production" };
if (process.platform === "darwin") {
  const sdk = join(homedir(), "Library/Android/sdk");
  if (!env.ANDROID_HOME && existsSync(sdk)) env.ANDROID_HOME = sdk;
  const jdk = "/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home";
  if (!env.JAVA_HOME && existsSync(jdk)) env.JAVA_HOME = jdk;
}
// Expo inlines public variables. A new profile must not reuse the prior JS bundle.
rmSync(
  new URL(
    "../android/app/build/generated/assets/react/release",
    import.meta.url,
  ),
  { recursive: true, force: true },
);
const result = spawnSync(
  "./gradlew",
  [
    "assembleRelease",
    "-PreactNativeArchitectures=arm64-v8a",
    "--console=plain",
    "--max-workers=3",
  ],
  { cwd: new URL("../android", import.meta.url), stdio: "inherit", env },
);
if (result.status === 0) {
  const directory = new URL("../artifacts/", import.meta.url);
  mkdirSync(directory, { recursive: true });
  const name =
    env.EXPO_PUBLIC_LOCAL_GATEWAY === "1"
      ? "plot-android-local-devnet.apk"
      : "plot-android-https.apk";
  copyFileSync(
    new URL(
      "../android/app/build/outputs/apk/release/app-release.apk",
      import.meta.url,
    ),
    new URL(name, directory),
  );
  console.log(`APK: mobile/artifacts/${name}`);
}
process.exit(result.status ?? 1);
