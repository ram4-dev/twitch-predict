import { defineConfig } from '@playwright/test';
const legacy=process.env.MARKET_MODE==='solana';
const baseURL=process.env.APP_URL??(legacy?'http://twitch-predict.localhost:1356':'http://twitch-predict.localhost:1358');
export default defineConfig({testDir:'tests',testMatch:'*.e2e.ts',timeout:60000,workers:1,reporter:'list',use:{baseURL,screenshot:'only-on-failure'},webServer:legacy||process.env.APP_URL?undefined:{command:'tsx scripts/e2e-server.ts',url:`${baseURL}/api/health`,reuseExistingServer:false,timeout:30000,gracefulShutdown:{signal:'SIGTERM',timeout:5000}}});
