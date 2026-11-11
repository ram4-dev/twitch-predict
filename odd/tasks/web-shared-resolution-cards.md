# Shared web resolution cards

- Source repository: /home/meeting/projects/twitch-predict; branch main; commit 4b82aaf.
- Worktrunk branch: web-shared-resolution-cards.
- Worktree: /home/meeting/projects/twitch-predict.web-shared-resolution-cards.
- Cleanup: retain worktree for review/resumption; source checkout untouched.
- Environment: system Git 2.39.5 is incompatible with Worktrunk. Built temporary Git 2.43.7 under /tmp/plot-git and used it only for this task, without replacing system Git.

Use the extension's selected count resolution component for settled points markets on the web: betting view, personal history, market detail and streamer profile. PointsResolution shares account totals, claim action, credited status and feedback across surfaces. Web outcome text explicitly identifies the winning and losing options. Open/locked cards retain their existing behavior. SOL/BYTE already shares the resolution component.

## Validation

- Typecheck and full ESLint passed; changed E2E files also passed a final targeted lint.
- Unit/integration suite: 175 tests, 162 passed, 13 skipped, zero failures.
- Final build passed. Generated web and extension bundles are included.
- All 29 selected E2E scenarios passed across batches: market-detail (8), mobile-app-v2 (11), points (3), popup-resolution (2), resolution showcase (2), web-resolution (2), console-ui (1).
- Real backend checks cover two accounts staking, settlement, winner claim, loser without a claim, automatic refund, duplicate-claim rejection, and retained totals. Mocked web checks cover claim retry, mixed bets with negative net, large figures, spectator and unauthenticated views, streamer profile and reduced motion.
- Inspected final screenshots at 360, 700 and 1440 px. Fixed the inherited two-column detail receipt and the global white paragraph color that obscured signed result colors. Added assertions for full-width detail and the shared gain color. Screenshots and logs are retained in artifacts/web-resolution/ (ignored local evidence).
- Fresh-worktree fixture setup required creating the ignored .e2e-fixtures directory for the existing console action log. The initial broad E2E process was interrupted, so the remaining suites ran in batches against its owned isolated server. One popup run hit the default 60-second timeout; its complete retry with a 180-second limit passed in 35.5 seconds. No verification blockers remain.

## Delivery

Retain this branch and worktree for review/resumption. Main checkout and any existing previews remain unchanged; no deployment or PR publication was performed. Stop only the isolated E2E launcher opened by this task after verification. Temporary Git is available at /tmp/plot-git/bin/git if Worktrunk is needed again.

