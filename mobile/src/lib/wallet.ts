import { PublicKey, Transaction } from "@solana/web3.js";
import {
  transact,
  type Web3MobileWallet,
} from "@solana-mobile/mobile-wallet-adapter-protocol-web3js";
import { SeekerConnect } from "@solana-mobile/seeker-connect-react-native";
import * as SecureStore from "expo-secure-store";
import { Buffer } from "buffer";
import { verifySignedMessage } from "./message-signature";
import type { WalletProvider } from "../../../src/byte-bet-core";
import { requireTransactionSigner, validateWalletTransaction } from "../../../src/plot-wallet-validation";
export type WalletKind = "mwa" | "seeker";
const tokenKey = "plot.mwa.authorization";
let identity = {
  name: "Plot",
  uri: "https://plot.localhost",
  icon: "favicon.ico",
};
export async function configureWallet(uri: string) {
  identity = { name: "Plot", uri, icon: "favicon.ico" };
  await SeekerConnect.configure({ identity, chain: "solana:devnet" });
}
async function authorize(wallet: Web3MobileWallet) {
  const authToken = await SecureStore.getItemAsync(tokenKey);
  const result = await wallet.authorize({
    chain: "solana:devnet",
    identity,
    ...(authToken ? { auth_token: authToken } : {}),
  });
  await SecureStore.setItemAsync(tokenKey, result.auth_token);
  const account = result.accounts[0];
  if (!account) throw new Error("La wallet no devolvió una cuenta.");
  return new PublicKey(Buffer.from(account.address, "base64"));
}
export function walletProvider(kind: WalletKind): WalletProvider & { connect(): Promise<{ publicKey: PublicKey }>; signMessage(message: Uint8Array, expectedWallet: string): Promise<Uint8Array> } {
  let key: PublicKey | undefined;
  return {
    get publicKey() {
      return key;
    },
    async connect() {
      if (key) return { publicKey: key };
      key =
        kind === "seeker"
          ? new PublicKey((await SeekerConnect.connect()).accounts[0].address)
          : await transact(authorize);
      return { publicKey: key };
    },
    async signMessage(message: Uint8Array, expectedWallet: string) {
      if (!key || key.toBase58() !== expectedWallet) throw new Error("La wallet cambió. Volvé a conectar.");
      const signer = key;
      const payload = Uint8Array.from(message);
      if (kind === "seeker") {
        const authorization = await SeekerConnect.connect();
        if (!authorization.accounts.some(account => new PublicKey(account.address).equals(signer))) throw new Error("La wallet cambió. Volvé a conectar.");
        if (typeof SeekerConnect.signMessages !== "function") throw new Error("La wallet no admite firma de mensajes.");
        const [signed] = await SeekerConnect.signMessages([signer.toBase58()], [payload]);
        if (!signed) throw new Error("La wallet no devolvió una firma.");
        return verifySignedMessage(payload, signed, signer);
      }
      return transact(async wallet => {
        const account = await authorize(wallet);
        if (!account.equals(signer)) throw new Error("La wallet cambió. Volvé a conectar.");
        if (typeof wallet.signMessages !== "function") throw new Error("La wallet no admite firma de mensajes.");
        const [signed] = await wallet.signMessages({addresses: [Buffer.from(signer.toBytes()).toString("base64")], payloads: [payload]});
        if (!signed) throw new Error("La wallet no devolvió una firma.");
        return verifySignedMessage(payload, signed, signer);
      });
    },
    async signTransaction(tx: Transaction) {
      if (!key) throw new Error("Conectá la wallet antes de firmar.");
      const signer = key;
      requireTransactionSigner(tx, signer);
      const message = Uint8Array.from(tx.serializeMessage());
      if (kind === "seeker") {
        const [bytes] = await SeekerConnect.signTransactions([
          tx.serialize({
            requireAllSignatures: false,
            verifySignatures: false,
          }),
        ]);
        const signed = Transaction.from(bytes);
        validateWalletTransaction(message, signed, signer);
        return signed;
      }
      return transact(async (wallet) => {
        const account = await authorize(wallet);
        if (!account.equals(signer))
          throw new Error("La wallet cambió. Volvé a conectar.");
        const [signed] = await wallet.signTransactions({ transactions: [tx] });
        validateWalletTransaction(message, signed, signer);
        return signed;
      });
    },
    async disconnect() {
      await SecureStore.deleteItemAsync(tokenKey);
      await SeekerConnect.disconnect();
      key = undefined;
    },
  };
}
export async function seekerAvailable() {
  return (await SeekerConnect.walletAvailability()) === "certified";
}
export function walletError(error: unknown): string {
  const code = (error as { code?: string | number })?.code;
  if (
    code === 4001 ||
    code === -3 ||
    ["authorization-declined", "request-declined", "cancelled"].includes(
      String(code),
    )
  )
    return "Cancelaste la solicitud en tu wallet. No se envió una apuesta.";
  if (
    /not found|no.*wallet|activity.*not|resolve.*activity/i.test(String(error))
  )
    return "No encontramos una wallet compatible. Instalá Phantom o Solflare y volvé a intentar.";
  return error instanceof Error
    ? error.message
    : "No se pudo completar la operación. Reintentá.";
}
