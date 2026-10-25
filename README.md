# Twitch → Solana: Prediction Mirror

POC de una extensión Chrome MV3 que consulta las predicciones activas del canal abierto en Twitch y crea automáticamente un mercado Doppler en Solana. Conserva título, IDs y opciones de Twitch. Crea un oracle, un mercado y un token SPL por resultado. La wallet del puente firma sin confirmaciones por mercado.

## Ejecutar

Requiere Node 22+, npm y Portless. Sólo admite el RPC público de devnet o un validador local. No envía transacciones a mainnet.

```sh
npm ci
npm run build
npm run setup
npm run dev
```

Portless imprime la URL del panel. En este equipo es `http://twitch-predict.localhost:1356`. El puerto del proxy puede variar; usá la URL que imprime Portless al conectar la extensión.

También podés ejecutar `npm run chrome -- xarola_`: abre Chromium con la extensión cargada, la conecta al puente y abre el canal indicado. Requiere el navegador de Playwright (`npx playwright install chromium`).

Para usar tu Chrome habitual:

1. Abrí `chrome://extensions`, activá modo desarrollador y elegí **Cargar descomprimida**.
2. Seleccioná la carpeta `extension` de este checkout.
3. Abrí el panel en el mismo Chrome, pegá el ID de la extensión y elegí **Conectar extensión**.
4. Abrí un canal en `https://www.twitch.tv/<canal>`. La extensión consulta cada cinco segundos mientras esa pestaña permanezca abierta, incluso si está en segundo plano.
5. Al aparecer una predicción ACTIVE con tiempo restante, el panel muestra su creación y su dirección on-chain. La extensión no apuesta puntos ni SOL.

No se necesitan claves de Twitch. La consulta utiliza el identificador público del cliente web de Twitch y su API GraphQL interna. No es una integración oficial ni tiene garantía de estabilidad. Errores de permisos, cambios de esquema y límites de consultas aparecen en el popup. No se lee el vídeo ni se transcribe audio.

## Red y fondos

Por defecto se usa Solana devnet. `npm run setup` genera una wallet desechable local y solicita un airdrop. Si el faucet devuelve un error, la creación pública queda bloqueada hasta que esa wallet tenga SOL de devnet. El panel muestra su dirección y balance. No hace falta una wallet con dinero real.

Para ejecutar con los contratos reales de Doppler clonados a un validador local:

```sh
npm run localnet
```

En otra terminal:

```sh
SOLANA_RPC_URL=http://127.0.0.1:8899 npm run setup
SOLANA_RPC_URL=http://127.0.0.1:8899 npm run dev
```

El script descarga Agave 4.4.0-beta.1 desde el release oficial a `data/agave` en macOS ARM64 o Linux x86_64. Requiere curl, tar y acceso al RPC de devnet durante el primer arranque para clonar cuatro programas y la configuración de Initializer. Usa 8899/8900 porque el protocolo RPC/WebSocket requiere puertos conocidos; el panel usa Portless. Conserva el ledger en `data/ledger`. No lo borres para reintentar una transacción.

## Comprobar el flujo

**Probar una predicción** crea una predicción de ejemplo explícitamente marcada como DEMO y ejecuta las transacciones reales. No simula una confirmación blockchain.

```sh
npm run check
npm run test:e2e
```

La suite E2E usa Playwright con Chromium persistente y carga la extensión MV3 real. Requiere el puente y el validador local anteriores activos. Si falta el navegador: `npx playwright install chromium`.

Una prueba crea desde el panel y verifica el owner del mercado, los dos mints SPL y sus confirmaciones por RPC. Otra prueba conecta la extensión desde el panel, sirve una respuesta controlada de Twitch GraphQL y verifica creación automática y deduplicación tras recargar. La respuesta Twitch de esa prueba es un fixture; las transacciones de Solana se ejecutan sobre los contratos reales clonados. Las pruebas no demuestran detección de una predicción de un streamer en vivo.

## Límites de esta POC

- Replica la **creación**. No sincroniza lock, cancelación, resolución ni reparto de premios. No ofrece una interfaz de trading.
- La hora de cierre se registra localmente. Doppler no la aplica automáticamente en su oracle; no debe usarse esta POC con fondos reales.
- El título y los textos de opciones quedan en el registro local. On-chain se guardan IDs hash de los resultados, oracle, mercado y mints; no hay publicación de metadatos de texto.
- Los tokens usan una curva buy-only de Doppler denominada en WSOL; no replica cuotas ni liquidez de los puntos de Twitch.
- La cola es de un solo proceso y acepta hasta diez creaciones pendientes. Cada combinación canal/ID de predicción se procesa una vez.
- Una creación que falla queda visible. No se reintenta automáticamente después de un timeout ni de un reinicio: inspeccioná las transacciones guardadas antes de recuperar una operación parcial.
- La wallet y el token de emparejamiento viven en `data` con permisos 600. Nunca se incluyen en el build ni en Git. Se firma sólo en el puente; la extensión recibe únicamente el token del puente.
- El puente escucha en loopback y valida Host, Origin y token. El endpoint de emparejamiento sólo responde a solicitudes del mismo origen del panel.

## Referencias

- [Doppler: mercados de predicción y despliegue devnet](https://github.com/whetstoneresearch/doppler-sdk/blob/main/docs/solana-prediction-markets.md)
- [Twitch: permisos de la API oficial de predicciones](https://dev.twitch.tv/docs/api/predictions/)

El SDK publicado 1.0.43 usa signers explícitos para baseVault y quoteVault. Las instrucciones se construyen con su ABI publicada y usan address lookup tables para registrar resultados sin exceder el tamaño máximo de una transacción.
