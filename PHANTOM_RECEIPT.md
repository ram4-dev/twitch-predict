# Phantom onboarding

Source: /Users/ramiro/.t3/projects/twitch-predict.feat-offchain-points, branch feat/offchain-points, commit 19e58bc.
Worktrunk worktree: /Users/ramiro/.t3/projects/twitch-predict.feat-phantom-onboarding.
Branch: feat/phantom-onboarding. State: in progress, preserved; no merge or cleanup.
Scope: install extension → connect Phantom on an onboarding page → automatic shared-account extension linking → dashboard. Preserve prior extension points when binding a new wallet. Keep offchain betting and 700px popup.

Implemented:
- Stable extension ID cgfbdbllmfmnjjdloolgoglickdhpohi (public manifest key, no private signing key persisted), version 0.4.0.
- Installation opens onboarding; popup has Connect Phantom; successful login automatically links the extension and navigates to /#markets. No manual ID/pair form in consumer UI.
- Server-generated domain/URI/nonce/expiry message, Ed25519 proof, one-use challenges, 30-minute installation flow and five-minute proof/handoff window; private extension state and one-use handoff code bound to origin and extension ID.
- One wallet identity with multiple hashed sessions; migration binds an existing extension anonymous account only for a new wallet, preserving ID/history/balance without a second welcome grant. Existing wallet accounts are reused without merging anonymous balances. Old anonymous credential is invalid once bound.
- Production uses one writer through existing HTTP Portless route; isolated trusted TLS proxy in data/portless-auth on 1357, with an alias to that backend refreshed at startup. Other projects' proxy remains unchanged. OS CA trust provisioning succeeded; Portless doctor reports 0 failures/0 warnings.
- Launcher supports opaque one-time migration from previous extension storage; allows an already installed Phantom package without reading its wallet storage, and opens onboarding for an unauthenticated profile.

Validation:
- Typecheck/lint/build and 21 unit tests pass.
- 8 relevant E2E pass; four legacy Solana E2E skipped by mode. Tests cover real signature verification with a controlled wallet provider, extension installation and linking, same-wallet account from another browser, no second starter grant, balance/history shared, cancel/missing wallet/forged signature, source mirroring/resolution/claims and native popup width with unchanged browser bounds.
- Initial onboarding sendFile failed under the hidden .t3 root; resolved with an explicit static root. A mirror E2E selected an older onboarding tab; the fixture now uses the isolated deployment URL and actual install-created onboarding. Final suite passes without timeout increases. One overlapping rerun was rejected by the occupied test URL and was not counted as a pass.
- Screenshots phantom-canceled.png and phantom-linked-dashboard.png visually reviewed. No real Phantom signature was performed: Phantom is absent from the dedicated testing profile; the onboarding shows its official installation link. Never accessed seed phrases/private wallet keys.

Runtime delivery:
- Launchd bridge moved to this worktree with AUTH_ORIGIN=https://twitch-predict.localhost:1357 and isolated TLS alias configuration. HTTPS certificate validation, health/config, HTTP onboarding redirect and exact signed domain/URI were checked without disabling certificate checks.
- Previous owned Chrome for Testing process was closed; its extension account/cache was transferred programmatically into the stable-ID extension without printing credential values. Existing runtime points data was preserved, not reset or replaced with fixtures.
- New Chrome for Testing profile session opened extension 0.4.0 onboarding successfully. No wallet/session was fabricated in the real runtime. This profile has no Phantom installed; the user must install/connect their own Phantom and approve the login signature. The signed-in dashboard was verified with the controlled-provider E2E, not claimed as a real-wallet completion.
- Final checks: npm run check PASS; 21 unit tests PASS; 8 relevant E2E PASS (25.8s); 4 legacy chain E2E explicitly skipped. git diff --check PASS. Worktree retained for resumption, no merge performed.
