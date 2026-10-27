import {
  executeBet,
  checkReceipt as inspectReceipt,
  rpcConnection,
  type BetReceipt,
  type ReceiptStore,
  type WalletProvider,
} from "./byte-bet-core.js";
import type { ByteConfig, DisplayByteMarket } from "./byte-model.js";
export { placeBetInstruction } from "./byte-bet-core.js";
export type {
  BetReceipt,
  ReceiptStore,
  WalletProvider,
} from "./byte-bet-core.js";
export const phantom = () => {
  const injected = window as unknown as {
    phantom?: { solana?: WalletProvider };
    solana?: WalletProvider;
  };
  return injected.phantom?.solana?.isPhantom
    ? injected.phantom.solana
    : injected.solana?.isPhantom
      ? injected.solana
      : undefined;
};
const receiptKey = "byteDevnetReceipts";
export function receipts(): BetReceipt[] {
  try {
    return JSON.parse(localStorage.getItem(receiptKey) ?? "[]");
  } catch {
    return [];
  }
}
function saveReceipt(receipt: BetReceipt) {
  const all = receipts().filter((r) => r.signature !== receipt.signature);
  localStorage.setItem(receiptKey, JSON.stringify([receipt, ...all]));
}
export const connection = (base = location.origin) => rpcConnection(base);
const browserStore = (): ReceiptStore => ({
  base: location.origin,
  save: saveReceipt,
});
export const checkReceipt = (
  receipt: BetReceipt,
  rpc = connection(),
  store = browserStore(),
) => inspectReceipt(receipt, rpc, store);
export async function sendBet(
  market: DisplayByteMarket,
  option: number,
  amount: string,
  address: string,
  config: ByteConfig,
  onProgress: (message: string) => void,
  onReceipt?: (receipt: BetReceipt) => Promise<void>,
  execution?: {
    provider: WalletProvider;
    store: ReceiptStore;
    receipts: BetReceipt[];
  },
) {
  const provider = execution?.provider ?? phantom();
  if (!provider?.isPhantom) throw new Error("Instalá Phantom para apostar.");
  return executeBet(
    market,
    option,
    amount,
    address,
    config,
    onProgress,
    onReceipt,
    execution ?? { provider, store: browserStore(), receipts: receipts() },
  );
}
