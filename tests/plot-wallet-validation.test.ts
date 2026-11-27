import { test } from "node:test";
import assert from "node:assert/strict";
import { Keypair, SystemProgram, Transaction } from "@solana/web3.js";
import { requireTransactionSigner, validateWalletTransaction } from "../src/plot-wallet-validation.js";

test("a distinct fee payer permits the connected user to sign without SOL", () => {
  const user = Keypair.generate(), sponsor = Keypair.generate();
  const tx = new Transaction({ feePayer: sponsor.publicKey, recentBlockhash: Keypair.generate().publicKey.toBase58() }).add(
    SystemProgram.transfer({ fromPubkey: user.publicKey, toPubkey: Keypair.generate().publicKey, lamports: 1 }),
  );
  const message = Uint8Array.from(tx.serializeMessage());
  requireTransactionSigner(tx, user.publicKey);
  tx.partialSign(user);
  validateWalletTransaction(message, tx, user.publicKey);
  assert.throws(() => requireTransactionSigner(tx, Keypair.generate().publicKey));
  assert.throws(() => validateWalletTransaction(message, tx, sponsor.publicKey));
  tx.instructions[0].data[4] ^= 1;
  assert.throws(() => validateWalletTransaction(message, tx, user.publicKey));
});
