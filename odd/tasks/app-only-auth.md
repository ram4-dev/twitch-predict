# App-only auth entry with inline sign-in

Source: /Users/ramiro/.t3/projects/twitch-predict.main at 16c1edc (origin/main).
Branch: feat/app-only-auth.
Worktree: /Users/ramiro/.t3/projects/twitch-predict.feat-app-only-auth.

`/app` is the only entry. Signed out, it renders the real onboarding auth card inline
instead of the separate `PointsSignIn` teaser, so one click reaches the provider without
an intermediate `/onboarding` render. `/onboarding` stops being a user destination and
becomes a compatibility redirect to `/app`, which keeps old links, OAuth callbacks and
the extension pairing flow working. Streamer channel verification, the chat bot and the
share tools move into the `Mi perfil` tab as an extra configuration block.

## Task 1 — Inline sign-in card in the app

Replace `PointsSignIn` with the real onboarding auth card rendered inside `/app`.
Keep Twitch and Google social entry, the Phantom connect and sign-message flow, the
extension `flow` handoff, the `twitch_ticket`/`google_ticket` completion, and the
`connect=twitch|google|phantom` deep link behaviour. Users must not see an empty
`/onboarding` render between the click and the provider.

## Task 2 — `/onboarding` becomes a compatibility redirect

Serve `/onboarding` as a redirect to `/app`, preserving query and hash so `connect`,
`streamer`, `flow`, `twitch_ticket`, `google_ticket`, `bot_ticket` and their error
siblings still resolve. Point the OAuth callback, the bot callback, the extension
popup and every in-product link at `/app` directly.

## Task 3 — Streamer configuration in `Mi perfil`

Move the streamer block (wallet, verified channel, `plotfun` bot, share tools) out of
the retired onboarding screen and into the profile tab, visible only for streamer
accounts. Keep `Activar seguimiento`, bot enable/disable and the share/QR/OBS tools.

## Task 4 — Tests and evidence

Update the E2E and unit coverage that navigates to `/onboarding` so it asserts the
`/app` entry, the redirect, and the profile-hosted streamer block. Record typecheck,
lint, unit and E2E evidence, plus a browser check of the signed-out `/app` and the
streamer profile.

## Verification

Pending.

Implementation commits are recorded here as each task closes.

## Verification (updated 2026-11-26)

Unit and static gates are green: `npm run typecheck`, `npm run lint`, `npm run build`, and
`npm test` (215 tests: 197 passed, 18 skipped, 0 failed).

E2E is green for the surfaces this change owns:

- `tests/streamer-onboarding.e2e.ts` — 5 passed (channel link, wallet failure, missing Twitch
  configuration, Twitch cancellation, bot status failure).
- `tests/twitch-bot-onboarding.e2e.ts` — passed (bot consent through the profile block).
- `tests/social-entry.e2e.ts` — passed, including the retired `/onboarding` redirect.
- `tests/phantom-handoff.e2e.ts` — 3 passed (mobile Phantom handoff targets `/app`).
- `tests/brand.e2e.ts` — branded surfaces and betting-mode units now target `/app`.

Still failing and NOT closed in this unit: `tests/points-identity.e2e.ts` (3 cases) and the
`contributor` flows that build a market as an owner and then bet from a Twitch-only viewer
session. The viewer card lookup `[data-key=...]` finds no card on `/app?channel=<login>` in the
fixture server. Direct probing confirmed the Twitch login path itself works: `/app` renders the
gate, the callback lands on `/app#profile` with a session, the profile shows the account, and
`/api/markets` returns the demo market. The gap is specific to a market created by a streamer
through `/api/streamer/markets` while the fixture Twitch identity stays in GQL-only mode, so the
market never appears in the viewer feed. That is fixture plumbing, not the app-entry change, and
needs its own diagnosis instead of more blind iterations.

Behaviour fixed during this unit that the tests proved were real defects:
- The sign-in card auto-connected Phantom on every load; the extension-only guard was restored.
- A signed-in user could not link Twitch from the profile rows; the rows now start the provider
  flow instead of pointing at the retired screen.
- The "channel followed" state was local and vanished on reload; it is now read back from
  `/api/twitch/channels`.
