import { Tabs } from "expo-router";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Copy, colors } from "../../components/ui";
export default function Navigation() {
  const inset = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={({ state, navigation }) => (
        <View
          style={{
            flexDirection: "row",
            backgroundColor: colors.paper,
            paddingBottom: Math.max(inset.bottom, 8),
            borderTopWidth: 1,
            borderColor: colors.line,
          }}
        >
          {state.routes.map((route, index) => (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: state.index === index }}
              onPress={() => navigation.navigate(route.name)}
              style={{
                flex: 1,
                minHeight: 56,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Copy
                style={{
                  fontSize: 13,
                  fontWeight: state.index === index ? "700" : "400",
                  color: state.index === index ? colors.ink : colors.muted,
                }}
              >
                {
                  (
                    {
                      index: "Streams",
                      history: "Mis apuestas",
                      settings: "Conexión",
                    } as Record<string, string>
                  )[route.name]
                }
              </Copy>
            </Pressable>
          ))}
        </View>
      )}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="history" />
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}
