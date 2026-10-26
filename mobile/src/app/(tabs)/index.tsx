import { useEffect, useState } from "react";
import { Pressable, TextInput, View, Keyboard } from "react-native";
import { router } from "expo-router";
import {
  Action,
  Copy,
  Mascot,
  Notice,
  Screen,
  ServerNeeded,
  Title,
  styles,
} from "../../components/ui";
import { usePlot } from "../../lib/state";
import { twitchChannel } from "../../lib/api";
import { preferences } from "../../lib/storage";
export default function Search() {
  const plot = usePlot(),
    [input, setInput] = useState(""),
    [error, setError] = useState(""),
    [recent, setRecent] = useState<string[]>([]);
  useEffect(() => {
    void preferences.get("recent").then((raw) => {
      if (raw) setRecent(JSON.parse(raw));
    });
  }, []);
  const search = (value = input) => {
    try {
      const channel = twitchChannel(value);
      setError("");
      Keyboard.dismiss();
      const next = [channel, ...recent.filter((c) => c !== channel)].slice(
        0,
        5,
      );
      setRecent(next);
      void preferences.set("recent", JSON.stringify(next));
      router.push({ pathname: "/channel/[channel]", params: { channel } });
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Screen>
      <View style={{ gap: 8 }}>
        <Copy style={styles.label}>El stream en la tele. La jugada acá.</Copy>
        <Title>¿A quién estás mirando?</Title>
        <Copy>Buscá el canal y elegí tu próxima predicción.</Copy>
      </View>
      {!plot.base ? (
        <ServerNeeded />
      ) : (
        <View style={styles.panel}>
          <Copy style={styles.label}>Canal de Twitch</Copy>
          <TextInput
            testID="streamer-input"
            accessibilityLabel="Nombre o enlace del streamer"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="@streamer o twitch.tv/streamer"
            placeholderTextColor="#887b86"
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => search()}
            returnKeyType="search"
            style={styles.input}
          />
          <Action
            title="Buscar predicciones"
            onPress={() => search()}
            disabled={!input.trim()}
          />
          {error && <Notice error>{error}</Notice>}
        </View>
      )}
      {recent.length > 0 && plot.base && (
        <View style={{ gap: 12 }}>
          <Copy style={styles.section}>Volver al stream</Copy>
          {recent.map((channel) => (
            <Pressable
              key={channel}
              accessibilityRole="button"
              accessibilityLabel={`Ver @${channel}`}
              onPress={() => search(channel)}
              style={[styles.row, { minHeight: 48 }]}
            >
              <Copy>@{channel}</Copy>
              <Copy>↗</Copy>
            </Pressable>
          ))}
        </View>
      )}
      <View style={[styles.row, { alignItems: "center", paddingVertical: 12 }]}>
        <View style={{ flex: 1, gap: 8 }}>
          <Copy style={styles.section}>Tu lado del stream.</Copy>
          <Copy style={styles.subtle}>
            Apuestas en SOL devnet. Conectá tu wallet cuando quieras participar.
          </Copy>
        </View>
        <Mascot />
      </View>
    </Screen>
  );
}
