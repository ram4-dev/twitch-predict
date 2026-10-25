// Offchain is the default POC. The earlier chain prototype remains opt-in.
// Local OAuth credentials stay in the ignored server-only file, never in bundles.
if(process.env.APP_ENV_FILE)process.loadEnvFile(process.env.APP_ENV_FILE);
if (process.env.MARKET_MODE === 'solana') await import('./solana-server.js');
else await import('./offchain-server.js');
