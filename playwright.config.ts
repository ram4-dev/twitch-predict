import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir:'tests', testMatch:'*.e2e.ts', timeout:120000, workers:1, reporter:'list', use:{ baseURL:process.env.APP_URL ?? 'http://twitch-predict.localhost:1356', screenshot:'only-on-failure' } });
