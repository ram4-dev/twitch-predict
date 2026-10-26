// Offchain is the default POC. The earlier chain prototype remains opt-in.
// Local OAuth credentials stay in the ignored server-only file, never in bundles.
import {existsSync} from 'node:fs';
// Explicit APP_ENV_FILE='' keeps isolated test servers independent of local secrets.
const envFile=process.env.APP_ENV_FILE??'.env';
if(envFile&&existsSync(envFile))process.loadEnvFile(envFile);
if (process.env.MARKET_MODE === 'solana') await import('./solana-server.js');
else await import('./offchain-server.js');
