# Streamer manager UI

- Repository: /home/meeting/projects/twitch-predict
- Source branch: main, pulled with --ff-only after Plan 2 integration and push.
- Base: 4b82aaf (same as apply-plan-02 and origin/main at start).
- Branch: streamer-manager-ui
- Worktree: /home/meeting/projects/twitch-predict.streamer-manager-ui
- Worktrunk required Git >= 2.43; compiled Git 2.47.3 under /tmp/streamer-ui-tooling instead of changing system Git.
- Source checkout, other worktrees and preview services preserved.

## Screen inventory and design

- Objects: server-authorized channels, Plot markets, Twitch markets and pending proposals.
- Market fields: phase, title, options, pool in pts, participants and market short code.
- Settlement preview: original stake, total payout and signed net in pts per bet.
- Typical workload: a streamer checking a few simultaneous markets during a broadcast.
- Primary canvas: extension popup 700 x 600; compact width 360 (also checked at 320).
- Question: which market needs a result, and what can I create next?
- First action: create a market from the header; composer opens in place above the list.
- Locked markets sort first; resolved and refunded markets retain explicit result text.
- Signature: exact UserMarketCard component from the active feed, with management actions replacing betting.
- Keep existing brand palette, fonts, option colors and rectangular control corners as explicitly requested.
- No style draw: this is a component extension with an established direction, per taste-skill's component exception.
- One-column market list; at 700: 24 + 652 + 24 = 700; at 360: 16 + 328 + 16 = 360.
- Markets and proposals get separate views; Profile retains account identity and connections.
- Owner eligibility comes from /api/points/me.streamerChannels; the console response scopes data again.
- This does not invent moderator channel discovery: current console APIs expose owned channels.
- Showcases remain read-only; the demo account has no management tab.

## Behavior and checks

- Creating and closing reload the console immediately.
- Choose the winning option on the shared card, fetch the settlement preview, then confirm.
- Cancellation also previews and confirms refunds; backend requires closed betting first.
- Request IDs survive retries, avoiding duplicate creation/action intents after a lost response.
- Proposals use the session bearer and have explicit loading, error and retry states.
- Composer duration matches the current prediction schema's 30-1800 seconds constraint.
- Account refresh requests coalesce instead of dropping a refresh requested while another is in flight.

Verification results and final commit are recorded below once checks finish.

## Visual review

Before screenshots show account connections, the composer, the inbox and plain market rows in one Profile screen. After: Profile contains the identity and connections; Streamer has an aligned header, a create control, two workspace views and the existing feed cards.

- Question and hierarchy: channel scope and create action first; locked markets first in the list.
- Frame: single column, equal 16px compact / 24px popup gutters; no horizontal overflow at 320, 360 and 700.
- Color and face: existing Plot wordmark, warm neutrals and option identities retained. No new direction or redraw.
- Numbers: existing market data drives pool/share; preview uses the backend's stake/payout/net, with explicit pts units.
- Zero/missing: real empty market/inbox messages; no fabricated metrics; public showcases keep example balances.
- Labels/encoding: selection is aria-pressed; resolved winner/losers and refunds are named in text.
- Compact use: three navigation destinations remain legible; touch targets >=44px; no hover requirement; reduced motion checked.

Three changes from the first visual pass: removed a redundant summary row, shortened the winner instruction, and tightened workspace gaps so the initial management controls fit 700 x 600. Enlarged the refresh glyph to 17px.

Inspector: 0 FAIL / 0 WARN at 1440, 768, 700, 390, 360. It inspects a captured production DOM with styles, fonts and logo inlined so the CDP browser has no cross-origin asset dependency. The stored navigation underline is static when this diagnostic copy is resized; actual responsive navigation is checked in the live Playwright suites.

Explicit inspector allowances preserve the requested existing brand: gradient and button-fx for shared liquid-metal controls; palette-cream for warm text on the dark background; heavy-borders for the shared amber card rims (the meter ignores their alpha). These are existing shared assets, not a new style. Screenshots under .taste-skill/after/inspect were all opened. Live captures: .taste-skill/after/profile-700.png and profile-360.png; settlement captures: test-results/manager-preview-{700,360,320}.png.

## Verification

- 162 passed unit tests, 13 intentionally skipped, zero failures (175 total).
- 19 E2E passed: mobile-app-v2, twitch-auth, settlement and the three new streamer-manager flows.
- 11 additional regression E2E passed: market-detail and mobile-responsive.
- Streamer-manager repeated after adding lost-response coverage: verifies retry uses the same intention and creates one market; resolve/refund/owner disconnect/error recovery.
- Typecheck and lint passed; build includes generated public/mobile-app.js and public/consoles.js.
- Removed an unconditional debug write in offchain-server: closing/resolving previously failed when .e2e-fixtures did not exist. No fixture directory is required by the new server.
- No real Twitch, Google or wallet credentials used in E2E; local auth fixtures and signed ephemeral test wallets only.
- No new dependencies added.

Final state: 30 distinct relevant E2E scenarios passed across the suites above; the final manager-only run is 3/3 including lost-response retry. Worktree and visual evidence retained for resumption. Temporary E2E server/proxy is stopped after verification; unrelated preview services are left running. Changes are committed on streamer-manager-ui and submitted as a draft PR; no merge or deployment of this new UI is implied by Plan 2's prior merge.
