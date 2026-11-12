# Compra y retiro de puntos sobre main

## Base y checkout

- Repositorio: `/Users/ramiro/.t3/projects/twitch-predict`.
- Base: `origin/main`, actualizada con fetch, commit `07157a0386d0fd686d7e44ba7d07642017c043c0`.
- Rama: `feat/solana-points-wallet-main`.
- Worktree: `/Users/ramiro/Desktop/projects/worktrees/twitch-predict/feat-solana-points-wallet-main`.
- Estado inicial del recibo: cambios sin commit ni merge, conservados para revisión. El checkout principal, main local y el intento anterior quedaron preservados.

## Implementación

La compra y retiro en SOL/USDC usa el saldo y las comisiones de la main actual. Se mantiene 1 USDC = 1.000 puntos y los puntos iniciales son retirables. No hay saldo demo separado. La sección se abre desde el perfil y el footer de la extensión; respeta las identidades y la vinculación Phantom existentes. Conserva la marca y Space Grotesk de la app actual.

Las órdenes se guardan en el agregado Points, tanto en disco local como en PostgreSQL. Reservar el retiro y persistir la transferencia firmada es atómico. La confirmación verifica firma, mensaje y finalización en cadena. Los reintentos usan la misma transacción. La red del saldo queda fijada para impedir financiar en devnet y retirar en mainnet. La API compartida se monta sobre los dos backends.

En cloud se agregaron las rutas de apuesta/cobro con puntos y seguimiento de canales, y el worker selecciona la fuente de puntos cuando se habilitan pagos. Con la bandera deshabilitada se conserva el flujo Byte existente.

## Archivos

- Servicio y API: `src/funding.ts`, `src/funding-model.ts`, `src/funding-transfer.ts`, `src/funding-router.ts`.
- Persistencia y ejecución: `src/points.ts`, `src/offchain-server.ts`, `src/server.ts`, `src/cloud/app.ts`, `src/cloud/worker.ts`.
- Interfaz: `src/ui/funding-panel.tsx`, `public/wallet.html`, `public/funding.css`, `src/ui/mobile-app.tsx`, `extension/popup.html`, `extension/popup.js`, `src/ui/consoles.tsx` y sus bundles generados.
- Build/configuración: `scripts/build.ts`, `scripts/e2e-server.ts`, `eslint.config.js`, `.env.example`.
- Pruebas: `tests/funding.test.ts`, `tests/funding-cloud.test.ts`, `tests/funding.e2e.ts`, `tests/fixtures/funding-chain.ts`, `tests/fixtures/funding-preload.mjs`.
- Documentación: `docs/points-funding.md`, `README.md`.
- Sin dependencias nuevas.

## Verificación

- `npm run check` con PostgreSQL 16 local aislado: typecheck, lint, 209 pruebas unitarias/integración sin skips y build correctos. Log final: `data/funding-check-final.log`.
- 23 E2E de funding, acceso, identidad, puntos, responsive y gestión del streamer: correctos.
- 13 E2E de funding y compatibilidad Byte: correctos. Hay 32 casos distintos entre las dos corridas; los cuatro de funding se repiten.
- Los E2E prueban compra USDC → apuesta usando los puntos comprados → retiro SOL, compra SOL → retiro USDC, reservas y reembolsos, apertura desde la extensión con la misma sesión y anchos de 700/360 px.
- Se detectó un desfase previo en el arnés Byte: el servidor escribía en un temporal y las pruebas leían `test-results/byte-fixture.json`. Se alineó el servidor con la ruta existente; no se cambiaron assertions ni timeouts. Los errores y capturas de esa corrida fallida se conservaron en `.taste-skill/after/funding-byte-fixture-failure/`; la corrida posterior de los 13 casos pasó.
- Inspector visual: cero fallos con `--allow font-not-dealt`. La excepción conserva Space Grotesk de la main actual frente a una dirección anterior que pedía Inter. Dos advertencias: espacio vacío bajo el contenido breve y altura natural del historial sin movimientos. No se inventaron datos ni se estiró el historial para rellenar espacio. Capturas revisadas en `.taste-skill/after/funding-main-final/`; E2E autenticado también verificó 700 y 360 px sin overflow.
- `git diff --check`: correcto.

## Preview y procesos

Preview activo: `https://twitch-points-test.localhost/wallet.html`, servido desde este worktree mediante Portless. La app actual se abre en `/app`. El backend del preview anterior fue detenido después de verificar su cwd. Se dejaron activos el preview solicitado y su pestaña; los servidores de pruebas se cerraron automáticamente. PostgreSQL de pruebas fue detenido y sus datos locales se conservan con la referencia en `data/funding-pg.json` para reanudar.

## Límite pendiente

Los pagos están deshabilitados en el preview. Falta provisionar `POINTS_TREASURY_KEYPAIR` mediante `vault-env` y liquidez en la red elegida. No se generaron claves reales, no se movieron fondos reales y no se hizo deploy. Los RPC de E2E son transportes de prueba con firmas reales; no constituyen una ejecución en la red pública.


## Integración de la interfaz y despliegue VPN

La página inicial de saldo se reemplazó por una vista nativa en `/app#balance`. Comparar ambos entornos confirmó que el HTML de entrada, el CSS compartido y los botones eran los mismos; la diferencia visual era el layout independiente de wallet, añadido por esta implementación. Ahora se usan la navegación, PhoneGlass, tipografía y sesión de la app actual. Los enlaces anteriores a `/wallet.html` redirigen a la sección nativa.

Se prepara un worktree separado en Proxmox, `/home/meeting/projects/worktrees/twitch-predict/feat-solana-points-vpn`, con la misma versión que este checkout. El servicio conserva su configuración original por vault-env, AUTH_ORIGIN y DATA_DIR absolutos. El resultado y la versión efectiva se registran en el recibo de despliegue posterior.
