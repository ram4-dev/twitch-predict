# State-first results in the streamer console

Source: /home/meeting/projects/twitch-predict.streamer-state-first-cards, branch streamer-state-first-cards at 043a16c.
Implementation branch: streamer-result-state.
Worktree: /home/meeting/projects/twitch-predict.streamer-result-state.
Created with Worktrunk and fast-forwarded to the required prior implementation before editing; keep for resumption.

The user still saw the old cards on the preview because every visible market was already finished: public API inspection found 2 resolved and 6 void markets. The previous state-first change only covered open/locked markets. Extend the approved state panel to finished streamer markets via a manager-only result-content slot in the shared Resolution component. Show the confirmed winner prominently in green, the losing options in red, or an amber annulment with the existing reason. Preserve fees, account receipts and claim behavior; default viewer/extension cards retain their existing result presentation.

## Verification

- npm run check passed: typecheck, ESLint, production build and 195 unit/integration tests (180 passed, 15 skipped, zero failures). Final typecheck/lint also passed after the test additions.
- All 12 E2E scenarios passed: streamer-manager (6), streamer state (2), popup-resolution (2) and resolution showcase (2).
- Verified both resolved and void states, confirmed winner/loser text and colors, large result typography, absence of old compact result, absence of management actions after settlement, retained reason, historical stakes/claims/fees and unchanged extension defaults.
- Opened final screenshots for both finished states at 360, 700 and 1440 px. Retained local screenshots and logs under artifacts/streamer-result-state/.

## Live preview activation

After verification, updated the existing 90-streamer-state-first.conf drop-in for plot-streamer-manager-preview.service to this worktree and restarted only that service. The data directory, vault-env secret injection, authentication origin, Portless backend and HTTPS URL remain unchanged. The service is active with zero restarts.

Verified https://plot-dev.tailfb789f.ts.net:8444 through the T3 browser: health, JS and CSS returned 200; the finished-state labels/styles were present; JS and CSS SHA-256 matched the verified local build exactly. The browser profile has no signed-in account, so authenticated visual validation is supplied by the E2E tests and reviewed screenshots above. The check tab was closed after verification.

Preview runs from this worktree. Retain it; leave main and unrelated user work untouched. Implementation commit: 6f74d8a. No merge or push was performed.
