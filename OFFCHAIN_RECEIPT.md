# Offchain points POC

Source repository: /Users/ramiro/.t3/projects/twitch-predict
Source branch: feat/extension-market-view, commit dd0ec33.
Worktrunk branch: feat/offchain-points.
Worktree: /Users/ramiro/.t3/projects/twitch-predict.feat-offchain-points.
State: in progress; preserved for resumption. No merge or cleanup performed.

Scope: native popup width 700px; automatic Twitch market mirrors; own centralized points, anonymous persistent accounts, betting, source resolution, claims, client UI. Solana retained as an optional legacy mode, outside this phase.

Implementation:
- Default server: offchain. Legacy chain server and static UI preserved behind MARKET_MODE=solana.
- Points engine: 10,000 initial points/account, separate authenticated anonymous sessions, atomic serialized snapshots, ledger, request idempotency, stake validation, independent pools, integer pari-mutuel settlement, claim and refund.
- Verified Twitch source: channel watch, source freshness cutoff, server polling of original prediction IDs through resolution, no consumer-provided live winner.
- UI: extension and dashboard show internal balance, independent pools, stake amount/presets, both option buttons, position, history and claim. Twitch counts are secondary reference data. Dashboard supports watching channels and demonstrator-only manual resolution.
- Width: native popup 700px, down from 780 (10.26% reduction), root and body fixed without changing browser bounds. Balance stays visible in header.
- Runtime data/dependencies reused via ignored symlinks to the existing POC. Chain records and keys untouched; new state is points.json.

Validation:
- npm run check: typecheck, lint, 17 unit tests, build PASS.
- npx playwright test: 4 relevant E2E PASS in 14.3s. Four legacy chain tests skipped explicitly because MARKET_MODE is offchain, not because of an external blocker.
- E2E covers two accounts with 300/700 stakes and 1,000-point winner payout, duplicate claim rejection, refund, reload, real MV3 detection/mirroring/own-points bet, source disappearance, server-only terminal resolution, reopen and claim, and native popup 700px without host resize.
- git diff --check PASS. Visual review of test-results/offchain-extension.png and offchain-dashboard.png performed. Initial E2E shutdown left its Portless child alive; that owned child was closed and graceful shutdown corrected. Final suite starts/stops cleanly.

Final UI refinement requested by user:
- Official shadcn/ui new-york-v4 Button/Input/Badge source adapted with local imports, MIT license retained. React 18 + Tailwind bundled locally for both shells; no remote JS/font requirement. Inter variable font and OFL included. Dependencies installed into this worktree's own node_modules, replacing only its ignored dependency symlink.
- Taste Skill installed project-locally in .agents/skills/taste-skill. Style true-black-flat, seed 554067584; design and source details in DESIGN.md. API access to Taste Labs could not be established (no credential and two login preview snapshot timeouts); public reference material used, no API invocation/score claimed.
- Functional navigation: markets, personal bets, channel/pairing operator view. Existing points ledger and sessions preserved.
- Final checks: npm run check PASS (17 unit tests, typecheck, lint, build). All 5 offchain/MV3/native-popup E2E PASS in 16.8s; 4 legacy chain E2E explicitly excluded by mode. Native width remains 700px. Taste source lint 0 FAIL/0 WARN and rendered audit 0 FAIL/0 WARN at all three widths. git diff --check PASS.
- Persistent launchd bridge now uses this worktree at http://twitch-predict.localhost:1356, network offchain. A demo market was created through the real operator UI, with no fabricated user bets. War Thunder channel watching configured. The existing Chrome for Testing profile is reused; live data and chain receipts remain untouched.
