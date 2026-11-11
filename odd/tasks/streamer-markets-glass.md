# Streamer Markets: apply the shared glass treatment to every phase

Source: /home/meeting/projects/twitch-predict.proposals-market-glass, branch proposals-market-glass, commit 58ade9a.
Worktrunk branch: streamer-markets-glass.
Worktree: /home/meeting/projects/twitch-predict.streamer-markets-glass.
Keep worktree for review/resumption; no push or merge requested.

Resolved and void cards still used the solid Resolution/count shell, and manager actions used secondary/ghost variants. Apply the real PhoneGlass shell to finished markets as well, reuse the liquid-metal frame for the prominent market state and real Button materials for management actions. Keep stake/payout/net, earnings, lifecycle, settlement confirmation and permissions intact. Existing user-requested materials take precedence over generic design-skill restrictions.

Changed src/ui/streamer-manager.tsx, src/ui/components/streamer-market-state.tsx, src/ui/components/user-market-card.tsx, public/mobile-app.css and the rebuilt public/mobile-app.js. Finished markets now wrap Resolution/count in the actual PhoneGlass surface; the inner Resolution surface is transparent only in this manager wrapper. Result/state panels share LiquidMetalSurface and liquid-metal-frame, and management action buttons use the actual app materials. Open/selected/resolved frames are green, locked/void frames amber. The viewer/extension resolution rendering retains its existing shell. Stake, payout, net, streamer earnings, permissions and confirmations are preserved.

Validation: npm run check passed: typecheck, lint, build and 195 unit tests (180 passed, 15 skipped). Final typecheck/lint passed with the new E2E. All 12 relevant E2E passed: proposal material equality, real manager create/lock/resolve/cancel/claim/revenue flow, state-first cards, web history/detail resolution, and all four market phases. The four-phase material test compares actual glass settings against Proposals, checks frames/actions, disabled outcomes, zero writes, reduced motion, and no overflow at 360/700/1440 px. After the final void-reason spacing adjustment, that focused E2E passed again. Reviewed final screenshots at 360/700/1440 px. Logs and screenshots retained under ignored artifacts/streamer-markets-glass.

Preview activation pending. Worktree retained for review/resumption.
