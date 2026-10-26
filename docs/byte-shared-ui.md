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

## Prueba real posterior · 2026-10-26

El acceso partner ya responde HTTP 200. Se creó el mercado técnico `pm_539d3b10d4`, se leyó por ID y en la lista, se verificó el cierre y se envió resolución con evidencia. La respuesta inicial fue `resolved`; la consulta posterior de Byte informó `invalid`, `settled: true`, pozo 0. El panel y un popup MV3 aislado mostraron ese estado y no habilitaron apuestas después del cierre. Se guardó el recibo público en `docs/byte-live-receipt.json`. La consulta de cuenta en cadena posterior a la liquidación devolvió null; no se toma como evidencia independiente de la creación en cadena.

La prueba real detectó un hash de génesis de devnet truncado tanto en el código como en el fixture. Se corrigió al hash completo reportado por el RPC, se agregó una comprobación de 32 bytes y una E2E que rechaza otra red antes de transmitir. El RPC del preview ahora devuelve HTTP 200 y el hash correcto.

Verificación: `npm run check` aprobado, con 38 tests unitarios. En Playwright pasaron 30 casos activos; el caso nuevo de red incorrecta falló inicialmente por esperar una variante literal del mensaje y pasó en la repetición específica con ambas variantes válidas del cliente y servidor. Total: 31 E2E activos verificados y 4 legacy omitidos por modo. La primera corrida anterior se interrumpió para aplicar la corrección; no se cuenta como aprobada.

No se completó una apuesta con fondos contra Solana real: `requestAirdrop` respondió Internal error y la wallet temporal no obtuvo fondos. Las pruebas automáticas de apuesta, firma, sincronización y pagos siguen usando el fixture RPC y firmas Ed25519 verificables. La interacción con una wallet personal en Phantom tampoco se verificó. La corrección está en este worktree; main conserva su revisión anterior.

## Corrección CSP · 2026-10-26

Paper Shaders 0.0.82 inserta un bloque CSS fijo al montar el primer canvas. Su hash coincide con el error reportado (`sha256-bcX2M6hOeEgeI9Ttj3KtXWZuoRsKenyQAlXswSnLakA=`). La política compartida de ambos servidores permite exclusivamente ese bloque mediante hash, además de estilos del mismo origen. Los scripts conservan `script-src 'self'`.

Una prueba unitaria contrasta el hash con el CSS de la dependencia instalada. La E2E comprueba que la hoja tiene reglas aplicadas, que los shaders del fondo y del botón montan sin violaciones de estilo en catálogo y Byte, y que un bloque inline ajeno sigue bloqueado. `npm run check` aprobó typecheck, lint, 39 unitarios y build; las 9 E2E relevantes (Byte, CSP y Dia) aprobaron. Preview reiniciado y header HTTP verificado. Rama conservada: `feat/byte-shared-ui`, origen de esta corrección `f3eda56`; main permanece sin cambios.
