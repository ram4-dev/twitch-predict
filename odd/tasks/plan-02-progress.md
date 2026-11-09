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
