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

## Interfaces entregadas (para coordinador/sesión 1)

- `ProposalService.submit/withdraw/reject/accept/listForAuthor/listForChannel/get` (`src/proposals-service.ts`).
- `ProposalMarketGateway.publishMarket({token,channel,input,actor,requestId}) → {key,id}`: seam que el integrador conecta a `createMarket` del Plan 1 con recibo idempotente por `requestId`.
- `proposalsRouter({service,resolver})` con `ProposalActorResolver` (`src/proposals-router.ts`): monta `/api/proposals/*`; identidad y dueño vía resolver inyectado.
- `handleProposalCreate(deps,{actor,channel,input,eventId,verifiedModerator})` (`src/proposals-create-handler.ts`): contrato `ProposalCreateHandler` del Plan 1; devuelve `{kind:'market'|'proposal',...}`.
- UI: `ProposalInbox`, `MyProposals`, `MarketComposer`, `ProposalCard`, `httpProposalsClient` (`src/ui/proposals-ui.tsx`, `src/ui/proposals-client.ts`).

## Pendientes de integración (blockers materiales)

- Gateway real hacia `createMarket` compartiendo `Documents` (transacción SQL única) — patch en `odd/tasks/plan-02-integration.patch.md`.
- Resolver de canal/dueño conectado a identidad final de sesión 1.
- Montaje de `ProposalInbox` en consola con `channelIdFor` desde `GET /api/channels/:id/capabilities`.
