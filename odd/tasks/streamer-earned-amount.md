# Streamer per-market earned amount

Source: /home/meeting/projects/twitch-predict.concise-settlement-ui, branch concise-settlement-ui, commit deee826.
Fresh Worktrunk branch: streamer-earned-amount.
Worktree: /home/meeting/projects/twitch-predict.streamer-earned-amount.
Keep for review/resumption; no push or merge requested.

Restore only the streamer's earned amount on each finished manager card, with the short label Ganaste and explicit pts. Use persisted per-market settlement fees, falling back to actual streamer_fee ledger entries for that market; void earns zero. Keep the concise confirmation and user cards without fee breakdowns.

Changed src/ui/streamer-manager.tsx, public/mobile-app.css and rebuilt public/mobile-app.js. Added a manager-only Ganaste amount, using persisted market fees or actual per-market streamer_fee entries, never the aggregate earnings. Voided markets show zero. Labels are 16px, figures 36–48px and explicit pts; the streamlined confirmation and fee-free user cards stay as requested.

Validation: npm run check passed after correcting the new ledger fixture typing (195 tests: 180 passed, 15 skipped; typecheck/lint/build passed). Relevant E2E coverage completed all 12 selected cases across runs: the initial process was interrupted with exit 143 after five passing manager cases; the owned isolated fixture was stopped, then the five remaining manager/material/state cases passed in a shorter run, and both web resolution cases passed separately. Verified actual settlement earnings and reload persistence, missing fee metadata with per-market ledger fallback, exclusion of other markets and duplicate counting, zero on void/unknown records, unchanged claims/net/payout, and absence of earnings from user cards. Reviewed screenshots at 360/700/1440 px; figures >=36px and no card overflow. Logs and screenshots retained under ignored artifacts/streamer-earned-amount.

Preview activated at https://plot-dev.tailfb789f.ts.net:8444/app#markets (implementation ea26251). Only the existing preview service WorkingDirectory changed; data, credentials, routes and origins preserved. Service active/running; app HTTP 200; deployed mobile-app.js and mobile-app.css SHA-256 match the verified build. Worktree retained for review/resumption.
