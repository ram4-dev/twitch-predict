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

Keep this branch/worktree for review and resumption. Main and existing user previews remain unchanged. The isolated E2E server was managed by Playwright; no persistent preview or unrelated pane was opened. No merge, push or deployment was performed.

