const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");
const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, "..")];
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, "node_modules"),
  path.resolve(__dirname, "../node_modules"),
];
// The shared server/browser core uses NodeNext .js specifiers for its TS sources.
config.resolver.resolveRequest = (context, name, platform) => {
  if (name.startsWith(".") && name.endsWith(".js")) {
    try {
      return context.resolveRequest(context, name.slice(0, -3), platform);
    } catch {
      /* Try the actual JS module below. */
    }
  }
  if (["react", "react-native", "@solana/web3.js", "buffer"].includes(name))
    return context.resolveRequest(
      context,
      path.resolve(__dirname, "node_modules", name),
      platform,
    );
  return context.resolveRequest(context, name, platform);
};
module.exports = config;
