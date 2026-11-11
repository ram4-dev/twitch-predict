# Use the established resolution card for completed streamer markets

Source repository /home/meeting/projects/twitch-predict, branch streamer-card-footer-cleanup at 89ae702. Fresh Worktrunk branch streamer-resolution-cards, /home/meeting/projects/twitch-predict.streamer-resolution-cards. Prior worktrees and user preview retained during verification.

User asked to replace the completed market card with the resolution card already designed. Reuse src/ui/components/resolution.tsx, its selected count material, styles and reduced-motion behavior. No new design direction or mock showcase import.

Open/locked markets retain UserMarketCard and existing management actions. Resolved/void markets switch to Resolution with real title, channel, outcomes, winner and cancellation status. Real account bets drive stake, total payout, net and hit; an owner without a stake stays spectator. Historical unclaimed winnings keep a manual claim action, using the existing endpoint and stable intent. New streamer bets remain blocked.

Primary checks: transition to resolution component, no betting/management option buttons after settlement, expand/collapse details, cancellation variant, spectator zero-stake behavior, historical stake/payout/net and manual claim, 700 x 600 and 360 compact layouts. Retain the same HTTPS preview/data and Portless backend port 4620 after verification.

## Validation and visual review

- Typecheck, lint, build and 164 unit tests passed (13 skipped).
- 12 distinct E2E scenarios passed: 10 resolution/manager/OAuth cases plus bot onboarding and signed-chat creation/bet/resolve/claim. The manager suite was repeated after making its historical-stake scenario independent of the shared demo owner: 4/4 passed.
- The historical test stakes as a viewer first, then registers the same Twitch channel on that account through OAuth; it confirms 100 pts stake, 300 pts total payout, +200 pts net and a manual claim to balance 10,200 pts. No streamer places a new stake.
- Final spectator and historical-personal screenshots at 700 x 600 and 360 copied to .taste-skill/after and opened. The established count card fits compact width without overflow, uses actual amounts, and keeps detail and claim controls accessible. No new styles or invented financial figures.

## Bot operation check requested during this task

The live preview's public EventSub webhook still proxied to inactive port 14622. Repointed only /api/twitch/bot/webhook on the existing public Funnel to backend 4620, preserving the other paths and restoring Funnel's public status after the Serve edit. Backend port 4620 is already fixed by Portless for this user service.

Live checks: app authentication succeeded; plotfun has user:bot, user:read:chat and user:write:chat grants; Twitch reports the channel.chat.message subscription enabled at the expected callback. A correctly signed webhook verification challenge returned 200 with the exact challenge, while an unsigned request was rejected with 403. Runtime reports connected and no pending outbox jobs. No test chat message was broadcast and historical failed messages were not replayed. Local signed-chat E2E passed with fixtures.

Delivery: update existing PR #58; point the existing preview service at this worktree. Preserve user data and credentials via vault-env; no secrets read or printed. Stop isolated test launcher only, leave user preview running and retain worktree for resumption.
