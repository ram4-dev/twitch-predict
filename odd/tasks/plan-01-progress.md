# Plan 1 — Informe de implementación (sesión 1)

Rama `apply-plan-01`, base `504d3cb`, worktree `/home/meeting/projects/twitch-predict.apply-plan-01`. Contrato temprano: `70e5592`. Última revisión de este informe al cierre de la implementación (2026-11-09).

## Commits (en orden)

| SHA | Contenido |
|---|---|
| `70e5592` | Contrato central: capacidades, actor/canal, ProposalCreateHandler, doc de contrato |
| `88756fc` | `Points.proposalTransaction` + `publishMarket` síncrono, shortIds persistentes por canal |
| `d27b6cf` | Reembolso automático atómico al cancelar y en void; ledger `refund` |
| `29f6b49` | Multi-mercado con códigos, parser con comillas/comillas dobles, guardas de ambigüedad |
| `4e1f5f2` | Recibos de apuesta por ID de evento (nuevo evento = nueva apuesta, replay no duplica) y moderador solo-crea |
| `9115446` | Puntos sin gate de wallet (bet/claim por sesión interna) |
| `4605a31` | Auditoría histórica read-only de reembolsos con ID de reparación estable |
| `df44f42` | Login Twitch-first: start/complete con sesión opcional (login vs link) |
| `4d7a24f` | UI: sección cuentas conectadas en perfil móvil, "Conectá Twitch" |
| `c96cde1` | Launcher E2E aislado de sesión (puerto 1368) y completions cloud |
| `eacab46` | Google OIDC: adaptador seguro con validación server-side + UI provider-aware |
| `bb26106` | Moderador real autoritativo (Get Moderators con caché 10 min) y gates sociales |
| `5349566` | Flujo de completación Google en perfil móvil |
| `7437006` | **Evidencia de moderadores con fecha** (hallazgo del coordinador): `channelModerators` ahora es `Record<string,{users,verifiedAt}>` con TTL 30 s; `verifiedModeratorOf` deniega evidencia legacy, vencida o en outage; `proposalTransactionWithRevalidation` revalida autoritativamente al confirmar publicación HTTP (hook `moderatorRevalidator` inyectable); dueño independiente de la evidencia |

## Interfaces nuevas para sesión 2

- `src/market-contract.ts`: `MarketActor`, `MarketChannel`, `capabilities()`, `ProposalCreateHandler`, `PublishMarketInput`, `PublishedMarket`, `ProposalTransaction`.
- `Points.proposalTransaction(cb)` con `draft.proposals` (mismo agregado points) y `draft.publishMarket(input)` síncrono: aceptar propuesta + publicar mercado se confirman en una sola escritura (`Documents.update` anidada en SQL).
- Formato de mensaje de publicación incluye el código corto (`M7K2`) y `!plot apostar M7K2, 1`.
- `Points.loginWithTwitch(identity)` para login Twitch-first (crea o reanuda cuenta, sin segundo bono).
- verifiedModerator solo desde evidencia firmada del adaptador (parámetro de `plotCommand`); nunca del body HTTP.
- Ver detalles en `odd/tasks/plan-01-contract.md` (actualizado con la sección "Publicación atómica aceptada").

## Comportamiento implementado

- Cancelación (chat, streamerAction, Twitch) acredita cada posición en la misma transacción: `claimed/creditedAt/creditMethod=refund` + asiento contable `refund`. Idempotente: un crédito por posición; `claim`/`distribute` excluyen posiciones acreditadas. Offline/sin wallet igual cobra en su cuenta persistida.
- Fase terminal de reembolso `void` para cancelación y para ganador sin apuestas (distinguibles por `winnerId`/`reason`).
- Multi-mercado simultáneo: códigos cortos persistentes por canal (alfabeto sin ambiguos, nunca reutilizados, sobreviven reinicios); `!plot mercados` lista; atajos sin ID solo con destino único, si no piden código sin debitar ni mutar; `!plot cerrar/resolver/cancelar/apostar M7K2` resuelven por código dentro del canal.
- Parser: comas fuera de comillas; texto entre comillas dobles conserva comas; comillas sin cerrar rechazadas con mensaje claro.
- Apuestas chat: cada evento EventSub nuevo = apuesta nueva (100 pts); replay del mismo mensaje devuelve el recibo original sin doble débito.
- Moderador verificado puede crear, nunca cerrar/resolver/cancelar; `creatorTwitchId` no otorga autoridad; dueño sigue siendo el `broadcaster_user_id`.
- Login Twitch primario (sin token previo); link con sesión conserva `accountId` y saldo; conflictos rechazados sin fusión; unlink no borra saldo/historial; una cuenta social (Phantom) opera puntos sin gate de wallet (BYTE sigue exigiendo firma).
- Auditoría histórica `src/refund-audit.ts`: read-only, reporta pendientes (posiciones con crédito faltante según ledger) y conflictos (marcadas refund pero sin asiento); ID de reparación estable; no escribe nada.
- UI móvil/perfil: sección "Cuentas conectadas" (Twitch/Phantom con estado y acción), `Conectá Twitch` cuando no hay identidad.

## Verificación ejecutada (real)

- `npm run check` completo: typecheck 0 errores, lint 0, unit/integración 122 pass / 0 fail, build ok (servidor + extensión).
- E2E con launcher aislado de sesión (`scripts/e2e-server-01.ts`, proxy portless propio puerto **1368**, host `twitch-predict-p1.localhost`, DATA_DIR temporal): 33 tests pasando, y tras los incrementales (Google OIDC + moderador real + gates sociales) re-verifiqué 14 E2E clave (twitch-auth 3, twitch-plot-chat 1, points 11) con el mismo launcher: **14 passed**.
  - `twitch-auth.e2e.ts` (3): link OAuth conserva cuenta/saldo, cancel/forged no otorgan acceso, seguimiento de mercados.
  - `twitch-plot-chat.e2e.ts` (1): streamer crea por chat, viewer apuesta desde página pública, streamer cierra/resuelve, viewer cobra (100 pts, saldo 9900→10000).
  - `points.e2e.ts` + `mobile-app-v2.e2e.ts` (11): dos cuentas comparten pozo, ganador cobra, perdedor no, reembolso persiste; flujo MV3; canales.
  - `market-detail`, `flow`, `live-markets`, `landing`, `mobile-responsive` (14): 360px/700px sin desbordes.
- Nota de incidente resuelto: un proxy portless viejo de esta misma sesión retenía el puerto 1368 y las primeras corridas E2E golpeaban ese servidor muerto; identificado vía `ss -tlnp`, limpiados solo procesos de esta sesión (`twitch-predict-p1`), sin tocar 1356/1358 ni servicios systemd.

## Archivos tocados (resumen)

`src/points.ts` (dominio), `src/plot-chat.ts` (parser), `src/market-contract.ts` (contrato), `src/refund-audit.ts` (nuevo), `src/twitch-auth.ts` + `src/cloud/twitch-auth.ts` (login/link), `src/offchain-server.ts` + `src/cloud/app.ts` (routers), `src/cloud/twitch-bot.ts` (recibos por evento), `src/ui/mobile-app.tsx` + `src/ui/consoles.tsx` (labels/UI), `src/points.ts` gate de wallet removido de bet/claim API, tests nuevos: `tests/capabilities.test.ts`, `tests/identity.test.ts`, `tests/twitch-login.test.ts`, `tests/refund-audit.test.ts`, `tests/plot-chat-extra.test.ts`; `scripts/e2e-server-01.ts` (launcher aislado).

## Parche mínimo fuera de mi propiedad (integración)

`src/ui/consoles.tsx` (sesión 2): una línea, agregué label `refund:'Reembolso'` al mapa de movimientos porque el nuevo tipo de ledger lo exige. Coordinador: revisar en el merge.

## Pendientes / decisiones externas

- **Google OAuth — evidencia corregida**: verifiqué el Secret Vault por NOMBRES (sin leer valores): **no existen** `GOOGLE_CLIENT_ID` ni `GOOGLE_CLIENT_SECRET` (existen TWITCH_CLIENT_ID/TWITCH_SECRET_TOKEN y otras claves no relacionadas). Corrección de mi informe anterior: dije "no verifiqué" y era incorrecto; la verificación hecha confirma que faltan. El adaptador Google OIDC **está implementado y probado con fixtures** (firma RS256 real vía WebCrypto, iss/aud/exp/nonce, sub estable, email nunca fusiona, login/link dual, UI "No disponible · Próximamente" sin config). Lo que queda bloqueado externamente es **solo la validación OAuth REAL** contra accounts.google.com; con las credenciales configuradas en vault-env el flujo funciona sin cambios de código.
- **Reparación histórica**: auditoría lista (dry-run/report); la escritura de reparación queda supeditada a revisión del reporte sobre datos reales, según plan.
- **Moderadores reales en chat: implementado** (`bb26106`): `CloudTwitchBot.isModerator` consulta `moderation/moderators` de Twitch con el app token del bot, caché de 10 minutos en el runtime aggregate, sin aceptar claims del cliente; Twitch caído → denegar sin adivinar (dueño sigue funcionando). Corregido además un deadlock real: la consulta sale fuera de la transacción del runtime document (LocalDocuments en cola serial; cloud reusa el cliente anidado). El parámetro `verifiedModerator` ya llega a plotCommand desde evidencia autoritativa. Sesión 2 no necesita tocar estos archivos.
- **Perfil sin wallet y gates sociales: revisados y corregidos** (`bb26106`, `5349566`): el nombre visible ya no depende de wallet (Twitch → Google → wallet → genérico); setBotEnabled y la consola del streamer autorizan por identidad Twitch vinculada (el canal demo_streamer conserva su wallet asignada); bet/claim de puntos sin wallet desde el commit `9115446`; completación Google desde el perfil móvil.
- **Claim de premios ganadores**: mantiene la política actual de cobro manual, según defaults aprobados.

## Incremental 2 — recorridos señalados por el coordinador (2026-11-09, HEAD 3a9d7fc)

| Commit | Corrección |
|---|---|
| `fb4f107` | Bundles regenerados (candidato previo sin revisión nativa: el proveedor detuvo el intento por presupuesto de contexto sobre bundles minificados; política documentada: regenerar al integrar) |
| `116d6e5` | **Onboarding Twitch-first**: "Continuar con Twitch" como acceso primario, Google solo si el servidor lo tiene configurado (else "todavía no disponible", nunca botón roto), Phantom como opción secundaria; completions de twitch_ticket/google_ticket al volver |
| `18ea5ca` | **Sesión social en /app**: la completación con ticket persiste el token nuevo (antes authRequest exigía sesión existente y el login social llegaba a /app sin sesión — falla encontrada por el E2E nuevo) |
| `4f2714e` | **Bot sin wallet**: start('channel') ya no exige wallet; cuentas sociales Twitch-only agregan el bot a su canal (Flow.wallet opcional, comparación condicional en complete) |
| `77c57e6` | **isModerator**: normalización de runtime legacy sin mapa `moderators`; caché positiva reducida a 30 s (revocaciones aplican dentro de una ventana de creación); Get Moderators paginado completo (after cursor); sincronización a `Points.setChannelModerators` para la evidencia de capacidades HTTP/publicación |
| `8253969` | **Scope moderation:read**: se solicita en el link del canal, se exige en callback (falla explícita, no silenciosa); 403 de la API se reporta; test de alcance y de denegación explícita |

E2E nuevos: `tests/social-entry.e2e.ts` (2) — primera entrada Twitch-only desde navegador limpio sin Phantom hasta /app con balance 10000 y twitch.id correcto; Google no configurado muestra notice y cero botones. Suite completa: 126 unit/0 fail + typecheck/lint/build verdes + 20 E2E re-verificados con launcher propio (social-entry 2, twitch-auth 3, twitch-plot-chat 1, points 11, mobile/responsive/landing/live 6; 2 skipped por modo). Puerto 1368 liberado tras cada corrida.

## Cómo verificar esta entrega

```sh
npm run check   # typecheck + lint + 122 tests + build
# E2E aislado de sesión (no colisiona con 1356/1358 ni con sesión 2):
npx tsx scripts/e2e-server-01.ts &   # proxy 1368
APP_URL=http://twitch-predict-p1.localhost:1368 npx playwright test tests/twitch-plot-chat.e2e.ts
```
