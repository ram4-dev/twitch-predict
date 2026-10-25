# Compra, resolución y cobro

Fecha: 2026-10-25.

## Checkout y alcance

- Fuente: /Users/ramiro/.t3/projects/twitch-predict.poc-twitch-solana, rama poc/twitch-solana.
- Checkpoint de la POC anterior: c9bdb58ec0faf484490612a00fa390c2e6070ad7.
- Rama nueva: feat/market-lifecycle.
- Worktree: /Users/ramiro/.t3/projects/twitch-predict.feat-market-lifecycle.
- Se conserva el checkout anterior. No hay merge ni push.
- Este worktree comparte los directorios locales data y node_modules mediante symlinks excluidos de Git. La extensión instalada en Chrome sigue cargada desde el checkout anterior y utiliza el mismo puente HTTP.

## Funcionalidad

Compra de tokens Doppler con WSOL, cotización con mínimo y vencimiento, wallet de participante separada, oracle manual, liquidación de todos los resultados, cobro y conversión a SOL nativo. Soporta reembolso cuando el protocolo marca un mercado void. El puente rechaza compras fuera de plazo y después de resolver; el oracle finalizado también bloquea las compras on-chain.

El resolvedor es la wallet del creador. Esto es un oracle de confianza para la POC, no una resolución automática ni descentralizada. La wallet de participante es custodiada, local y compartida; no representa una conexión a Phantom o Solflare.

## Operación

Panel: http://twitch-predict.localhost:1356.
RPC: http://127.0.0.1:8899, Agave 4.4.0-beta.1, contratos Doppler clonados desde devnet.

El servicio de puente corre fuera del proceso de herramientas con el job de launchd dev.twitchpredict.bridge (submit, duración de la sesión de login). Ejecuta Portless con un puerto de aplicación elegido automáticamente, HTTP 1356 y SOLANA_RPC_URL local. No se instaló un LaunchAgent permanente ni se modificaron servicios ajenos. Los logs están en data/bridge-launch.log y data/bridge-launch-error.log. Para retirarlo: launchctl remove dev.twitchpredict.bridge. La instancia antigua del puente de esta misma POC se detuvo para evitar dos escritores sobre el registro.

Las operaciones guardan su UUID, estado, firmas y cantidad pagada. Las respuestas ambiguas permanecen pendientes y no se reenvían automáticamente. Se mantienen los intentos fallidos históricos.

## Prueba de stream

Se encontró la predicción 7d3bed67-9f17-4894-90e1-ab625bda2c68 de warthunder_esports_ru, VOYAGER / Invictus, y se abrió en Chrome con unos 39 segundos restantes. Su ventana de apuestas cerró mientras se implementaba la interfaz. No se promete que siga abierta al finalizar esta tarea.

## Validación final

- TypeScript, ESLint, build y git diff --check: PASS.
- 7 pruebas unitarias: PASS. Incluyen conversión exacta de importes, límites, IDs duplicados, respuesta ambigua y serialización tras un rechazo.
- 4 pruebas E2E: PASS (2.6 minutos). Extensión MV3 real con respuesta Twitch controlada, creación on-chain, compra de ambos resultados, resolución, liquidación, cobro SOL nativo, rechazo del doble cobro y mercado void con reembolso.
- La prueba ganadora cobró 0.029700 SOL luego de comprar 0.01 y 0.02 SOL de resultados distintos. El contrato reportó totalClaimed == totalPot y el balance nativo del participante aumentó.
- El caso void reembolsó 0.009900 SOL de una compra de 0.01 SOL y comprobó entry.refundedQuote == entry.contribution.
- Captura local del flujo: test-results/lifecycle.png.

Se mantiene Solana local, con fondos desechables. No se migró a devnet público ni se conectaron wallets reales.
