# POC Twitch → Solana

Fecha: 2026-10-25.

## Checkout

- Repositorio de origen: `/Users/ramiro/.t3/projects/twitch-predict`
- Rama de origen: `main`
- Commit base: `421296bc17a6f6d0d3c27dc8a1e311b397f828aa`
- Rama de trabajo: `poc/twitch-solana`
- Worktree: `/Users/ramiro/.t3/projects/twitch-predict.poc-twitch-solana`
- Se conserva el worktree y sus cambios sin merge. El checkout original no se modificó.

## Implementación

- `extension`: Chrome MV3, consulta Twitch GraphQL cada cinco segundos, emparejamiento con el puente y diagnóstico en popup.
- `src`: validación de predicciones, cola, deduplicación por red/canal/ID, persistencia, firma local y creación Doppler.
- `public`: panel con demo, estados y direcciones on-chain.
- `scripts`: build, preparación de wallet de prueba, validador local y Chromium con extensión conectada.
- `tests`: validación de entrada, fallos persistidos, deduplicación y E2E con extensión real.
- Configuración: package.json, lockfile, TypeScript, ESLint, Playwright y gitignore.

## Evidencia y límites

Las pruebas usan el SDK publicado de Doppler 1.0.43 y Agave 4.4.0-beta.1. El validador local clona los cuatro programas y la configuración de Initializer desde devnet. Se ejecutan transacciones reales sobre ese ledger local. La creación completa requiere seis transacciones y deja ambos resultados registrados, con `canBuy=true` según el lector del protocolo.

El E2E de la extensión usa una respuesta controlada de Twitch GraphQL, carga el service worker MV3 y comprueba deduplicación después de recargar la pestaña. Una consulta independiente al endpoint real de Twitch encontró la predicción `fe6709a8-7580-4653-988d-4f9684f27902` de xarola_. Su intento manual de creación se interrumpió al reiniciar el puente durante el diagnóstico; no se presenta como una creación verificada desde un stream en vivo.

Los intentos históricos fallidos permanecen en el registro local. El problema de las lookup tables se corrigió esperando visibilidad finalizada: la simulación a commitment confirmed podía pasar mientras el scheduler descartaba la transacción porque su banco rooted todavía no conocía la tabla.

El faucet público de devnet rechazó el airdrop con error interno y luego límite de solicitudes. No se ha demostrado una creación en devnet público. La wallet de prueba quedó financiada en localnet. No se utilizaron fondos reales ni credenciales de Twitch.

La POC replica creación, sin sincronizar lock, cancelación, resolución o pagos. Los textos se conservan en el registro local; los IDs hash de resultados y los contratos están on-chain. No se ofrece UI de trading.

## Servicios retenidos

- Panel: `http://twitch-predict.localhost:1356`
- RPC/WebSocket local: `127.0.0.1:8899/8900`
- Chromium visible con extensión cargada y emparejada, abierto en `twitch.tv/xarola_`.
- Ledger, wallet, perfil Chromium y recibos bajo `data`, excluidos de Git.

## Reanudar

Desde este worktree, ejecutar `npm run localnet`; en otra terminal, `SOLANA_RPC_URL=http://127.0.0.1:8899 npm run dev`. Para abrir el navegador configurado: `npm run chrome -- xarola_`. No borrar el ledger ni reintentar a ciegas transacciones ambiguas.

## Verificación final

- `npm run typecheck`: PASS.
- `npm run lint`: PASS.
- `npm test`: 3 pruebas PASS.
- `npm run build`: PASS; extensión descomprimida también disponible en dist/extension.
- `npm run test:e2e`: 2 pruebas PASS, 1.4 minutos en la ejecución final.
- `bash -n scripts/localnet.sh`: PASS.
- `git diff --check`: PASS.
- `npm audit --omit=dev --audit-level=high`: sin vulnerabilidades high/critical; cuatro avisos moderados transitivos en web3.js 1.x. La corrección automática propone una migración incompatible a web3.js 3.x y no se aplicó.
- Captura del panel: `test-results/dashboard.png` (artefacto local, excluido de Git).

En la última repetición se corrigió una carrera del E2E: antes podía leer el badge de un mercado anterior mientras el POST de la demo nueva seguía pendiente. Ahora espera el ID exacto devuelto por el POST y verifica ese registro. Se conservaron los estados fallidos históricos del diagnóstico; no se transformaron en éxitos.
