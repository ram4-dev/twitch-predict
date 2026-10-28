import { validateSignedBet } from "./byte-signed-transaction.js";
import { Buffer } from "buffer";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { getBase58Decoder } from "@solana/kit";
import {
  BYTE_PROGRAM,
  DEVNET_GENESIS,
  solToLamports,
  type ByteConfig,
  type DisplayByteMarket,
} from "./byte-model.js";

export type WalletProvider = {
  isPhantom?: boolean;
  publicKey?: { toString(): string };
  connect(options?: {
    onlyIfTrusted: boolean;
  }): Promise<{ publicKey: { toString(): string } }>;
  disconnect?(): Promise<void>;
  signTransaction(tx: Transaction): Promise<Transaction>;
};
export type BetReceipt = {
  signature: string;
  marketId: string;
  title: string;
  wallet: string;
  option: number;
  amount: string;
  lastValidBlockHeight: number;
  createdAt: string;
  status: "pending" | "confirmed" | "failed" | "expired";
  synced?: boolean;
};
export const rpcConnection = (base: string) =>
  new Connection(`${base}/api/byte/rpc`, {
    commitment: "confirmed",
    disableRetryOnRateLimit: true,
  });
const u64 = (value: bigint) => {
  const data = Buffer.alloc(8);
  data.writeBigUInt64LE(value);
  return data;
};
export function placeBetInstruction(
  market: string,
  bettor: string,
  option: number,
  amount: bigint,
  nonce: bigint,
) {
  const programId = new PublicKey(BYTE_PROGRAM),
    marketKey = new PublicKey(market),
    walletKey = new PublicKey(bettor);
  if (
    !Number.isInteger(option) ||
    option < 0 ||
    option > 5 ||
    amount < 100_000n ||
    amount > 0xffffffffffffffffn
  )
    throw new Error("Apuesta inválida");
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), marketKey.toBuffer()],
    programId,
  );
  const [bet] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("bet"),
      marketKey.toBuffer(),
      walletKey.toBuffer(),
      u64(nonce),
    ],
    programId,
  );
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: marketKey, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: bet, isSigner: false, isWritable: true },
      { pubkey: walletKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      Buffer.from([222, 62, 67, 220, 63, 166, 126, 33]),
      Buffer.from([option]),
      u64(amount),
      u64(nonce),
      u64(0n),
    ]),
  });
}
export type ReceiptStore = {
  base: string;
  save(receipt: BetReceipt): void | Promise<void>;
};
async function syncReceipt(receipt: BetReceipt, store: ReceiptStore) {
  try {
    const response = await fetch(
      `${store.base}/api/byte/markets/${encodeURIComponent(receipt.marketId)}/sync`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet: receipt.wallet }),
        signal: AbortSignal.timeout(25000),
      },
    );
    receipt.synced = response.ok;
    await store.save(receipt);
  } catch {
    /* The transaction remains confirmed even if byte is temporarily unavailable. */
  }
}
export async function checkReceipt(
  receipt: BetReceipt,
  rpc: Connection,
  store: ReceiptStore,
): Promise<BetReceipt> {
  if (receipt.status === "confirmed") {
    if (!receipt.synced) await syncReceipt(receipt, store);
    return receipt;
  }
  if (receipt.status !== "pending") return receipt;
  const {
    value: [status],
  } = await rpc.getSignatureStatuses([receipt.signature], {
    searchTransactionHistory: true,
  });
  if (status?.err) receipt.status = "failed";
  else if (
    status &&
    (status.confirmationStatus === "confirmed" ||
      status.confirmationStatus === "finalized")
  )
    receipt.status = "confirmed";
  else if (
    !status &&
    (await rpc.getBlockHeight("finalized")) > receipt.lastValidBlockHeight
  )
    receipt.status = "expired";
  await store.save(receipt);
  if (receipt.status === "confirmed") await syncReceipt(receipt, store);
  return receipt;
}
export async function executeBet(
  market: DisplayByteMarket,
  option: number,
  amountInput: string,
  walletAddress: string,
  config: ByteConfig,
  onProgress: (message: string) => void,
  onReceipt: ((receipt: BetReceipt) => Promise<void>) | undefined,
  execution: {
    provider: WalletProvider;
    store: ReceiptStore;
    receipts: BetReceipt[];
  },
) {
  const wallet = execution.provider;
  const store = execution.store;
  if (
    execution.receipts.some(
      (r) =>
        r.wallet === walletAddress &&
        r.marketId === market.id &&
        r.status === "pending",
    )
  )
    throw new Error(
      "Hay una transacción pendiente para este mercado. Revisala en Mis apuestas antes de enviar otra.",
    );
  const amount = solToLamports(amountInput);
  if (
    !config.enabled ||
    config.sol.cluster !== "devnet" ||
    config.sol.programId !== BYTE_PROGRAM
  )
    throw new Error("La configuración de devnet no está habilitada.");
  if (
    market.currency !== "sol" ||
    !market.bettable ||
    market.status !== "open" ||
    Date.now() >= market.closeMs
  )
    throw new Error("Este mercado no acepta apuestas en SOL.");
  if (
    option < 0 ||
    option >= market.options.length ||
    amount > BigInt(config.sol.maxBet) ||
    BigInt(market.total) + amount > BigInt(config.sol.maxPool)
  )
    throw new Error("La apuesta supera los límites del mercado.");
  const rpc = rpcConnection(store.base);
  onProgress("Verificando devnet y saldo…");
  if ((await rpc.getGenesisHash()) !== DEVNET_GENESIS)
    throw new Error("La conexión no corresponde a devnet.");
  const connected = await wallet.connect();
  if (connected.publicKey.toString() !== walletAddress)
    throw new Error("La wallet cambió. Volvé a conectar antes de apostar.");
  const bettor = new PublicKey(walletAddress);
  const balance = await rpc.getBalance(bettor);
  if (BigInt(balance) <= amount)
    throw new Error(
      "Necesitás SOL devnet para la apuesta, la cuenta y las comisiones.",
    );
  // Re-read the authoritative close/status after network waits, before requesting a signature.
  const response = await fetch(
    `${store.base}/api/byte/markets/${encodeURIComponent(market.id)}`,
    { signal: AbortSignal.timeout(25000) },
  );
  if (!response.ok)
    throw new Error("No se pudo verificar el estado actual del mercado.");
  const current = (await response.json()).market as DisplayByteMarket;
  if (
    !current.bettable ||
    current.status !== "open" ||
    current.chain.market !== market.chain.market ||
    Date.now() >= current.closeMs
  )
    throw new Error("El mercado cerró o cambió. Actualizá la lista.");
  const nonce = new DataView(
    crypto.getRandomValues(new Uint8Array(8)).buffer,
  ).getBigUint64(0, true);
  const latest = await rpc.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: bettor, ...latest }).add(
    placeBetInstruction(
      market.chain.market,
      walletAddress,
      option,
      amount,
      nonce,
    ),
  );
  onProgress("Confirmá la apuesta en tu wallet (SOL devnet)…");
  const expected = Transaction.from(
    tx.serialize({ requireAllSignatures: false, verifySignatures: false }),
  );
  const signed = validateSignedBet(expected, await wallet.signTransaction(tx));
  if (wallet.publicKey && wallet.publicKey.toString() !== walletAddress)
    throw new Error("La wallet cambió durante la firma.");
  const receipt: BetReceipt = {
    signature: getBase58Decoder().decode(signed.signature!),
    marketId: market.id,
    title: market.title,
    wallet: walletAddress,
    option,
    amount: amount.toString(),
    lastValidBlockHeight: latest.lastValidBlockHeight,
    createdAt: new Date().toISOString(),
    status: "pending",
  };
  // Save the deterministic signature BEFORE broadcast. A timeout must not invite a duplicate bet.
  await store.save(receipt);
  await onReceipt?.(receipt);
  onProgress("Enviando y esperando confirmación en Solana…");
  try {
    const signature = await rpc.sendRawTransaction(signed.serialize(), {
      skipPreflight: false,
      maxRetries: 2,
    });
    if (signature !== receipt.signature)
      throw new Error("Firma inesperada del RPC");
  } catch {
    onProgress("El envío no se pudo confirmar. Revisando la firma guardada…");
  }
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      await checkReceipt(receipt, rpc, store);
    } catch {
      /* A temporarily unavailable RPC leaves a recoverable pending receipt. */
    }
    if (receipt.status !== "pending") return receipt;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return receipt;
}
