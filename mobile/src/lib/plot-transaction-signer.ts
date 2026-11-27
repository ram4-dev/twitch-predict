import { Buffer } from 'buffer';
import { PublicKey, Transaction } from '@solana/web3.js';
import type { PlotTransactionSigner } from './plot-intent-client';
export interface PlotWalletPort { connect(): Promise<{ publicKey: PublicKey }>; signTransaction(tx: Transaction): Promise<Transaction> }
/** Checks the wallet and exact message independently of the fee payer. */
export class PlotWalletSigner implements PlotTransactionSigner {
  constructor(private readonly wallet: PlotWalletPort) {}
  async sign(encoded: string, expectedWallet: string): Promise<string> {
    if (encoded.length > 2000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error('Transacción inválida.');
    const tx = Transaction.from(Buffer.from(encoded, 'base64'));
    const expected = new PublicKey(expectedWallet);
    const account = await this.wallet.connect();
    if (!account.publicKey.equals(expected)) throw new Error('La wallet cambió.');
    const message = Buffer.from(tx.serializeMessage());
    const required = tx.compileMessage().accountKeys.slice(0, tx.compileMessage().header.numRequiredSignatures);
    if (!required.some(key => key.equals(expected))) throw new Error('La wallet no es firmante requerida.');
    const signed = await this.wallet.signTransaction(tx);
    if (!Buffer.from(signed.serializeMessage()).equals(message) || !signed.signatures.some(entry => entry.publicKey.equals(expected) && entry.signature) || !signed.verifySignatures(false)) throw new Error('La firma o el mensaje no coinciden.');
    return Buffer.from(signed.serialize({ requireAllSignatures: false, verifySignatures: true })).toString('base64');
  }
}
