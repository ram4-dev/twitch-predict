import { PublicKey, Transaction } from "@solana/web3.js";

/** Bind a wallet response to the connected signer and the exact prepared message. */
export function validateWalletTransaction(
  preparedMessage: Uint8Array,
  signed: Transaction,
  signer: PublicKey,
): void {
  const actual = signed.serializeMessage();
  if (actual.length !== preparedMessage.length || actual.some((byte, i) => byte !== preparedMessage[i])) {
    throw new Error("La wallet modificó la transacción.");
  }
  const entry = signed.signatures.find(({ publicKey }) => publicKey.equals(signer));
  if (!entry?.signature || !signed.verifySignatures(false)) {
    throw new Error("La wallet no firmó la transacción correctamente.");
  }
}

export function requireTransactionSigner(tx: Transaction, signer: PublicKey): void {
  const message = tx.compileMessage();
  if (!message.accountKeys.slice(0, message.header.numRequiredSignatures).some((key) => key.equals(signer))) {
    throw new Error("La cuenta conectada no es firmante de la transacción.");
  }
}
