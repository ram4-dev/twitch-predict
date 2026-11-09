# Plot predictions created from Twitch chat

User direction: “No lo encuentro pero no debería ser un comando / debería ser simplemente un comando de !plot”.

## Worktree

Repository: `/home/meeting/projects/twitch-predict`. Source preview worktree: `/home/meeting/projects/twitch-predict.unify-brand-ui`, branch `unify-brand-ui`. Fresh Worktrunk branch: `plot-chat-predictions`, path `/home/meeting/projects/twitch-predict.plot-chat-predictions`, source commit `a14d3fd` (main). Existing uncommitted preview changes were copied as a snapshot into this worktree so the new feature retains the current UI and bot infrastructure; the original worktree was not changed. The inherited tracked patch is `/tmp/plot-chat-inherited.patch`. No commits, pushes or merges. Retain for resumption.

## Behavior

- `!plot`: channel link and command hint. `!plot ayuda`: syntax reference.
- `!plot crear Pregunta`: creates a Plot prediction with Sí/No options. `!plot crear Pregunta, Opción 1, Opción 2` supports two to six distinct options. Betting opens for 120 seconds.
- `!plot cerrar`: closes the pending Plot prediction. `!plot resolver 1`: selects the winning option by number after closing or expiry. `!plot cancelar`: cancels and makes existing stakes available to claim through the existing points system.
- Only the linked broadcaster with an enabled bot can create or manage predictions. Moderators and other viewers cannot settle markets. One pending native prediction per channel. Twitch mirrored markets retain their existing flow.
- `!yes`, `!no`, `!1` through `!6` use the pending native prediction when present; each stake is 100 internal points. Closed native predictions do not accidentally redirect a bet to another Twitch market. Existing balance and receipt protections apply.
- Native markets carry `source:plot`, use a separate `plot:` key, and do not require Twitch Channel Points, Affiliate status or Twitch prediction freshness. Twitch polling excludes them. They appear on the public channel page even when BYTE is configured, with point units distinguished from devnet markets.
- Signed EventSub event IDs and durable command receipts prevent repeated creation or settlement. Responses use the existing outbox. Non-broadcaster command replies retain a channel cooldown. No unauthenticated creation endpoint was introduced.

## Validation

Pending final verification and preview update. Unit tests cover syntax, permissions, disabled bot, duplicate events, persistence, stale external source timestamps, automatic expiry, point conservation, cancellation and signed webhook handling. Browser E2E covers channel linking, bot authorization, signed chat creation, public-page betting, close/resolve and claim, plus compact widths 360 and 700.

Final checks: `npm run check` succeeded: 106 tests passed, zero failed, 13 staging-DB-dependent skips; typecheck, lint and build passed (`/tmp/plot-chat-check-final.log`). Combined BYTE/public/onboarding/native-chat E2E: 23/23 passed (`/tmp/plot-chat-e2e-final.log`), including creation via signed chat webhook, duplicate delivery, viewer bet through the shared public card, unauthorized close rejection, owner close/resolve and claim. Compact widths 360 and 700 passed. The preview user service gets a WorkingDirectory override for this worktree; OAuth, data directory and temporary signed webhook transport are retained.

Comma syntax follow-up: user requested commas instead of pipes. Reused this exact authorized slice/worktree. Parser accepts comma-separated question/options (and preserves old pipe commands); bot help, validation messages and existing unit/E2E examples now show commas. The full native prediction browser flow using comma syntax passed (`/tmp/plot-chat-comma-e2e.log`). Remaining checks and preview restart recorded below.
Comma follow-up complete: `npm run check` succeeded (106 pass, 13 staging skips, typecheck/lint/build pass). Preview restarted and reports configured=true/available=true; ramitapai chat phase remains connected. No commit or push.
