# Streamer earnings and proposal UI samples

Source: /home/meeting/projects/twitch-predict.streamer-result-state, streamer-result-state at bbe91f8.
Worktrunk branch: streamer-earnings-card.
Worktree: /home/meeting/projects/twitch-predict.streamer-earnings-card.
Keep for review/resumption; preserve the existing HTTPS preview and data.

Replace empty personal-result copy on the streamer's finished cards with Ganancia del streamer and an explicit points amount. Use the market's persisted streamer fee, with recorded account ledger credits as fallback. Voided markets show zero. Historical markets without fees or recorded credits show zero, never a newly calculated percentage. Preserve real historical stake/payout/net and claim behavior. Suppress the legacy commission note only on this management surface; viewer/extension defaults retain their copy.

Prepare three independent proposal-card mockups in /tmp/plot-proposal-options/index.html for inline comparison: direct card, compact detail and review-before-publication. These are examples, not live mutations or an implementation of the proposal section.

## Verification

Typecheck, ESLint and build completed without errors. Unit/integration suite: 195 tests, 180 passed, 15 skipped. The check launcher returned signal 143 after the complete build output; full stage output is retained. E2E runner returned success with 10 tests passed (manager 6, state cards 2, popup 2). Real UI/backend scenarios verified persisted gains of 2 and 20 points, retained personal stake/payout/net and claim behavior. Legacy and void fixtures verify zero and absence of all three removed texts. Opened final screenshots at 360, 700 and 1440 px; evidence is in artifacts/streamer-earnings/.

Proposal mockups were inspected at 360/728 px and browser-tested for responsive widths, acceptance/rejection, review/back/confirmation and reset. They do not send backend requests.

## Preview activation

Updated the existing plot-streamer-manager-preview.service drop-in to WorkingDirectory=/home/meeting/projects/twitch-predict.streamer-earnings-card and restarted only that service. Preserve its existing data directory, vault-env injection, origin and Portless/Tailscale routing. The public HTTPS preview health, JS and CSS returned 200; browser-computed asset SHA-256 values matched this worktree's verified build exactly. The browser profile used for the probe was signed out; authenticated rendering and financial scenarios are covered by E2E above. Closed the check tab afterward.

Implementation commit: d609153. Retain this worktree and the running preview. Main remains unchanged; no merge or push was performed.
