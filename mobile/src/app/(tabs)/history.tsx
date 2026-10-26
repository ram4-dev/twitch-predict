import { Linking, View } from "react-native";
import {
  Action,
  Copy,
  Mascot,
  Notice,
  Screen,
  Title,
  styles,
} from "../../components/ui";
import { usePlot } from "../../lib/state";
const labels = {
  pending: "Confirmación pendiente",
  confirmed: "Confirmada en Solana",
  failed: "La transacción falló",
  expired: "La transacción expiró",
};
export default function History() {
  const plot = usePlot();
  return (
    <Screen>
      <Title>Mis apuestas</Title>
      <Copy style={styles.subtle}>
        Recibos guardados en este teléfono para este servidor.
      </Copy>
      <Action
        title="Revisar transacciones"
        secondary
        disabled={plot.busy || !plot.base}
        onPress={() => void plot.recover()}
      />
      {plot.error && <Notice error>{plot.error}</Notice>}
      {!plot.history.length ? (
        <View style={styles.empty}>
          <Mascot />
          <Copy>Todavía no hay apuestas guardadas.</Copy>
          <Copy style={styles.subtle}>
            Cuando participes en una predicción, podés seguir su confirmación
            acá.
          </Copy>
        </View>
      ) : (
        plot.history.map((receipt) => (
          <View key={receipt.signature} style={styles.panel}>
            <Copy style={styles.section}>{receipt.title}</Copy>
            <Copy>
              {(Number(receipt.amount) / 1e9).toLocaleString("es-AR", {
                maximumFractionDigits: 9,
              })}{" "}
              SOL · Opción {receipt.option + 1}
            </Copy>
            <Copy>{labels[receipt.status]}</Copy>
            {receipt.status === "confirmed" && !receipt.synced && (
              <Copy style={styles.subtle}>
                Confirmada; falta actualizar el pozo en Plot.
              </Copy>
            )}
            <Copy style={styles.subtle}>
              {new Date(receipt.createdAt).toLocaleString("es-AR")}
            </Copy>
            <Action
              title="Ver transacción"
              secondary
              onPress={() =>
                void Linking.openURL(
                  `https://explorer.solana.com/tx/${encodeURIComponent(receipt.signature)}?cluster=devnet`,
                )
              }
            />
          </View>
        ))
      )}
    </Screen>
  );
}
