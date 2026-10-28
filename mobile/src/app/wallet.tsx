import { View } from "react-native";
import { router } from "expo-router";
import { Action, Copy, Notice, Screen, Title, styles } from "../components/ui";
import { usePlot } from "../lib/state";
export default function Wallet() {
  const plot = usePlot();
  return (
    <Screen back>
      <Title>Tu wallet</Title>
      <Copy>
        Elegí con qué wallet querés participar. Las apuestas se firman en SOL
        devnet.
      </Copy>
      {plot.address && (
        <View style={styles.panel}>
          <Copy style={styles.label}>Cuenta seleccionada</Copy>
          <Copy selectable>{plot.address}</Copy>
          <Action
            title="Desconectar wallet"
            secondary
            disabled={plot.busy}
            onPress={() => void plot.disconnect()}
          />
        </View>
      )}
      <View style={{ gap: 12 }}>
        {plot.certified && (
          <Action
            title="Conectar con Seeker"
            disabled={plot.busy || !plot.base}
            onPress={() => void plot.connect("seeker")}
          />
        )}
        <Action
          title={
            plot.certified ? "Usar otra wallet" : "Conectar wallet Android"
          }
          disabled={plot.busy || !plot.base}
          onPress={() => void plot.connect("mwa")}
        />
        <Copy style={styles.subtle}>
          Phantom, Solflare y otras wallets compatibles con Mobile Wallet
          Adapter.
        </Copy>
      </View>
      {plot.error && <Notice error>{plot.error}</Notice>}
      {!plot.base && (
        <Notice>Primero configurá el servidor en Conexión.</Notice>
      )}
      {plot.address && (
        <Action
          title="Volver al mercado"
          secondary
          onPress={() => router.back()}
        />
      )}
    </Screen>
  );
}
