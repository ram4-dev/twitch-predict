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
