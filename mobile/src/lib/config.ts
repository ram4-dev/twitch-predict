// The opt-in local build can talk only to loopback/emulator HTTP origins.
// Normal release builds require HTTPS, including saved server preferences.
export const allowLocalGateway =
  __DEV__ || process.env.EXPO_PUBLIC_LOCAL_GATEWAY === "1";
