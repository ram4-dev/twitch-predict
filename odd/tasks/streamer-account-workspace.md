# Streamer account workspace follow-up

Repository: /home/meeting/projects/twitch-predict. Source branch streamer-manager-ui at 8eba805. Fresh Worktrunk branch streamer-account-workspace at /home/meeting/projects/twitch-predict.streamer-account-workspace. Preserve the existing preview and its data until verification completes.

User request: remove the bottom cancellation/refund sentence; put the streamer workspace under Mis apuestas; remove Activas/Mis jugadas for registered streamer accounts; do not let streamers bet.

Reuse the existing card, compositor, proposals and settlement preview components. Navigation has only Mis apuestas and Mi perfil. Server-owned channel registrations determine the account mode; linking a walletless Twitch viewer does not register a channel. Old history/market/streamer links cannot show betting controls for streamer accounts. The upper Reembolsado state remains; the redundant sentence below the options is removed.

Use the same managedChannels helper for me(), console authorization and betting eligibility. New debits are blocked in HTTP bet, linked chatBet and !plot apostar dispatch; existing request receipts replay without a second debit, and claim/refund paths remain available for historical stakes.

Primary viewport 700 x 600, compact 360 and 320. No new design direction: extend the existing screen and retain shared card dimensions, option colors and rectangular buttons. The streamer workspace replaces the consumer list in the same content area, so the prior three-column navigation CSS is obsolete.

## Verification and visual review

- Typecheck, lint and build passed.
- 164 unit tests passed, 13 skipped (177 total), no failures. New checks cover streamer rejection on own/other markets, both chat entrypoints, no debit on rejection, linked viewer eligibility and replay of historical receipts without a second debit.
- 28 distinct E2E scenarios verified across streamer-manager, mobile-app-v2, market-detail, settlement, twitch-auth and twitch-plot-chat. The first combined run had 26 pass / 2 fail. The Twitch-result test was updated to stake from a separate viewer (a no-stake market legitimately refunds instead of resolving); the public-channel test needed its Byte fixture moved outside Playwright's wiped test-results directory in the temporary launcher. The final Twitch suites passed 5/5, including both failures. No application behavior was weakened to satisfy tests.
- E2E proves no Activas/Mis jugadas/search/bet controls for a streamer, HTTP rejection of a forged new bet, old market/history links opening management, refund text removal, viewer refund conservation and viewer UI restored after unlinking Twitch.
- Live screenshots: .taste-skill/after/workspace-{700,360}.png and test-results/manager-preview-{700,360,320}.png.
- Inspector passed 0 FAIL / 0 WARN at 1440, 768, 700, 390, 360 after a startup timeout retry. All final screenshots opened. Production DOM captured with local fonts/styles/logo inlined; static captured indicator geometry is not a substitute for the live responsive checks.
- Existing brand allowances retained: gradient/button-fx for the shared controls, palette-cream for warm text, heavy-borders for shared translucent rims. No new style draw or palette.
- Critique: one clear account-specific question under Mis apuestas; balanced existing gutters; no new figures or changed totals; explicit upper Reembolsado state; cancellation card closes immediately after its options; two navigation labels remain readable on compact screens. No extra visual correction needed beyond removing the obsolete third-column navigation rules.

## Delivery and resumption

Keep this worktree. Update the existing PR #58 from this dependent branch and rewrite its title/description to the final account-specific behavior. Preview runs via plot-streamer-manager-preview.service from this worktree with the same data directory and HTTPS origin; the service now has a durable user unit and a launch script, with secrets injected by vault-env. Portless keeps backend port 4620 stable for the existing Tailscale proxy. Stop the isolated test launcher/proxy after checks; leave the user preview running. No merge to main requested for this follow-up.
