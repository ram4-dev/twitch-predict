import { allowLocalGateway } from "../../lib/config";
import { useEffect, useState } from "react";
import { TextInput, View } from "react-native";
import {
  Action,
  Copy,
  Notice,
  Screen,
  Title,
  styles,
} from "../../components/ui";
import { usePlot } from "../../lib/state";
import { api, mobileApiOrigin } from "../../lib/api";
export default function Settings() {
  const plot = usePlot(),
    [value, setValue] = useState(plot.base),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false),
    [checking, setChecking] = useState(false);
  useEffect(() => setValue(plot.base), [plot.base]);
  const save = async () => {
    setError("");
    setSaved(false);
    setChecking(true);
    try {
      const origin = mobileApiOrigin(value, allowLocalGateway);
      const health = await api<{ service: string; network: string }>(
        origin,
        "/api/health",
      );
      if (health.service !== "plot-mobile" || health.network !== "devnet")
        throw new Error(
          "Esta dirección no corresponde a la API móvil de Plot devnet.",
        );
      await plot.setServer(origin);
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChecking(false);
    }
  };
  return (
    <Screen>
      <Title>Conexión</Title>
      <View style={styles.panel}>
        <Copy>Servidor de Plot</Copy>
        <Copy style={styles.subtle}>
          La dirección que comparte quien administra los mercados.
        </Copy>
        <TextInput
          testID="server-input"
          accessibilityLabel="Dirección del servidor"
          style={styles.input}
          value={value}
          onChangeText={setValue}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="https://…"
          placeholderTextColor="#887b86"
        />
        <Action
          title={checking ? "Comprobando…" : "Guardar conexión"}
          disabled={checking || plot.busy || !value.trim()}
          onPress={() => void save()}
        />
        {saved && (
          <Notice>Conexión guardada. Ya podés buscar un streamer.</Notice>
        )}
        {error && <Notice error>{error}</Notice>}
      </View>
      <View style={{ gap: 12 }}>
        <Copy style={styles.section}>SOL devnet</Copy>
        <Copy>
          Esta versión usa SOL de prueba. La firma de cada apuesta se confirma
          en tu wallet.
        </Copy>
        <Copy style={styles.subtle}>
          Podés usar Seed Vault Wallet en Seeker, o una wallet Android
          compatible con Mobile Wallet Adapter.
        </Copy>
      </View>
    </Screen>
  );
}
