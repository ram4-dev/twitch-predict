# PLOT on-chain: integración de prueba

El modo PLOT usa una mint Token-2022 no transferible y mantiene sus saldos separados del ledger retirable y de Byte. El proveedor de pagos incluido es un mock. No hay despliegue ni evidencia devnet en este checkout. El ID de programa y el IDL versionados son de prueba; antes de desplegar hay que generar un ID propio, recompilar y verificar el IDL generado contra el adaptador.

## Validación local

Requisitos: Node.js, PostgreSQL 16, Portless, Agave `solana-test-validator` 4.1.2, Anchor 0.31.1, `cargo-build-sbf` 4.6.0 y platform-tools v1.58. Instalar las dependencias con `npm ci`, `npm --prefix mobile ci` y `npm --prefix programs/plot/tests ci`. Desde `programs/plot`, generar el IDL y el binario SBF según [el README del programa](../programs/plot/onchain/README.md). El harness necesita `programs/plot/onchain/target/deploy/plot.so` y el IDL generado en `programs/plot/target/idl/plot.json`. No modifica un validador existente: crea otro con ledger y claves temporales.

Para una base descartable en un socket privado, desde la raíz y con los binarios PostgreSQL 16 en PATH:

```sh
PLOT_PG_DIR=$(mktemp -d /tmp/plot-e2e-pg.XXXXXX)
mkdir -p "$PLOT_PG_DIR/socket"
initdb -D "$PLOT_PG_DIR/data" --auth=trust --no-locale
pg_ctl -D "$PLOT_PG_DIR/data" -l "$PLOT_PG_DIR/log" -o "-k $PLOT_PG_DIR/socket -p 55432 -c listen_addresses=''" start
createdb -h "$PLOT_PG_DIR/socket" -p 55432 plot_test
export PLOT_E2E_PG_URL="postgresql://$(whoami)@localhost/plot_test?host=$(node -p 'encodeURIComponent(process.argv[1])' "$PLOT_PG_DIR/socket")&port=55432"
portless plot-cloud-e2e node --import tsx scripts/plot-cloud-validator-e2e.mjs "$(pwd)/programs/plot"
pg_ctl -D "$PLOT_PG_DIR/data" stop -m fast
```

El usuario PostgreSQL debe poder crear y borrar la base temporal de sponsor. El ensayo automático firma un desafío SIWS, compra 600 PLOT simulados con una wallet sin SOL ni ATA, crea la ATA y acredita en una transacción, apuesta 400 mediante sponsor y verifica la cancelación y el claim. `scripts/plot-validator-e2e.mjs` prueba además los constructores contra el validador y el caso 600/400 con cobro 960 y comisiones 20/20. No usar estos resultados como prueba devnet.

La regresión ejecutada en la rama integrada incluyó `npm run check` (233 aprobadas, 27 omitidas sin las bases opcionales), `npm run check:mobile`, ocho pruebas cloud con PostgreSQL y ocho pruebas HTTP/PostgreSQL de PLOT. El harness completo pasó en un validador local. Las pruebas omitidas no cuentan como aprobadas. `node scripts/check-plot-idl.mjs programs/plot/idl/plot.json` verifica los campos y cuentas que consume el adaptador; repetirlo con el IDL generado antes de habilitar la red.

## Android local

Para dejar el stack abierto, usar la base de prueba anterior y la clave **pública** de la wallet del emulador. No exportar su clave privada:

```sh
PLOT_E2E_KEEP_OPEN=1 \
PLOT_E2E_WALLET_PUBLIC_KEY="$WALLET_PUBLICA" \
PLOT_E2E_AUTH_ORIGIN=http://127.0.0.1:18080 \
portless plot-android-local node --import tsx scripts/plot-cloud-validator-e2e.mjs "$(pwd)/programs/plot"
```

El proceso imprime `controlPid`, `apiPort`, `rpcPort`, programa, mint, wallet e identidad del mercado. En otra terminal, ejecutar `adb reverse tcp:18080 tcp:<apiPort>` y, si la wallet necesita el RPC, `adb reverse tcp:18899 tcp:<rpcPort>`. La app local usa `http://127.0.0.1:18080`; su build necesita `EXPO_PUBLIC_LOCAL_GATEWAY=1`, `EXPO_PUBLIC_PLOT_NETWORK=localnet` y los IDs públicos de programa y mint que imprime el harness. La excepción HTTP sólo admite loopback y los flags explícitos de localnet. El proceso crea la ATA del emulador con fondos locales y termina con SIGTERM o Ctrl-C. Para ensayar una devolución, `kill -USR2 <controlPid>` cancela el mercado local, espera finalización y actualiza su proyección; después se puede solicitar el claim desde la app. El control no existe fuera del harness de prueba.

Con una sesión SIWS válida, la compra usa `POST /api/plot/v1/orders` con `{ "idempotencyKey": "...", "package": "small" }`, seguido por `POST /api/plot/v1/orders/<key>/confirm` y `POST /api/plot/v1/orders/<key>/reconcile`. `small` acredita 600 PLOT; `medium`, 400. La confirmación mock está habilitada únicamente por configuración de prueba.

`GET /api/plot/v1/markets` es público y devuelve identidad canónica, estado Twitch y datos de cadena sólo cuando fueron verificados. `treasuryBps` y `streamerBps` son enteros del snapshot de cadena o `null` cuando no está disponible. `GET /api/plot/v1/account` requiere `Authorization: Bearer <sesión>` y devuelve saldo, posiciones, secuencia e índices de la wallet vinculada. `POST /api/plot/v1/intents` y sus rutas de consulta, envío y conciliación requieren la misma sesión. Tras un envío ambiguo, consultar la misma intención; no crear una clave nueva. Las lecturas de cadena usan finalización, pero no forman una instantánea atómica entre cuentas.

## Configuración y estado devnet

El servidor no habilita PLOT on-chain por defecto. `PLOT_ONCHAIN_ENABLED=true` exige `PLOT_TEST_NETWORK=localnet|devnet`, `PLOT_TEST_RPC_URL`, `PLOT_PROGRAM_ID`, `PLOT_MINT`, `PLOT_SPONSOR_DATABASE_URL` y límites explícitos `PLOT_SPONSOR_MAX_FEE`, `PLOT_SPONSOR_MAX_RENT`, `PLOT_SPONSOR_MAX_PER_USER`, `PLOT_SPONSOR_MAX_GLOBAL`, `PLOT_SPONSOR_MAX_NEW_ACCOUNTS`, `PLOT_SPONSOR_MAX_ACCOUNTS_PER_USER`, `PLOT_SPONSOR_MAX_ACCOUNTS_GLOBAL` y `PLOT_SPONSOR_MAX_REQUESTS_PER_HOUR`. Para localnet se exige además `PLOT_TEST_GENESIS`; la conexión comprueba genesis y sólo acepta loopback. La base de sponsor debe ser distinta de `DATABASE_URL`. El worker de cadena requiere también `PLOT_ONCHAIN_WORKER_ENABLED=true`.

Las claves de prueba se inyectan con `vault-env`; los nombres esperados son `PLOT_PAYMENT_KEYPAIR`, `PLOT_RESOLVER_KEYPAIR` y `PLOT_SPONSOR_KEYPAIR`. El despliegue y bootstrap necesitan además identidades de deploy/upgrade y admin de prueba, tesorería, una mint y SOL de devnet para rent y fees. El registro EventSub requiere `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `PLOT_TWITCH_USER_TOKEN` con `channel:read:predictions` o `channel:manage:predictions`, y `PLOT_TWITCH_EVENTSUB_SECRET`. El token del broadcaster configurado es único y su renovación todavía no está implementada. No imprimir valores ni copiar archivos de claves al repositorio.

El 27 de noviembre se verificó el genesis de la RPC pública de devnet. El faucet rechazó solicitudes de 2, 1 y 0,1 SOL; no se desplegó ni inicializó ningún programa o mint. El vault listó `PLOT_DEVNET_TREASURY_KEYPAIR`, pero no un RPC devnet dedicado ni los nombres de las tres autoridades anteriores. El nombre de tesorería no demuestra el origen de sus fondos, por lo que no se usó. Para continuar se necesitan SOL de prueba, un RPC adecuado y claves de prueba de roles verificadas. Luego hay que comprobar por RPC el programa, mint, extensión, autoridades y decimales, y guardar firmas y enlaces de Explorer. El flujo Android real, los eventos Twitch reales y el proveedor de pago externo siguen sin evidencia devnet.

Los envíos de crédito y comandos de mercado se registran antes de transmitir. Si el proceso cae en un punto ambiguo, el intento queda retenido hasta observar el estado en cadena; no se retransmite automáticamente una orden cuya ausencia no está demostrada. No usar este modo como producción sin resolver esa recuperación y revisar sus límites operativos.

La regresión Playwright de la rama integrada se ejecutó con `--max-failures=1` y un proxy Portless privado. Terminó con 26 aprobadas, 5 omitidas y un fallo en `tests/channels.e2e.ts:6`: la página mostró el inicio de sesión y no apareció el combobox `Buscar streamer` antes de los 60 segundos. Con `cc3c2d2`, dependencias y build de extensión preparados y otro proxy privado, se obtuvo el mismo fallo y los mismos conteos. En ambas ejecuciones quedaron 137 pruebas sin ejecutar; esto no demuestra que el resto de la suite pase.
