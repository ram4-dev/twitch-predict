import { allowLocalGateway } from "./config";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";
import {
  checkReceipt,
  executeBet,
  rpcConnection,
  type BetReceipt,
} from "../../../src/byte-bet-core";
import type { ByteConfig, DisplayByteMarket } from "../../../src/byte-model";
import { mobileApiOrigin } from "./api";
import { preferences, readReceipts, saveReceipt } from "./storage";
import {
  configureWallet,
  seekerAvailable,
  walletError,
  walletProvider,
  type WalletKind,
} from "./wallet";

function usePlotState() {
  const [ready, setReady] = useState(false),
    [base, setBase] = useState(""),
    [address, setAddress] = useState(""),
    [kind, setKind] = useState<WalletKind>("mwa"),
    [certified, setCertified] = useState(false),
    [history, setHistory] = useState<BetReceipt[]>([]),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(""),
    [error, setError] = useState("");
  const lock = useRef(false),
    provider = useMemo(() => walletProvider(kind), [kind]);
  const reloadHistory = useCallback(async () => {
    setHistory(await readReceipts(base));
  }, [base]);
  useEffect(() => {
    void (async () => {
      const raw =
        (await preferences.get("server")) ??
        process.env.EXPO_PUBLIC_API_URL ??
        "";
      if (raw)
        try {
          setBase(mobileApiOrigin(raw, allowLocalGateway));
        } catch {
          setError(
            "La dirección guardada del servidor no es válida. Revisala en Conexión.",
          );
        }
      setKind(
        (await preferences.get("wallet-kind")) === "seeker" ? "seeker" : "mwa",
      );
      setAddress((await preferences.get("wallet-address")) ?? "");
      setReady(true);
    })().catch((e) => {
      setError(walletError(e));
      setReady(true);
    });
  }, []);
  useEffect(() => {
    if (!base) return;
    void reloadHistory();
    void configureWallet(
      base.startsWith("https:") ? base : "https://plot.localhost",
    )
      .then(() => seekerAvailable())
      .then(setCertified)
      .catch(() => setCertified(false));
  }, [base, reloadHistory]);
  const recover = useCallback(async () => {
    if (!base || lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const rpc = rpcConnection(base);
      for (const receipt of await readReceipts(base))
        if (
          receipt.status === "pending" ||
          (receipt.status === "confirmed" && !receipt.synced)
        )
          await checkReceipt(receipt, rpc, {
            base,
            save: (r) => saveReceipt(base, r),
          });
    } catch (e) {
      setError(walletError(e));
    } finally {
      lock.current = false;
      setBusy(false);
      await reloadHistory();
    }
  }, [base, reloadHistory]);
  useEffect(() => {
    if (ready && base) void recover();
    const listener = AppState.addEventListener("change", (s) => {
      if (s === "active") void recover();
    });
    return () => listener.remove();
  }, [ready, base, recover]);
  const connect = async (nextKind: WalletKind) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setProgress("Abrí tu wallet para conectar…");
    try {
      if (!base) throw new Error("Configurá primero el servidor en Conexión.");
      const next = walletProvider(nextKind),
        result = await next.connect();
      setKind(nextKind);
      setAddress(result.publicKey.toString());
      await preferences.set("wallet-kind", nextKind);
      await preferences.set("wallet-address", result.publicKey.toString());
    } catch (e) {
      setError(walletError(e));
    } finally {
      lock.current = false;
      setBusy(false);
      setProgress("");
    }
  };
  const disconnect = async () => {
    if (lock.current) return;
    await provider.disconnect?.();
    setAddress("");
    await preferences.set("wallet-address", "");
  };
  const setServer = async (raw: string) => {
    if (lock.current) throw new Error("Esperá a que termine la operación.");
    const origin = mobileApiOrigin(raw, allowLocalGateway);
    await preferences.set("server", origin);
    await provider.disconnect?.();
    setAddress("");
    await preferences.set("wallet-address", "");
    setBase(origin);
    setError("");
  };
  const bet = async (
    market: DisplayByteMarket,
    option: number,
    amount: string,
    config: ByteConfig,
  ) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setProgress("Preparando apuesta…");
    try {
      if (!address) throw new Error("Conectá tu wallet antes de apostar.");
      const receipt = await executeBet(
        market,
        option,
        amount,
        address,
        config,
        setProgress,
        async () => reloadHistory(),
        {
          provider,
          store: { base, save: (r) => saveReceipt(base, r) },
          receipts: await readReceipts(base),
        },
      );
      setProgress(
        receipt.status === "confirmed"
          ? "Apuesta confirmada en Solana."
          : receipt.status === "pending"
            ? "Confirmación pendiente. Revisala en Mis apuestas."
            : "La transacción no se confirmó. Revisala en Mis apuestas.",
      );
      return receipt;
    } catch (e) {
      setError(walletError(e));
      throw e;
    } finally {
      lock.current = false;
      setBusy(false);
      await reloadHistory();
    }
  };
  return {
    ready,
    base,
    address,
    kind,
    certified,
    history,
    busy,
    progress,
    error,
    setError,
    connect,
    disconnect,
    setServer,
    bet,
    recover,
  };
}
type PlotState = ReturnType<typeof usePlotState>;
const Context = createContext<PlotState | null>(null);
export function PlotProvider({ children }: { children: React.ReactNode }) {
  const state = usePlotState();
  return <Context.Provider value={state}>{children}</Context.Provider>;
}
export function usePlot() {
  const state = useContext(Context);
  if (!state) throw new Error("PlotProvider missing");
  return state;
}
