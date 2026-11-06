# Web móvil: acceso por streamer y QR para OBS

Branch: `web-mobile-access` (worktree `twitch-predict.web-mobile-access`). Base: 7d262b2.
Spec fuente: handoff del usuario (4 nov 2026). Transporte wallet móvil elegido: **Phantom Deeplinks (Phantom Provider + Universal Link, metadatos firmados via Wallet Link / phantombrowser)**.

## Specs

S1. Bot comparte URL estable `/join/twitch/:login`. En PC: streamer + QR grande + botón "Continuar en este dispositivo". En celular: navegación directa a `/s/twitch/:login`. Verbatim: "En PC: mostrar nombre/avatar del streamer, un QR grande y, debajo, el botón "Continuar en este dispositivo". En celular: abrir directamente la página de predicciones del streamer."

S2. "Al escanear el QR: abrir directamente las predicciones, sin mostrar otra pantalla de QR." "Al pulsar el botón de PC: abrir esa misma página, adaptada al escritorio."

S3. QR apunta a `/s/twitch/:login` (nunca a /join ni al overlay). "El QR identifica al streamer, no a una predicción que vence."

S4. Home con búsqueda visible "Buscá a tu streamer". Acepta nombre de canal, @usuario y enlace canónico de Twitch. Normalizar con `twitchChannel()` (src/mobile-model.ts). No enviar URL cruda a /api/twitch/search.

S5. "Seleccionar un resultado abre directamente las predicciones del canal. No pasar por la pantalla de QR." Búsqueda y visita públicas: "no deben activar seguimiento, registrar canales ni crear mercados" (sin watch()).

S6. `/s/twitch/:login`: avatar/nombre/plataforma, predicciones abiertas (pregunta, opciones, tiempo restante, unidades explícitas), selección+importe+confirmación, predicciones pendientes y resultados del usuario, acceso secundario a búsqueda/compartir. Estados separados: carga / canal inexistente / canal válido sin predicciones abiertas ("@streamer todavía no tiene predicciones abiertas. Cuando abra una, aparecerá acá.") / canal no habilitado / error de consulta. Nunca redirige a /join.

S7. Filtro exacto: "Mostrar exclusivamente mercados y previews del login normalizado mediante coincidencia exacta. foo nunca debe mostrar predicciones de foobar." (Corrige `.includes()` actual de byte-ui.tsx.)

S8. Participación sin cuenta; pedir autenticación al querer apostar conservando canal/mercado/opción/importe. Al regresar de wallet: revalidar cierre/mercado; "No enviar automáticamente la apuesta: el usuario vuelve a confirmar antes de solicitar la firma".

S9. Wallet móvil: conservar flujo Phantom inyectado en escritorio y agregar transporte móvil que cubra signMessage + firma de transacciones. Si falta wallet: acción concreta para abrir/instalar, sin pedir extensión de Chrome. Preservar intención durante transición; no asumir localStorage compartido. Resolver cancelación/rechazo/regreso con estados recuperables; mantener protecciones anti-duplicado y validaciones de byte-bet-core.ts. Sin custodia ni cuenta extra.

S10. Panel del streamer: copiar enlace `/join/twitch/:login`, descargar QR PNG (codifica `/s/twitch/:login`, contraste/margen), copiar URL OBS `/overlay/twitch/:login`, ver mis predicciones `/s/twitch/:login`.

S11. Overlay `/overlay/twitch/:login`: sin sesión privada, composición compacta, fondo transparente alrededor, fondo claro detrás del QR, sin animaciones que impidan escanear.

S12. Bot: `channelUrl()` en src/cloud/twitch-bot.ts pasa a devolver `/join/twitch/:login` con config.origin. Conservar autorización, desactivación, cooldown, deduplicación y outbox.

S13. Rutas: `/` home+búsqueda, `/join/twitch/:login`, `/s/twitch/:login`, `/overlay/twitch/:login`, `/app?channel=:login` sigue operativo con sus parámetros. URLs absolutas con origen público HTTPS (config.origin / PLOT_PUBLIC_ORIGIN); sin hardcodeo de dominio ni localhost en QR.

S14. Build/infra: scripts/build.ts genera HTML/bundles de las páginas nuevas en dist/web; vercel.json agrega rewrites `/join/:platform/:login` y `/s/:platform/:login` + `/overlay/:platform/:login`; CSP revisada para avatares/QR/transporte móvil sin abrir la política globalmente; offchain-server.ts sirve las rutas en dev.

S15. Plataforma normalizada: solo twitch soportado; otra plataforma → estado explícito "no soportada", nunca datos de Twitch bajo otra etiqueta.

S16. Pruebas focalizadas: rutas/normalización, coincidencia exacta, QR decodificado, navegación sin escrituras; E2E PC/móvil con fixtures; `npm run check` verde; no declarar válido un run que solo haya corrido offchain.

S17. Documentación: README con recorrido web móvil y configuración OBS; documentar transporte móvil elegido y comportamiento al volver de la wallet.

S18 (L3). Cualquier persona puede vincular su cuenta de Twitch con su cuenta de Plot; el vínculo habilita apostar desde el chat.

S19 (L3). Si un usuario vinculado escribe !yes, !no o la opción (por ejemplo !1, !2) en el chat del canal donde se abrió la predicción, apuesta desde ahí, sin abrir la web.

S19a (L4, decisión 5 nov 2026). Ejecución elegida: saldo interno. El usuario apuesta con puntos/SOL cargados en su cuenta de Plot; el chat debita ese saldo y registra la posición. La lógica de movimiento/settlement de fondos internos queda fuera de esta implementación: el débito y el registro se hacen sobre el saldo interno del punto, sin tocar firmas on-chain ni custodia on-chain.

- T1 [S13,S1,S2,S6,S15] ✅ Rutas y helpers compartidos: `src/public-paths.ts` + `src/ui/streamer-page.tsx`/`streamer-app.tsx` (vistas /s, /join, /overlay), `public/streamer.html`/`streamer.css`, rutas en offchain-server y rewrites de vercel.json. /app intacto. — commit 2d187a6
- T2 [S7] ✅ Filtro exacto en byte-ui.tsx (mercados + previews via reconcileBytePredictions con canal) y prueba en tests/public-paths.test.ts. — commit 6f93f1d
- T3 [S1,S2,S3,S13] ✅ Página /join en streamer-app.tsx (PC: QR+botón; móvil: location.replace a /s, enlace directo de respaldo, ?desktop=1 fuerza vista PC). QR local via qrcode a /s/:login. — commit 2d187a6
- T4 [S4,S5,S13] ✅ Búsqueda en home: src/ui/streamer-search.tsx (normaliza con twitchChannel antes del endpoint, resultados → /s/:login, sin watch). — commit 74e6c60
- T5 [S3,S10,S11,S13] ✅ Panel del streamer: StreamerTools en streamer-onboarding.tsx (copiar /join, QR PNG, URL OBS, ver predicciones); overlay compacto en streamer-app.tsx. — commit a65615f
- T6 [S12] ✅ Bot: channelUrl() → /join/twitch/:login con config.origin; tests de twitch-bot-cloud actualizados (welcome, anuncio y !plot). — commit f66d10a
- T7 [S9,S8] ✅ Transporte móvil: `phantomBrowseUrl` (universal link browse de Phantom, docs oficiales), intención market/option/amount en query pública (sin tokens), prefill en StreamerMarket, botón "Abrir en Phantom" con fallback a instalar; cancelación 4001 mapeada. Prueba de solo-origen-propio en public-paths.test.ts. — commit c73d61c. Pendiente de validación real con device (ver T11).
- T8 [S14] ✅ Build (scripts/build.ts entry streamer-ui), rewrites vercel.json (/s, /join, /overlay), rutas en offchain-server, HTML/estilos propios con el tema compartido (sin depender del style.css del dashboard); CSP sin cambios: todo es 'self' (QR local en canvas, avatares con inicial, sin recursos externos). — commits 2d187a6, 1032894
- T9 [S16] ✅ E2E tests/streamer-web.e2e.ts: 7/7 verdes en modo byte (exact-match, estados, /join PC con QR decodificado via jsQR, /join móvil sin bucle, overlay sin sesión, búsqueda sin watch). byte.e2e 9/9, byte-mirror incluido en la misma corrida (17 passed). Pre-existing en main: landing.e2e:69 y streamer-onboarding.e2e:7 fallan igual sin mis cambios (verificado con git stash). — commits 7b72f22, ebf78af
- T10 [S17] ✅ README: sección "Acceso web móvil" con rutas, OBS, transporte Phantom y apuestas por chat. — commit ebf78af
- T12 [S18] ✅ linkTwitch sin wallet (viewer) + streamer conserva registro de canal; test en twitch-link-chat.test.ts. — commit 4045d59
- T13 [S19,S19a] ✅ chatBet en Points (saldo interno, dedupe por requestId, 100 pts fijos) + manejo !yes/!no/!1-6 en CloudTwitchBot.webhook con TwitchSource y dedupe por evento. — commit 4045d59
- T14 [S16] ✅ tests/twitch-link-chat.test.ts (2) + caso de bot en tests/twitch-bot-cloud.test.ts (apuesta, dedupe, no-vinculado, !plot). twitch-auth.test.ts actualizado al nuevo mensaje de conflicto. — commits 4045d59, 7b72f22
- T11 [S16] ✅ `npm run check` verde (typecheck+lint+91 tests+build). E2E byte: streamer-web 7/7, byte 9/9, byte-mirror en la misma corrida: 17 passed. — verificación final
- T14 [S16] Tests/E2E de vinculación y apuesta por chat.

## Log

L1. Pedido original (handoff): "hagamos esas modificaciones" — spec completa del acceso web móvil, QR para OBS y búsqueda pública (4 nov 2026).
L2. Slice boundary: 474 líneas en 5 commits (2d187a6, 6f93f1d, 74e6c60, a65615f, f66d10a). T1–T6 completos; siguen T7 (wallet móvil), T8 (CSP), T9–T11 (E2E, docs, check).
L3. Cambio de alcance (5 nov 2026, verbatim): "Tambien hagamos que cada persona pueda vincular su cuenta de twitch con su cuenta de plot y que si pone !yes o !no o la opcion en el chat de twtich o de lo que sea donde se abrió la prediccion tambien pueda apostar desde ahi". Nuevos S18–S19, tareas T12–T14; T9 reabierta para cubrir los recorridos nuevos.
L4. Decisión de ejecución (5 nov 2026): opción 3, saldo interno. Verbatim: "3, saldo interno aunque no te preocupes por la logica de como se va a hacer para mover los fondos porque vamos a funcioanr con puntos o al menos SOL directmaente cargados en la app". El chat debita el saldo interno de la cuenta Plot vinculada; settlement posterior fuera de alcance.
L5. Cierre (5 nov 2026): 11 commits en web-mobile-access, 1673 inserciones. Check verde (91 unit + build). E2E byte: streamer-web 7/7, byte 9/9, byte-mirror: 17 passed en corrida combinada. Dos fallos E2E pre-existing en main (landing.e2e:69, streamer-onboarding.e2e:7), verificados con git stash. Pendiente de validación manual: dispositivo móvil real con Phantom instalada (apertura de otra app y firmas reales no son cubiertas por emulación).
