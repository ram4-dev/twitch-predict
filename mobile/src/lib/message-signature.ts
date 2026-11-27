import { ed25519 } from '@noble/curves/ed25519';
import { PublicKey } from '@solana/web3.js';

/** MWA returns the original payload followed by one 64-byte signature per address. */
export function verifySignedMessage(message: Uint8Array, signed: Uint8Array, signer: PublicKey): Uint8Array {
  if (signed.length !== message.length + 64 || message.some((byte, i) => signed[i] !== byte)) throw new Error('La wallet modificó el mensaje.');
  const signature = signed.slice(message.length);
  if (!ed25519.verify(signature, message, signer.toBytes())) throw new Error('La firma de la wallet no es válida.');
  return signature;
}
