# Streamer proposal inbox: newest pending first

Source: /home/meeting/projects/twitch-predict.streamer-markets-glass, branch streamer-markets-glass, commit 64179e5.
Fresh Worktrunk branch: proposals-pending-newest.
Worktree: /home/meeting/projects/twitch-predict.proposals-pending-newest.
Keep for review/resumption. No push or merge requested.

Render only pending proposals in the streamer inbox, sorted by creation time descending. Remove a successfully accepted/rejected proposal immediately, even if the subsequent refresh fails; failed actions keep the proposal available. Preserve persisted records and the author's history.

Changed src/ui/proposals-ui.tsx and rebuilt public/mobile-app.js / public/consoles.js. The streamer inbox renders the pending subset sorted by createdAt descending, with a pending-only empty state. Successful actions remove their card locally and invalidate older reads before refreshing. An action failure leaves its card available. Records and the author history stay intact.

Validation: npm run check passed (typecheck, lint, build; 195 tests: 180 passed, 15 skipped). All 11 relevant E2E passed: newest-first initial and polling order; exclusion of accepted/rejected/withdrawn cards; immediate removal on acceptance/rejection; failed acceptance keeps its card; successful acceptance stays removed when refresh fails; recovery, reload and fresh incoming proposals; real single-click publication and replay guards; chat proposal intake; manager lifecycle/revenue and shared materials. No overflow at 360/700/1440 px, reduced-motion behavior retained. Logs and screenshots retained under ignored artifacts/proposals-pending-newest.

Preview activated at https://plot-dev.tailfb789f.ts.net:8444/app#markets (implementation 4f3fc39). Only the existing preview service WorkingDirectory changed; credentials, data, routes and origins preserved. Service active/running; app HTTP 200; deployed mobile-app.js and consoles.js SHA-256 match the verified build. Worktree retained for review/resumption.
