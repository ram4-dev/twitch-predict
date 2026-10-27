import React from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextProps,
  type ViewStyle,
  type RefreshControlProps,
} from "react-native";
import { Link, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePlot } from "../lib/state";
export const colors = {
  ground: "#fff4dd",
  paper: "#fffaf0",
  ink: "#232039",
  muted: "#68596a",
  line: "#d8cdbd",
  accent: "#ff7049",
  pale: "#ede3d3",
  error: "#a12d3e",
  positive: "#6a365c",
};
export function Copy({ style, ...props }: TextProps) {
  return <Text {...props} style={[styles.copy, style]} />;
}
export function Title({ children }: { children: React.ReactNode }) {
  return (
    <Copy accessibilityRole="header" style={styles.title}>
      {children}
    </Copy>
  );
}
export function Action({
  title,
  onPress,
  disabled = false,
  secondary = false,
  testID,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondary,
        disabled && { opacity: 0.45 },
        pressed && { opacity: 0.72 },
      ]}
    >
      <Copy style={[styles.buttonText, secondary && { color: colors.ink }]}>
        {title}
      </Copy>
    </Pressable>
  );
}
export function Notice({
  children,
  error = false,
}: {
  children: React.ReactNode;
  error?: boolean;
}) {
  return (
    <View accessibilityRole={error ? "alert" : "text"} style={styles.notice}>
      <Copy style={{ color: error ? colors.error : colors.muted }}>
        {children}
      </Copy>
    </View>
  );
}
export function Mascot() {
  return (
    <View style={{ width: 92, height: 92, overflow: "hidden" }}>
      <Image
        accessible={false}
        source={require("../../assets/brand/chameleon-poses.png")}
        style={{ width: 276, height: 92, position: "absolute", left: -92 }}
      />
    </View>
  );
}
export function Screen({
  children,
  back = false,
  refresh,
  style,
}: {
  children: React.ReactNode;
  back?: boolean;
  refresh?: React.ReactElement<RefreshControlProps>;
  style?: ViewStyle;
}) {
  const inset = useSafeAreaInsets(),
    plot = usePlot();
  return (
    <View style={[styles.screen, { paddingTop: inset.top }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            back ? "Volver a buscar" : "Plot, buscar streamer"
          }
          onPress={() => (back ? router.back() : router.replace("/"))}
          style={{ minHeight: 48, justifyContent: "center" }}
        >
          <Text style={styles.logo}>
            {back ? "‹ " : ""}plot
            <Text style={{ color: colors.accent }}>.</Text>
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/wallet")}
          style={styles.wallet}
        >
          <Copy style={{ fontSize: 13 }}>
            {plot.address
              ? `${plot.address.slice(0, 4)}…${plot.address.slice(-4)}`
              : "Conectar wallet"}
          </Copy>
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          style,
          { paddingBottom: Math.max(inset.bottom, 20) + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
        refreshControl={refresh}
      >
        {children}
      </ScrollView>
      {plot.busy && (
        <View accessibilityLiveRegion="polite" style={styles.progress}>
          <ActivityIndicator size="small" color={colors.ink} />
          <Copy style={{ flex: 1, fontSize: 13 }}>
            {plot.progress || "Revisando transacciones…"}
          </Copy>
        </View>
      )}
    </View>
  );
}
export function ServerNeeded() {
  return (
    <View style={styles.panel}>
      <Title>Conectemos Plot</Title>
      <Copy>
        Agregá el servidor para encontrar las predicciones del stream.
      </Copy>
      <Link href="/settings" asChild>
        <Pressable style={styles.button}>
          <Copy style={styles.buttonText}>Configurar conexión</Copy>
        </Pressable>
      </Link>
    </View>
  );
}
export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  header: {
    paddingHorizontal: 20,
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    borderBottomWidth: 1,
    borderColor: colors.line,
  },
  logo: {
    fontFamily: "Fraunces",
    fontSize: 40,
    letterSpacing: -2,
    color: colors.ink,
  },
  wallet: {
    minHeight: 44,
    paddingHorizontal: 14,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 28,
  },
  content: {
    padding: 20,
    gap: 20,
    width: "100%",
    maxWidth: 660,
    alignSelf: "center",
  },
  copy: {
    fontFamily: "Inter",
    fontSize: 14,
    lineHeight: 21,
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
  title: {
    fontFamily: "Fraunces",
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.5,
  },
  label: { fontSize: 13, color: colors.muted },
  panel: {
    backgroundColor: colors.paper,
    borderRadius: 20,
    padding: 20,
    gap: 16,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  button: {
    minHeight: 48,
    borderRadius: 28,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    color: colors.paper,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  secondary: { backgroundColor: colors.pale },
  input: {
    fontFamily: "Inter",
    fontSize: 16,
    color: colors.ink,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 52,
    backgroundColor: colors.paper,
  },
  notice: {
    borderLeftWidth: 2,
    borderColor: colors.accent,
    paddingLeft: 12,
    paddingVertical: 6,
  },
  progress: {
    padding: 16,
    gap: 12,
    backgroundColor: colors.pale,
    flexDirection: "row",
    alignItems: "center",
  },
  section: { fontSize: 18, fontWeight: "600" },
  divider: { height: 1, backgroundColor: colors.line },
  badge: {
    fontSize: 12,
    color: colors.muted,
    backgroundColor: colors.pale,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: "hidden",
  },
  empty: { alignItems: "flex-start", gap: 12, paddingVertical: 12 },
  subtle: { fontSize: 13, color: colors.muted },
});
