# Plan 2 — progreso de la sesión 2

Rama: `apply-plan-02`; base: `504d3cb`; worktree: `/home/meeting/projects/twitch-predict.apply-plan-02`.

## Decisiones registradas

- Contrato de tipos `src/market-contract.ts` copiado byte a byte del commit 70e5592 (Plan 1) para que la integración no diverja.
- Dominio de propuestas aislado en `src/proposals.ts`, con `ProposalGateway` inyectable para publicar al aceptar. Ninguna propuesta mueve saldo ni acepta apuestas.
- Persistencia: espejo de `Points` — transacción con snapshot atómico sobre `Documents` en cloud y archivo local para E2E, cola serializada.
- Router propio `src/proposals-router.ts` (montaje vía patch en `plan-02-integration.patch`); sin editar routers de sesión 1.
- Recibos idempotentes por evento/acción; doble aceptación protegida en transacción; aceptar/retirar/rechazar con un solo ganador.

## Log

- L1 (verbatim, 2026-11-09): "El usuario autorizó aplicar ambos planes en paralelo y pidió dos sesiones adicionales cada una en su worktree. Esta es la sesión 2, IMPLEMENTACIÓN del Plan 2. Tu worktree ya está creado y enlazado por T3: /home/meeting/projects/twitch-predict.apply-plan-02, rama apply-plan-02, base local 504d3cb0d1a5fd22b5e8196dcb10b5317362029b. Reutilízalo, no crees otro ni edites source/main. No estás solo: sesión1 trabaja en /home/meeting/projects/twitch-predict.apply-plan-01. No reviertas cambios ajenos."
- L2: run previo interrumpido sin código; esta sesión retoma desde cero conservando base y contrato.
- L3: usuario reconfiguró a Pi GLM5.3 Flash thinking high y pidió retomar Plan2 completo aquí, sin más sesiones/agentes.
- L4: nota de runtime: estrategia de entrega fija `feature-branch-chain` (sin humano en esta sesión); cortes de slice >400 líneas registrados en commits a8eed97, 9f6aa86, 17c4de4.

## Commits

- a8eed97 feat(proposals): domain, limits, receipts and atomic acceptance service
- 9f6aa86 feat(proposals): HTTP router and role-deciding create handler
- 17c4de4 feat(ui): proposal inbox, my-proposals, market composer and styles
- 90f0c97 docs(odd): plan-02 progress, interfaces and integration patch notes
- 753f4ad test(e2e): proposals API checks and isolated plan-2 launcher on port 1362
- e046c8d test(e2e): accept bridge-guard 401 before proposals router integration
- 5589e3f test(e2e): reuse standard fixture paths in plan-2 launcher

## Integración real (e686b4d → c34b605 de sesión 1)

- Merge de `apply-plan-01` (`e686b4d` + `eacab46` Google) en `apply-plan-02`: merge commits `fb3aa90`, `aaeb546`. `src/market-contract.ts` quedó byte-idéntico al de sesión 1.
- Servicio reescrito sobre `Points.proposalTransaction`: `src/proposals-service.ts` ya no tiene gateway/store propios — propuestas y recibos viven en `draft.proposals` del MISMO aggregate points; aceptación = `draft.publishMarket` síncrono + transición en una sola escritura. `requestId` determinístico `proposal-accept:<id>:<version>` → id de mercado determinístico.
- Router montado en `src/offchain-server.ts` (`/api/proposals/*`) con resolver server-side: actor desde `points.me(bearer)`, canal desde `state.streamers` (acepta twitchId o login), owner por `twitchId===channel.id`.
- `Points.accountForTwitch()` (método público mínimo, 1 línea, mount de sesión 2 en archivo de sesión 1 — a revisar por coordinador).
- Bot (`src/cloud/twitch-bot.ts`): `mountProposals()` opcional; viewer `!plot crear` (no-owner, no-mod) con cuenta vinculada → propuesta pendiente con recibo del evento; sin cuenta vinculada → pedido de vinculación; sin mount → comportamiento anterior. La evidencia de moderador firmada de sesión 1 (isModerator, sin commit aún) se inserta en esa rama cuando exista.
- UI: `ProposalInbox` en `StreamerConsole`, `MyProposals` en `UserConsole` (`src/ui/consoles.tsx`).

## Verificación (actualizada)

- typecheck/lint: limpios en todo el proyecto.
- Unit: suite completa `npm test` → 147 tests, 134 pass, 0 fail, 13 skipped (E2E). Propuestas: 9/9 dominio+servicio, 4/4 UI SSR.
- E2E `tests/proposals.e2e.ts` (server REAL montado, launcher propio puerto fijo interno 14622 vía `--app-port`, sin proxy front — 1362 quedó libre de estados viejos): 2/2 en corridas repetidas — login Twitch-first fixture, submit viewer 201, bandeja owner-only, viewer-accept 403, owner-accept publica 1 mercado en el aggregate, double-accept replaya, withdraw y reject con motivo.
- El launcher usa `portless twitch-predict --app-port 14622` + `AUTH_ORIGIN=http://twitch-predict.localhost:14622` y fixtures OAuth en `.e2e-fixtures/` (gitignored, inmune al wipe de test-results).

## Commits de integración

- fb3aa90 / aaeb546 merges de plan-01
- 739413a servicio sobre proposalTransaction
- 5543890 montaje server/bot/consola
- 359260d chat mount + guard 403 + E2E puerto estable
- f5dcea0 limpieza diagnóstico

## Estado de integración (actualizado, HEAD 2700508+db50951)

- Merges de session-1 completos: e686b4d, eacab46 (Google), 5f680a6 (mods), a451b99+3542b9e (evidencia con fecha, revalidación fuera de la transacción, veredicto override, freshModerators). Último merge: 2700508.
- Revalidator HTTP conectado DIRECTO: `points.moderatorRevalidator=channel=>bot.freshModerators(channel.id,channel.login)` en offchain-server (sin fallback null) y en CADA Points del contexto cloud (`src/cloud/app.ts`, por-request).
- PENDIENTES ANTIGUOS RETIRADOS (ya resueltos): gateway createMarket (sustituido por proposalTransaction), resolver de canal/dueño (montado), montaje de ProposalInbox (hecho). La sección histórica de interfaces conserva `ProposalMarketGateway` solo como referencia — YA NO se usa.
- `Points.accountForTwitch()` (points.ts:165): mount aditivo de 1 línea, para revisión de session 1 en el merge final.

## E2E reales ejecutados (server montado, puerto interno fijo 14622)

- `tests/moderator-evidence.e2e.ts` (2/2): webhook EventSub firmado real → Get Moderators fixture por archivo de modo: cache positiva publica; revocación sin chat intermedio + TTL 30s RECHAZA; outage RECHAZA sin guessing; owner publica por HTTP independiente de la edad de evidencia; viewer siempre 403.
- `tests/proposals.e2e.ts` (2/2): login Twitch-first fixture; viewer propone 201; bandeja owner-only; viewer-accept 403; owner-accept publica 1 mercado en el aggregate; double-accept replaya; withdraw; reject con motivo visible en Mis propuestas.
- `npm test`: 158 tests, 145 pass, 0 fail; typecheck/lint limpios; bundles regenerados.

## Pendiente (blocker material)

- Sesión 1: la creación directa de moderador por HTTP (`/api/streamer/markets` como MODERADOR — el owner ya funciona) usa la revalidación fresh; el wiring existe, falta su verificación E2E cuando el revalidator consulte la lista real (el fixture cubre el camino server-side; la consulta autoritativa ya corre fuera de la transacción por su corrección 3542b9e).

## Cierre de integración (HEAD 0508d76)

- Merge de los fixes de review de session-1 (43ff07c: publication receipts, viewer bets/list guard, pipes compat, auditoría histórica) — sin conflictos, preservando accountForTwitch, router/bot/cloud revalidator y UI Plan 2.
- Fix real de integración en /app: el complete de Twitch desde el dashboard iba SIN bearer (authRequest lo exigía → login flow roto) → bearer OPCIONAL: link flow manda sesión, login flow completa sin ella.
- Consola completa EN LA APP MÓVIL (/app#profile): composer crear, bandeja de propuestas y acciones cerrar/resolver/cancelar por botones (MarketComposer + ProposalInbox + MarketAdminActionsInline en mobile-app.tsx).
- Fixtures OAuth/GQL con precedencia mtime entre test-results y .e2e-fixtures (los tests que alternan identidades leen su propio valor).
- E2E actualizados a comportamiento autorizado: cancelación acredita AUTO (sin botón Cobrar, claim repetido 400), scopes del bot con moderation:read, botón social 'Entrar con Phantom'.
- E2E nuevo tests/console-ui.e2e.ts: consola completa POR BOTONES desde /app#profile (crear→cerrar→resolver→cancelar con reembolso automático; viewer sin consola). Nota: resolver un mercado sin apuestas produce phase void con winnerId (comportamiento autorizado Plan 1).

## Verificación final

- npm test: 161 tests / 148 pass / 0 fail (13 skipped E2E). typecheck/lint limpios. build OK.
- E2E combinado (server propio puerto interno 14622, launcher aislado): 15/15 PASS en una corrida — console-ui, moderator-evidence (revocación/outage sin chat), points (refund auto + MV3), proposals (flujo completo), social-entry, twitch-auth (4), twitch-plot-chat.
