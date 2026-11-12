# Proposal cards: third layout, direct publication

Source repository/worktree: /home/meeting/projects/twitch-predict.streamer-earnings-card.
Source branch/commit: streamer-earnings-card, 7fcc967.
Fresh Worktrunk branch: proposals-third-layout.
Worktree: /home/meeting/projects/twitch-predict.proposals-third-layout.
Keep for review/resumption and preserve existing user previews until verification.

Use the approved third composition with real Fraunces/Inter typography, shared Button/Badge controls, visible option panels and duration/date metadata. Pending is amber, accepted green, rejected red and withdrawn neutral. Reuse outcome-frame-rim and outcome-rim-turn from the existing detail cards for hover/keyboard border animation, with reduced-motion fallback. Accept and publish remains a direct action without a review dialog; retain error recovery and guard repeated activation during an in-flight action.

Validation: `npm run check` passed (typecheck, lint, build and 195 unit tests: 180 passed, 15 skipped). The relevant E2E run passed all 10 tests covering proposal intake from chat, actual single-click publication, replay guards, rejection, manager screens, state colors and responsive layouts. After the final date and odd-option layout adjustments, typecheck/lint/build, all 4 proposal UI unit tests, and the focused layout E2E passed again. Verified screenshots at 360, 700 and 1440 px; reduced motion disables the border animation. Evidence is retained under artifacts/proposals-third-layout (ignored).

Preview activated at https://plot-dev.tailfb789f.ts.net:8444/app#markets using plot-streamer-manager-preview.service. Only its WorkingDirectory override changed; data, credentials and routing were preserved. Service active/running, app HTTP 200, and both deployed mobile-app.js and mobile-app.css SHA-256 match the verified build (implementation 30d5442). No push or merge requested.
