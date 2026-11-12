# State-first streamer market cards

Source: /home/meeting/projects/twitch-predict, main at 06cbc9d.
Worktrunk branch: streamer-state-first-cards.
Worktree: /home/meeting/projects/twitch-predict.streamer-state-first-cards.
Retain the worktree for review and resumption; leave unrelated worktrees and previews untouched.

Apply the approved second mockup to the streamer's open/locked management cards. A prominent state panel distinguishes open betting, choosing a winner, a pending selection and externally managed Twitch results. Selection highlights use the same green for any option. Keep the existing preview and final confirmation behavior. Viewer cards and completed resolution cards retain their current components.

## Validation

- Final npm run check passed: typecheck, ESLint, unit/integration tests and production build.
- Unit/integration tests: 195 total, 180 passed, 15 skipped, zero failures.
- Final E2E run: 18 passed (streamer-manager 6, mobile-app-v2 11, state-first 1). Includes real creation, lock, settlement preview, winner confirmation, cancellation/refund, fees, historical account receipts and viewer regression checks.
- New E2E coverage verifies keyboard selection of the second option, green selection independent of option order, no write on selection, explicit pending confirmation, externally managed Twitch results, reduced motion and long option names at 360, 700 and 1440 px.
- Inspected final screenshots at all three widths. Compact options now stack, percentages are omitted from management choices, and the outer management card stays neutral. Existing pool metadata and final confirmation remain available.
- Screenshots and verification logs are retained locally under artifacts/streamer-state-first/ (ignored evidence).

## Delivery

Keep this branch/worktree for review and resumption. Main remains unchanged. The isolated E2E server was managed by Playwright. No merge or push was performed.

## Preview activation - 2026-11-11

The user reported that https://plot-dev.tailfb789f.ts.net:8444/app#markets still showed the prior interface. The live plot-streamer-manager-preview.service was running from main at /home/meeting/projects/twitch-predict, while implementation commit 9934cf7 was isolated in this worktree.

Added /home/meeting/.config/systemd/user/plot-streamer-manager-preview.service.d/90-streamer-state-first.conf with WorkingDirectory=/home/meeting/projects/twitch-predict.streamer-state-first-cards, reloaded the user systemd configuration and restarted only that preview service. Existing vault-env injection, shared data directory, authentication origin, Portless name/backend port and Tailscale URL remain unchanged.

Verified the public URL through the T3 browser: health, mobile-app.js and mobile-app.css returned 200. Public JS and CSS SHA-256 matched this worktree's files exactly. The new state-panel class and pending-confirmation label are present. The browser profile used for verification was signed out, so authenticated visual behavior relies on the completed E2E validation above. The check tab was closed. The preview service remains running from this worktree; preserve it for the user.

