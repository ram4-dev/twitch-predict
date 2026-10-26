# Byte en la UI de Plot

El panel de Byte usa el mismo shell, tipografía, animación de Plot y anatomía de mercado del panel y la extensión. En modo `MARKET_MODE=byte`, `/` sirve ese panel directamente; `/byte` conserva acceso compatible.

`src/ui/byte-market.tsx` comparte entre web y MV3 el pozo, la distribución por opción, el importe en SOL, los importes rápidos y los botones de apostar. La selección y el importe sobreviven a los refrescos del popup. Elegir una opción abre el mercado específico en la web con ambos datos cargados. La web requiere conexión y confirmación explícita en Phantom antes de firmar. El popup no intenta firmar una transacción.

Se conserva la lógica existente de Byte: límites, verificación de devnet, firma y verificación de la transacción, recibos pendientes, prevención de duplicados, sincronización y resolución con evidencia. Los porcentajes representan el pozo. Los mercados BYTE se identifican como tales y no habilitan apuestas con esta integración SOL.

## Recibo de trabajo

- Repositorio de origen: `/Users/ramiro/.t3/projects/twitch-predict`, rama `main`, commit `d2c925d`.
- Worktree creado con Worktrunk: `/Users/ramiro/.t3/projects/twitch-predict.feat-byte-shared-ui`.
- Rama: `feat/byte-shared-ui`. Se conserva para revisión; no se modificó main.
- Implementación: `src/ui/byte-market.tsx`, `src/ui/byte-ui.tsx`, `src/ui/scene.tsx`, `src/ui/surfaces.tsx`, `extension/popup.js`, estilos y build. Bundles de MV3 regenerados.
- `npm run check`: typecheck, lint, 37 tests unitarios y build aprobados.
- Playwright completo: 30 aprobados y 4 legacy Solana omitidos por modo offchain. Las cinco pruebas de Byte volvieron a pasar después de los ajustes visuales. El recorrido MV3 se reforzó con importe persistente, mercado/opción/importe en la URL, confirmación de la opción elegida, una transacción y actualización del pozo. Incluye capturas y comprobación de ancho a 1440, 768 y 390 px.
- Inspector visual en el panel: 0 FAIL, 0 WARN a 1440, 768 y 390 px. Gradientes y efectos de botones corresponden a la identidad aprobada por el usuario. La captura de T3 falló dos veces por timeout; se revisaron las capturas del inspector y Playwright.

## Preview y conexión real

Preview de este worktree: `http://twitch-predict-byte.localhost:1380/`. Portless usa `/tmp/plot-byte-shared-ui-proxy`; los datos aislados están en `/tmp/plot-byte-shared-ui-data`. Lee las credenciales mediante `APP_ENV_FILE` apuntando al archivo servidor existente, sin copiarlo ni incluirlo en Git.

El health responde en modo Byte y devnet, y el status informa configuración presente. La API real devuelve HTTP 403 al listar mercados: byte todavía no habilitó la key como partner, o deshabilitó las predicciones. Esto impide verificar una operación externa completa. Las E2E usan el fixture de Byte del proyecto y firmas Ed25519 reales; no se emitieron transacciones externas.
