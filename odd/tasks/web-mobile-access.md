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

- T1 [S13,S1,S2,S6,S15] ✅ Rutas y helpers compartidos: `src/public-paths.ts` + `src/ui/streamer-page.tsx`/`streamer-app.tsx` (vistas /s, /join, /overlay), `public/streamer.html`/`streamer.css`, rutas en offchain-server y rewrites de vercel.json. /app intacto. — commit 2d187a6
- T2 [S7] ✅ Filtro exacto en byte-ui.tsx (mercados + previews via reconcileBytePredictions con canal) y prueba en tests/public-paths.test.ts. — commit 6f93f1d
- T3 [S1,S2,S3,S13] ✅ Página /join en streamer-app.tsx (PC: QR+botón; móvil: location.replace a /s, enlace directo de respaldo, ?desktop=1 fuerza vista PC). QR local via qrcode a /s/:login. — commit 2d187a6
- T4 [S4,S5,S13] ✅ Búsqueda en home: src/ui/streamer-search.tsx (normaliza con twitchChannel antes del endpoint, resultados → /s/:login, sin watch). — commit 74e6c60
- T5 [S3,S10,S11,S13] ✅ Panel del streamer: StreamerTools en streamer-onboarding.tsx (copiar /join, QR PNG, URL OBS, ver predicciones); overlay compacto en streamer-app.tsx. — commit a65615f
- T6 [S12] ✅ Bot: channelUrl() → /join/twitch/:login con config.origin; tests de twitch-bot-cloud actualizados (welcome, anuncio y !plot). — commit f66d10a
- T7 [S9,S8] Transporte wallet móvil (Phantom deeplink/provider) con conservación de intención y revalidación antes de confirmar; flujo inyectado de escritorio intacto. — commit feat
- T8 [S14] Build, rewrites de vercel.json, CSP y offchain-server para las rutas nuevas. — commit feat
- T9 [S16] E2E: /join (PC/móvil), /s (estados, exact-match), overlay, QR decodificado; fixtures; regresiones de extensión/bot. — commit test
- T10 [S17] README: recorrido web móvil, OBS, transporte wallet móvil y límites de validación. — commit docs
- T11 [S16] `npm run check` completo + E2E afectadas en modo byte. — commit chore

## Log

L1. Pedido original (handoff): "hagamos esas modificaciones" — spec completa del acceso web móvil, QR para OBS y búsqueda pública (4 nov 2026).
L2. Slice boundary: 474 líneas en 5 commits (2d187a6, 6f93f1d, 74e6c60, a65615f, f66d10a). T1–T6 completos; siguen T7 (wallet móvil), T8 (CSP), T9–T11 (E2E, docs, check).
