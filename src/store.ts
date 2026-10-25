import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import type { Prediction } from './prediction.js';
export type MarketAction = { id: string; kind: 'buy' | 'resolve' | 'claim' | 'refund'; status: 'pending' | 'done' | 'failed'; signatures: string[]; amountLamports?: string; outcomeId?: string; paidLamports?: string; error?: string; createdAt: string };
export type MarketRecord = {
  key: string; prediction: Prediction; network: string; phase: 'creating' | 'open' | 'resolving' | 'resolved' | 'void' | 'failed';
  winnerId?: string; actions?: MarketAction[]; tradingError?: string;
  oracle?: string; market?: string; outcomes: { id: string; title: string; mint?: string; launch?: string }[];
  signatures: string[]; error?: string; createdAt: string; updatedAt: string;
};
export class Store {
  records: Record<string, MarketRecord> = {};
  constructor(readonly directory: string) {}
  async load() { await mkdir(this.directory, { recursive: true, mode: 0o700 }); try { this.records = JSON.parse(await readFile(`${this.directory}/markets.json`, 'utf8')); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; } }
  async save() { const file = `${this.directory}/markets.json`; await writeFile(`${file}.tmp`, JSON.stringify(this.records, null, 2), { mode: 0o600 }); await rename(`${file}.tmp`, file); }
}
