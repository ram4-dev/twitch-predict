# Open the market directly from a resolution card

Source: /home/meeting/projects/twitch-predict.streamer-earned-amount, branch streamer-earned-amount, commit 91d878d.
Fresh Worktrunk branch: card-click-market.
Worktree: /home/meeting/projects/twitch-predict.card-click-market.
Keep for review/resumption; no push or merge requested.

Remove the shared resolution's expand-detail control and the standalone open-market button. History resolution cards use a native stretched title link with the same market URL and normal/modified click behavior as active cards. Keep claim buttons above the link, keyboard focus visible, back navigation/scroll intact, and no recursive navigation link in the detail itself. Preserve outcome/personal receipt and streamer earnings.

Changed shared Resolution to remove the expand button/prose and accept a title link; PointsResolution now uses a native stretched link instead of an open-market button. Extracted the existing marketHref/navigateMarket behavior for reuse by active and resolved cards. The link covers the card content, while buttons and other interactive children stay above it. Focus is drawn inside the card so overflow clipping does not hide it. Detail cards have no recursive navigation link. Personal stake/payout/net and streamer earnings remain.

Validation: npm run check passed: typecheck, lint, build and 195 unit/integration tests (180 passed, 15 skipped). Final typecheck/lint passed after E2E updates. All 17 selected E2E cases passed across focused runs: 3 streamer-state cases, both web resolution cases (touch-enabled at 360/700/1440, body click, Enter, native Ctrl-click new tab, back/scroll restoration, claim error/retry without navigation), 8 active-market/detail cases, 2 responsive resolution gallery cases and both MV3 resolution cases. Initial navigation assertions were corrected to observe a native new tab on BrowserContext rather than Page.popup, and to enter keyboard modality before checking focus-visible. No product failure remained. Source whitespace check passed; generated vendor template literal spaces were left unchanged. Screenshots and logs retained under ignored artifacts/card-click-market.

Preview activation pending. Worktree retained for review/resumption.
