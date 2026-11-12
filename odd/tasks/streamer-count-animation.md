# Shared counting animation for streamer amounts

Source: /home/meeting/projects/twitch-predict.card-click-market, branch card-click-market, commit ba6968d.
Fresh Worktrunk branch: streamer-count-animation.
Worktree: /home/meeting/projects/twitch-predict.streamer-count-animation.
Keep for review/resumption; no push or merge requested.

Reuse CountingAmount for per-market Ganaste and both settlement confirmation figures, with unsigned integer points. Preserve the existing ease, timing, arrival animation, value-change-only replay and reduced-motion behavior. Expose the final verified value to accessibility while decorative digits animate.

Changed src/ui/streamer-manager.tsx and src/ui/components/settlement-amounts.tsx to reuse CountingAmount with signed=false; added the matching left transform origin for confirmation figures in public/mobile-app.css and rebuilt public/mobile-app.js. The final actual amount remains exposed through an accessible label while animated digits are decorative. No accounting or navigation behavior changed.

Validation: npm run check passed (typecheck/lint/build and 195 unit/integration tests: 180 passed, 15 skipped). Final typecheck/lint passed with updated E2E. All 7 selected E2E passed across the 3 state/animation cases and 4 actual manager lifecycle/confirmation/claim cases. The clock-controlled test proves initial zero, a non-final intermediate value, the exact final value and payout-count-arrival effect; unchanged refreshes preserve the same counter without restarting; reduced-motion reload finishes immediately without the effect. Existing tests verify completion for both confirmation counters, exact fee/payout amounts, refunds, personal receipt and claim behavior. Responsive screenshots at 360/700/1440 for earnings and 320/360/700 for confirmation; figures remain readable without overflow. Logs and screenshots retained under ignored artifacts/streamer-count-animation.

Preview activated at https://plot-dev.tailfb789f.ts.net:8444/app#markets (implementation d02bb6c). Only the existing preview service WorkingDirectory changed; data, credentials, routes and origins preserved. Service active/running; app HTTP 200; deployed mobile-app.js and mobile-app.css SHA-256 match the verified build. Worktree retained for review/resumption.
