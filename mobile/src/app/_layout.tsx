import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ActivityIndicator, View } from "react-native";
import { PlotProvider } from "../lib/state";
import { colors } from "../components/ui";
export default function Layout() {
  const [loaded, error] = useFonts({
    Inter: require("../../assets/fonts/inter.ttf"),
    Fraunces: require("../../assets/fonts/fraunces.ttf"),
  });
  if (!loaded && !error)
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.ground,
          justifyContent: "center",
        }}
      >
        <ActivityIndicator />
      </View>
    );
  return (
    <SafeAreaProvider>
      <PlotProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.ground },
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="channel/[channel]" />
          <Stack.Screen name="wallet" options={{ presentation: "modal" }} />
        </Stack>
      </PlotProvider>
    </SafeAreaProvider>
  );
}
