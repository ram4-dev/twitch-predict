import { mobileGateway } from "../src/mobile-gateway.js";
const upstream =
  process.env.MOBILE_UPSTREAM ?? "http://twitch-predict-byte.localhost:1356";
const server = mobileGateway(upstream).listen(
  Number(process.env.PORT ?? 3000),
  "127.0.0.1",
  () =>
    console.log(
      `Plot mobile gateway ready; upstream ${new URL(upstream).host}`,
    ),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.close(() => process.exit(0)));
