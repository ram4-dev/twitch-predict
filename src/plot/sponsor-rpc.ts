import { Connection, Message } from '@solana/web3.js';
import type { SponsorDependencies } from './sponsor.js';

const DEVNET_GENESIS = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
/** Call once at startup and use the returned methods only with this verified connection. */
export async function devnetSponsorRpc(connection: Connection): Promise<Pick<SponsorDependencies, 'fee' | 'send' | 'outcome' | 'finalizedBlockHeight'>> {
  if (await connection.getGenesisHash() !== DEVNET_GENESIS) throw new Error('Sponsor RPC is not devnet');
  return sponsorRpc(connection);
}
/** The caller must first verify the cluster genesis. */
export function sponsorRpc(connection:Connection): Pick<SponsorDependencies, 'fee' | 'send' | 'outcome' | 'finalizedBlockHeight'> {
  return {
    async fee(message) {
      const result = await connection.getFeeForMessage(Message.from(message), 'confirmed');
      if (result.value === null || !Number.isSafeInteger(result.value) || result.value <= 0) throw new Error('Unable to estimate fee');
      return BigInt(result.value);
    },
    async send(raw) { await connection.sendRawTransaction(raw, { skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 0 }); },
    async outcome(signature) {
      const result = await connection.getSignatureStatuses([signature], { searchTransactionHistory: true });
      const status = result.value[0];
      if (!status || status.confirmationStatus !== 'finalized') return 'unknown';
      return status.err ? 'failed' : 'confirmed';
    },
    async finalizedBlockHeight() { return connection.getBlockHeight('finalized'); },
  };
}
