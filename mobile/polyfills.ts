import "react-native-get-random-values";
import "react-native-url-polyfill/auto";
import { Buffer } from "buffer";
globalThis.Buffer = Buffer;
// RN's AbortController exists, but Hermes does not expose the static timeout API.
// The shared transaction core also uses it, so install before loading Expo Router.
if (typeof AbortSignal.timeout !== "function") {
  AbortSignal.timeout = (milliseconds: number) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), milliseconds);
    return controller.signal;
  };
}
