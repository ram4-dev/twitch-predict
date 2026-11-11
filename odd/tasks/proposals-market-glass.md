# Proposal and streamer card material consistency

Source: /home/meeting/projects/twitch-predict.proposals-third-layout, branch proposals-third-layout, commit 950fc44.
Isolated Worktrunk: /home/meeting/projects/twitch-predict.proposals-market-glass, branch proposals-market-glass.
Keep worktree for resumption; no merge or push requested.

Use the actual active-market glass shell, neutral surface, choice colors and liquid-metal assets for proposals and streamer choices. Preserve direct Accept and publish, readonly choices, authorization and data behavior. Existing app materials explicitly requested by user take precedence over generic design-skill glass/gradient restrictions.

Changed: shared PhoneGlass wrapper used by active markets and proposals; shared liquid-metal frame and palette; matching rectangular option corners; the actual Button material on streamer options, including read-only states; brighter streamer result/status colors. No authorization, transaction or confirmation behavior changed. Rebuilt all tracked shared bundles and styles.

Validation: npm run check passed (typecheck/lint/build, 195 tests: 180 passed, 15 skipped). After final source changes, typecheck and lint passed again; final shared UI unit run: 11 passed. Relevant E2E: all 24 passed, covering actual proposal publication, manager lifecycle/fees, viewer bets/claims, themes, touch and both MV3 resolution suites. After matching rectangular corners, the focused proposal layout E2E passed again. It asserts identical active-market/proposal glass tint, backdrop, outer radius, option radius and metal gradients; direct publication/rejection and retry recovery; no dialog; no overflow at 360/700/1440 px; reduced motion. Visually reviewed final screenshots at all three widths. Logs and screenshots retained under ignored artifacts/proposals-market-glass.

Preview activated at https://plot-dev.tailfb789f.ts.net:8444/app#markets (implementation 6e186f2). Only the existing preview service WorkingDirectory was updated; data, credentials, routes and origins preserved. Service active/running; app HTTP 200; deployed mobile-app.js, mobile-app.css and points-ui.css match verified build SHA-256. Worktree retained for review/resumption.
