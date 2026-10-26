import AsyncStorage from "@react-native-async-storage/async-storage";
import type { BetReceipt } from "../../../src/byte-bet-core";
const key = (base: string) => `plot.receipts.v1.${base}`;
// Serialize read/modify/write, including simultaneous confirmation and refresh.
let queue = Promise.resolve();
export async function readReceipts(base: string): Promise<BetReceipt[]> {
  await queue;
  const raw = await AsyncStorage.getItem(key(base));
  return raw ? JSON.parse(raw) : [];
}
export function saveReceipt(base: string, receipt: BetReceipt): Promise<void> {
  const snapshot = { ...receipt };
  const next = queue.then(async () => {
    const raw = await AsyncStorage.getItem(key(base)),
      all: BetReceipt[] = raw ? JSON.parse(raw) : [];
    await AsyncStorage.setItem(
      key(base),
      JSON.stringify([
        snapshot,
        ...all.filter((r) => r.signature !== snapshot.signature),
      ]),
    );
  });
  queue = next.catch(() => {});
  return next;
}
export const preferences = {
  async get(name: string) {
    return AsyncStorage.getItem(`plot.${name}`);
  },
  async set(name: string, value: string) {
    await AsyncStorage.setItem(`plot.${name}`, value);
  },
};
