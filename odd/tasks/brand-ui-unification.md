# Shared brand and UI components

Source: `main` at `a14d3fdc63edb829b749fc829eaa7cdba710f144`.
Branch: `unify-brand-ui`.
Worktree: `/home/meeting/projects/twitch-predict.unify-brand-ui`.
The original main checkout and its preview remain separate.

## Reuse

- `src/brand.ts` defines the canonical web logo, accessible label and dimensions.
- `PlotLogo` renders that image; `PlotBrandLink` provides the home link. Landing, app themes, public channel, navigation previews and catalog use these components.
- `PreviewHeader` supplies the repeated header in the app, detail and background comparison pages. Resolution and payout previews also use the shared logo.
- `AuthLayout` provides the shared structure for viewer and streamer onboarding.
- `useBettingMode`, `BettingModeLabel` and `BettingModeNotice` select units from the active transport. A failed status request does not claim a currency.
- `<plot-brand>` supplies the same artwork on static support and waitlist pages. Their HTML image remains visible without JavaScript.
- The catalog uses the existing `BalloonWordmark` animation instead of drawing a separate wordmark.
- The native app has a shared native `PlotLogo`. The web build synchronizes its artwork and launcher icon from the canonical public assets. Its palette and system bars now use the dark theme.

## Preview

The persistent `plot-brand-preview` user service runs this worktree with Portless.
VPN preview: `http://100.69.138.52:8081/onboarding?streamer=1`.
The main preview stays on port 8080. Each server uses a separate data directory.

## Verification

The web brand suite covers 19 surfaces at 360 and 700 CSS pixels, image loading, clipping, obsolete wordmarks, static rendering without JavaScript and transport-specific units. Authentication, streamer onboarding, app, catalog, navigation, landing and betting suites provide regression coverage.

Native typecheck, lint and Android bundle export passed. Native device E2E remains unavailable on this host: Android SDK/adb, Java and a configured emulator/device are absent. No native device execution is claimed.

Keep this worktree for review; no push, merge or worktree removal is part of this change request.

### Final evidence

- `npm run check`: typecheck, lint and build passed; 92 tests passed, 13 staging-dependent tests skipped.
- Main web regression group: 46 E2E passed.
- Byte and public-channel group: 18 E2E passed.
- Extended brand, backgrounds, details, user app and resolution group: 36 E2E passed. Some cases overlap the main group; these are execution-group counts, not unique-test totals.
- The canonical brand matrix covers all 19 listed surfaces at 360 and 700 px, including app/detail/background comparison pages and resolution/payout previews.
- `npm --prefix mobile run check` passed; Expo Android export completed at `/tmp/plot-brand-native-export`.
- Native E2E preflight confirmed the missing adb/Android SDK and configured device/emulator. No native device execution was performed.
- Both persistent preview services respond: main on VPN port 8080, this branch on port 8081.

## Mobile Phantom handoff follow-up

Both onboardings now use a shared `PhantomHandoff` link. Mobile browsers open the public onboarding role inside Phantom using its browse universal link; desktop keeps the extension download path. OAuth tickets, arbitrary query parameters and extension pairing fragments are not copied to Phantom. An injected wallet connects directly.

The VPN IP entry at port 8081 redirects onboarding to `https://plot-dev.tailfb789f.ts.net:8443`, preserving the streamer query. Tailscale Serve supplies a publicly trusted certificate within the tailnet. The server only adds its explicitly configured AUTH_ORIGIN hostname to the local host allowlist. A host-local `/etc/hosts` entry resolves this preview's own MagicDNS name; other tailnet clients use MagicDNS.

The preview now runs as `plot-wallet-preview`; `plot-brand-preview` was stopped. Main remains on port 8080. The same branch data directory is retained.

Checks: 93 unit tests passed, 13 staging-dependent tests skipped; typecheck, lint and build passed. 15 onboarding/auth/brand/mobile handoff E2E passed, plus 9 public-channel E2E. A separate Chromium smoke check followed the actual IP-to-HTTPS redirect and confirmed a secure context, `streamer=1` preservation, and the correct Phantom destination. Native app launch on a physical phone is not claimed; the E2E intercepts the external universal link.

## Twitch callback investigation

A live authenticated request to `/api/twitch/start` on the secure preview generated `https://plot-dev.tailfb789f.ts.net:8443/auth/twitch/callback`; its redirect URI contained no localhost. Both preview config endpoints also report that secure origin. The user's reported return to localhost is consistent with a registered-redirect mismatch, but the registration list could not be inspected: Twitch Developers redirected this browser to its login page. Anonymous requests to Twitch's authorize endpoint only reached Twitch login, so they do not prove callback registration. The app owner must verify/add the exact secure callback under OAuth Redirect URLs without deleting other environments' callbacks. Provider-mocked E2E tests do not validate Twitch Developer Console settings.

## Local bot onboarding follow-up (2026-11-09)

Continued the same authorized preview integration in `unify-brand-ui`, worktree `/home/meeting/projects/twitch-predict.unify-brand-ui`, base `a14d3fd`. The local server lacked all bot routes, so user requests fell through to the bridge authorization middleware and returned 401. Added bot OAuth/status/disable/webhook routes before that middleware, using the existing bot service with atomic local bot documents and the server's existing Points instance. Added a non-overlapping bot sync loop. The onboarding now displays status errors and missing configuration rather than hiding them behind a disabled button.

Validation: `npm run check` passed (94 pass, 13 external staging skips, zero failures; typecheck, lint, build passed). The E2E regression covers wallet login, Twitch identity, bot authorization/enable, persistence across reload, disable, and visible failed status. Preview service restarted; removed an empty stale Portless route lock left by stopping the process. HTTPS bot status returns 200 with configured=true and available=false; VPN IP entry redirects to the secure onboarding and returns 200. No credentials were changed. The bot account itself still requires authorization; real EventSub delivery also requires a webhook reachable by Twitch, which the private VPN preview does not provide. Worktree retained, no commit/push/merge.
Final E2E rerun after build: 16/16 passed (`/tmp/plot-local-bot-e2e-green.log`). Dia task confirmed Twitch saved the bot callback and retained all five previous URLs (six total after reload).

## Twitch grant recovery and live webhook (2026-11-09)

A direct, read-only Twitch Get Authorization By User audit confirmed both ramitapai (`channel:bot`) and plotfun (`user:bot`, `user:read:chat`, `user:write:chat`) had already authorized this client. The preview's empty local bot marker caused a false unavailable result. The bot service now recovers that marker from Twitch's authoritative grant query when missing, validating bot login, user ID, and every required scope. Startup sync uses the same recovery, with concurrent discovery coalesced and retries throttled.

Added a separate optional webhook origin; OAuth continues using the private secure preview. Tailscale Funnel on HTTPS 10000 exposes only `/api/twitch/bot/webhook` to the existing local handler, with root and `/api/health` returning 404 and unsigned webhook posts returning 403. Existing VPN preview routes are preserved. User service overrides configure the webhook origin and replace its fragile inline shell command with a private launcher that injects the existing vault environment without exposing values.

Verification: five new recovery tests cover successful startup restoration, each missing bot scope, and an unrelated user's grant. `npm run check` passed (99 pass, 13 staging skips; typecheck/lint/build pass). Work remains uncommitted in the existing authorized worktree.
Final live validation: the initial Tailscale Funnel hostname was not published in external DNS (NXDOMAIN), so its pending subscription could not verify. Replaced it with a temporary official Cloudflare Quick Tunnel (`plot-bot-webhook-tunnel` user service), targeting the same path-only Tailscale Serve listener on 443; disabled the experimental Funnel. The private onboarding stays on VPN port 8443. Temporary webhook origin: https://sponsors-poly-noble-empire.trycloudflare.com. Public root and health return 404; unsigned POST to the webhook returns 403. Only the obsolete preview subscription for ramitapai at the private hostname is cleaned up; existing production subscriptions are preserved.

LIVE SUCCESS: local runtime for ramitapai reports phase=connected, and the welcome outbox delivery reports sent (Twitch Send Chat Message acknowledged is_sent=true). No new bot login or streamer authorization was required. E2E: 13/13 pass (`/tmp/plot-bot-recovery-e2e.log`). Quick Tunnel hostname lasts for this running tunnel only and is a development dependency, not a production deployment. Source changes remain on unify-brand-ui, no push or merge.
