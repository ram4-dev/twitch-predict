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

- `npm run check` completo: typecheck 0 errores, lint 0, unit/integración 117 pass / 0 fail, build ok (servidor + extensión).
- E2E con launcher aislado de sesión (`scripts/e2e-server-01.ts`, proxy portless propio puerto **1368**, host `twitch-predict-p1.localhost`, DATA_DIR temporal): 33 tests pasando, incluyendo:
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

- **Google OAuth**: sin app OAuth configurada (no verifiqué secretos por nombres externos). El plan exige proveedor sin configurar no presentarse como botón funcional; el flujo actual no agrega botón Google. Bloqueo externo exacto: se necesitan `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` en el entorno (vault-env) para implementar P1-09.
- **Reparación histórica**: auditoría lista (dry-run/report); la escritura de reparación queda supeditada a revisión del reporte sobre datos reales, según plan.
- **Panel de moderadores en chat**: la evidencia `verifiedModerator` espera la integración del bot con la lista de mods (Get Moderators) que maneja el coordinador/Plan 2; el parámetro ya existe y el flujo completo está probado con evidencia firmada en fixtures.
- **Claim de premios ganadores**: mantiene la política actual de cobro manual, según defaults aprobados.

## Cómo verificar esta entrega

```sh
npm run check   # typecheck + lint + 117 tests + build
# E2E aislado de sesión (no colisiona con 1356/1358 ni con sesión 2):
npx tsx scripts/e2e-server-01.ts &   # proxy 1368
APP_URL=http://twitch-predict-p1.localhost:1368 npx playwright test tests/twitch-plot-chat.e2e.ts
```
