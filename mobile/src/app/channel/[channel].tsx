import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  TextInput,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import {
  Action,
  Copy,
  Mascot,
  Notice,
  Screen,
  ServerNeeded,
  Title,
  colors,
  styles,
} from "../../components/ui";
import { usePlot } from "../../lib/state";
import { channelMarkets, twitchChannel } from "../../lib/api";
import type { ByteConfig, DisplayByteMarket } from "../../../../src/byte-model";
import { solToLamports } from "../../../../src/byte-model";
const sol = (amount: number) =>
  new Intl.NumberFormat("es-AR", { maximumFractionDigits: 9 }).format(
    amount / 1e9,
  );
type Selection = { market: DisplayByteMarket; option: number; amount: string };
export default function Channel() {
  const { channel: raw } = useLocalSearchParams<{ channel: string }>(),
    plot = usePlot();
  let channel = "";
  try {
    channel = twitchChannel(raw ?? "");
  } catch {
    /* Show the invalid-link state. */
  }
  const [markets, setMarkets] = useState<DisplayByteMarket[]>([]),
    [config, setConfig] = useState<ByteConfig>(),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [checkedAt, setCheckedAt] = useState(0),
    [now, setNow] = useState(Date.now()),
    [selection, setSelection] = useState<Selection>(),
    [amounts, setAmounts] = useState<Record<string, string>>({});
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    if (!plot.base || !channel) {
      setLoading(false);
      return;
    }
    const id = ++sequence.current;
    try {
      const next = await channelMarkets(plot.base, channel);
      if (id !== sequence.current) return;
      setMarkets(next.markets);
      setConfig(next.config);
      setCheckedAt(next.checkedAt);
      setError("");
    } catch (e) {
      if (id === sequence.current) setError((e as Error).message);
    } finally {
      if (id === sequence.current) setLoading(false);
    }
  }, [plot.base, channel]);
  useEffect(() => {
    const requestSequence = sequence;
    void refresh();
    const timer = setInterval(() => void refresh(), 6000),
      clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      requestSequence.current++;
      clearInterval(timer);
      clearInterval(clock);
    };
  }, [refresh]);
  const fresh = checkedAt > 0 && now - checkedAt < 30000 && !error;
  const select = (market: DisplayByteMarket, option: number) => {
    setError("");
    plot.setError("");
    const amount = (amounts[market.id] ?? "0.01").replace(",", ".");
    try {
      const value = solToLamports(amount);
      if (
        !config ||
        value > BigInt(config.sol.maxBet) ||
        BigInt(market.total) + value > BigInt(config.sol.maxPool)
      )
        throw new Error("La apuesta supera los límites del mercado.");
      setSelection({ market, option, amount });
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const confirm = async () => {
    if (!selection || !config) return;
    try {
      await plot.bet(
        selection.market,
        selection.option,
        selection.amount,
        config,
      );
      setSelection(undefined);
      await refresh();
    } catch {
      /* The provider exposes the error beside the confirmation. */
    }
  };
  return (
    <Screen
      back
      refresh={
        <RefreshControl
          refreshing={false}
          onRefresh={() => void refresh()}
          tintColor={colors.ink}
        />
      }
    >
      <View style={{ gap: 6 }}>
        <Copy style={styles.label}>Predicciones del stream</Copy>
        <Title>{channel ? `@${channel}` : "Enlace inválido"}</Title>
        <Copy style={styles.subtle}>
          SOL devnet · Se confirman con tu wallet
        </Copy>
      </View>
      {!channel ? (
        <Notice error>
          Este enlace no contiene un canal de Twitch válido.
        </Notice>
      ) : !plot.base ? (
        <ServerNeeded />
      ) : loading ? (
        <View style={styles.panel}>
          <ActivityIndicator color={colors.ink} />
          <Copy>Buscando predicciones…</Copy>
        </View>
      ) : (
        <>
          {error && <Notice error>{error}</Notice>}
          {!markets.length && !error && (
            <View style={[styles.panel, { gap: 12 }]}>
              <Mascot />
              <Copy style={styles.section}>Por ahora, no hay jugada.</Copy>
              <Copy>
                No encontramos predicciones abiertas de @{channel} en Plot.
              </Copy>
              <Copy style={styles.subtle}>
                El canal tiene que estar seguido por Plot y la predicción debe
                tener tiempo suficiente para replicarse.
              </Copy>
              <Action
                title="Volver a consultar"
                secondary
                onPress={() => void refresh()}
              />
            </View>
          )}
          {markets.map((m) => {
            const open = m.bettable && m.status === "open" && now < m.closeMs,
              remaining = Math.max(0, Math.ceil((m.closeMs - now) / 1000)),
              amount = amounts[m.id] ?? "0.01";
            return (
              <View key={m.id} style={styles.panel}>
                <View style={styles.row}>
                  <Copy style={styles.label}>
                    {open
                      ? remaining >= 86400
                        ? `Cierra en ${Math.ceil(remaining / 86400)} días`
                        : remaining >= 3600
                          ? `Cierra en ${Math.floor(remaining / 3600)} h ${Math.floor((remaining % 3600) / 60)} min`
                          : `Cierra en ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`
                      : "Apuestas cerradas"}
                  </Copy>
                  <Copy style={styles.badge}>SOL devnet</Copy>
                </View>
                <Copy
                  accessibilityRole="header"
                  style={{ fontSize: 22, lineHeight: 28, fontWeight: "600" }}
                >
                  {m.title}
                </Copy>
                <View style={styles.row}>
                  <View>
                    <Copy style={styles.label}>Pozo de la comunidad</Copy>
                    <Copy style={{ fontSize: 28, lineHeight: 36 }}>
                      {sol(m.total)} <Copy>SOL</Copy>
                    </Copy>
                  </View>
                  <Copy style={styles.subtle}>{m.bettors} participantes</Copy>
                </View>
                <View
                  accessible
                  accessibilityLabel={`Distribución del pozo: ${m.options.map((o, i) => `${o} ${m.total ? Math.round((m.pools[i] / m.total) * 100) : 0}%`).join(", ")}`}
                  style={{
                    height: 5,
                    backgroundColor: colors.pale,
                    borderRadius: 4,
                    overflow: "hidden",
                    flexDirection: "row",
                  }}
                >
                  {m.total > 0 &&
                    m.pools.map((p, i) => (
                      <View
                        key={i}
                        style={{
                          width: `${(p / m.total) * 100}%`,
                          height: 5,
                          backgroundColor: i % 2 ? colors.ink : colors.accent,
                        }}
                      />
                    ))}
                </View>
                <Copy style={styles.label}>Tu apuesta en SOL</Copy>
                <TextInput
                  testID={`amount-${m.id}`}
                  accessibilityLabel={`Importe para ${m.title}`}
                  style={styles.input}
                  keyboardType="decimal-pad"
                  value={amount}
                  onChangeText={(v) =>
                    setAmounts((prev) => ({ ...prev, [m.id]: v }))
                  }
                  editable={!plot.busy && open}
                />
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {["0.01", "0.05", "0.1"].map((v) => (
                    <Pressable
                      key={v}
                      accessibilityRole="button"
                      accessibilityLabel={`${v} SOL`}
                      accessibilityState={{
                        selected: amount === v,
                        disabled: plot.busy,
                      }}
                      disabled={plot.busy}
                      onPress={() =>
                        setAmounts((prev) => ({ ...prev, [m.id]: v }))
                      }
                      style={{
                        flex: 1,
                        minHeight: 44,
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 24,
                        backgroundColor:
                          amount === v ? colors.pale : colors.paper,
                      }}
                    >
                      <Copy>{v}</Copy>
                    </Pressable>
                  ))}
                </View>
                <View style={{ gap: 10 }}>
                  {m.options.map((label, i) => (
                    <Pressable
                      key={i}
                      accessibilityRole="button"
                      accessibilityLabel={`Apostar a ${label}`}
                      accessibilityState={{
                        disabled:
                          plot.busy || !open || !fresh || !config?.enabled,
                      }}
                      disabled={
                        plot.busy || !open || !fresh || !config?.enabled
                      }
                      onPress={() => select(m, i)}
                      style={({ pressed }) => ({
                        backgroundColor: colors.pale,
                        borderRadius: 14,
                        padding: 16,
                        gap: 8,
                        opacity: !open || !fresh ? 0.65 : pressed ? 0.7 : 1,
                      })}
                    >
                      <View style={styles.row}>
                        <Copy style={{ fontWeight: "600", flex: 1 }}>
                          {label}
                        </Copy>
                        <Copy>
                          {m.total
                            ? `${Math.round((m.pools[i] / m.total) * 100)}%`
                            : "—"}
                        </Copy>
                      </View>
                      <View style={styles.row}>
                        <Copy style={styles.subtle}>
                          {sol(m.pools[i])} SOL en el pozo
                        </Copy>
                        <Copy style={{ fontWeight: "600" }}>Apostar ↗</Copy>
                      </View>
                    </Pressable>
                  ))}
                </View>
                <Copy
                  style={{ fontSize: 12, lineHeight: 18, color: colors.muted }}
                >
                  Los porcentajes muestran la distribución del pozo, no
                  probabilidades. La apuesta necesita SOL devnet adicional para
                  cuentas y comisiones.
                </Copy>
                {m.notes?.rules && (
                  <Copy style={styles.subtle}>{m.notes.rules}</Copy>
                )}
                {!fresh && (
                  <Notice>
                    Los datos necesitan actualizarse antes de apostar.
                  </Notice>
                )}
              </View>
            );
          })}
          {plot.progress && !plot.busy && <Notice>{plot.progress}</Notice>}
          <Action
            title="Actualizar predicciones"
            secondary
            disabled={plot.busy}
            onPress={() => void refresh()}
          />
          {checkedAt > 0 && (
            <Copy style={styles.subtle}>
              Última consulta: {new Date(checkedAt).toLocaleTimeString("es-AR")}
            </Copy>
          )}
        </>
      )}
      <Modal
        visible={!!selection}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!plot.busy) setSelection(undefined);
        }}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "#23203966",
            justifyContent: "flex-end",
          }}
        >
          <View
            style={[
              styles.panel,
              {
                borderBottomLeftRadius: 0,
                borderBottomRightRadius: 0,
                paddingBottom: 40,
              },
            ]}
          >
            <Title>Confirmar apuesta</Title>
            <Copy>{selection?.market.title}</Copy>
            <Copy style={styles.section}>
              {selection?.market.options[selection.option]} ·{" "}
              {selection?.amount} SOL
            </Copy>
            <Copy style={styles.subtle}>
              SOL de prueba en devnet, más cuentas y comisiones de la red.
            </Copy>
            {plot.address ? (
              <>
                <Copy style={styles.subtle}>
                  Wallet {plot.address.slice(0, 5)}…{plot.address.slice(-5)}
                </Copy>
                <Action
                  title="Firmar apuesta en mi wallet"
                  disabled={
                    plot.busy ||
                    !fresh ||
                    !selection ||
                    now >= selection.market.closeMs
                  }
                  onPress={() => void confirm()}
                />
              </>
            ) : (
              <Action
                title="Conectar wallet para apostar"
                onPress={() => {
                  setSelection(undefined);
                  router.push("/wallet");
                }}
              />
            )}
            {plot.error && <Notice error>{plot.error}</Notice>}
            <Action
              title="Volver"
              secondary
              disabled={plot.busy}
              onPress={() => setSelection(undefined)}
            />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
