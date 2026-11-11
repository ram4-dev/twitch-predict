# Concise settlement confirmation and user cards

Source: /home/meeting/projects/twitch-predict.proposals-pending-newest, branch proposals-pending-newest, commit 492e965.
Fresh Worktrunk branch: concise-settlement-ui.
Worktree: /home/meeting/projects/twitch-predict.concise-settlement-ui.
Keep for resumption; no push or merge requested.

Replace the streamer confirmation's roster, total/count table, headings and prose with two large labeled amounts: streamer share and winners share. For void/cancel, show zero commission and actual total refund, never label a refund as winners' profit. Retain confirm/back controls and all settlement behavior. Remove fee distribution and streamer-earnings blocks from settled cards and user betting/history/detail/extension surfaces. Preserve personal stake, total payout, net and claim actions.

Implemented src/ui/components/settlement-amounts.tsx using actual server preview amounts and the shared liquid-metal frame. The confirmation contains only two large labeled figures and confirm/back controls. The refund case labels the actual refund rather than claiming a winners payout. Removed fee/earnings UI from streamer results, user bet sheet, history, details, shared web/extension resolution and legacy points cards; retained personal stake, total payout, net and claim controls. The fee policy, backend settlement and account ledger are unchanged. Rebuilt tracked shared bundles.

Validation: npm run check passed (typecheck, lint, build; 195 tests: 180 passed, 15 skipped). Final typecheck/lint passed after the test updates. The broad E2E run passed 24 of 25 cases; the MV3 liquid-resolution case hit the global 60-second timeout. Its isolated rerun, with failure tracing enabled and the same 60-second limit, passed in 28.4 seconds. Thus all 25 selected cases passed across the run and focused recheck: themes, user bets/claims, both MV3 resolution modes, proposal inbox, streamer create/lock/resolve/cancel/refund, fee and payout accounting, history/details and responsive materials. Assertions cover the two exact server amounts, absence of removed copy/commission blocks, preserved personal receipt, unchanged actual fee credits and payouts, labels at 16px and figures at least 36px. Visually reviewed confirmation screenshots at 320/360/700px and checked overflow; reduced-motion and compact extension behavior passed. Evidence retained under ignored artifacts/concise-settlement-ui, including the initial timeout.

Preview activation pending. Worktree retained for review/resumption.
