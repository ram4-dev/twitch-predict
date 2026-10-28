# Liquid glass resolution

The extension uses an animated liquid glass card for resolved and canceled predictions. It identifies winning and losing options with icons and labels, then shows the account result separately.

The PnL number is 56 px in the 700 × 600 extension popup and 48 px in compact previews, with a smaller points unit. The receipt keeps stake and gross payout separate from net profit or loss. The claim action remains above the popup footer. Long values wrap instead of overflowing.

Internal points totals come from settled account bets and stay visible after claiming. Mixed bets can hit the winning outcome while producing a net loss. SOL/BYTE shows the winner and settlement status, with a devnet explorer link; the API does not expose final payouts per wallet, so the UI marks that amount as unavailable.

## Showcase

Open `/resolution.html` or follow **Resolución** from `/components.html`. Compare solid, static glass and animated liquid glass in compact and popup layouts. All scenarios use example data and send no betting or claim requests. Visual reference: https://21st.dev/community/components/explore/liquid-glass-components. No third-party component code is copied.

## Motion and refresh

The reflection uses a CSS transform animation with a reduced-motion fallback. Pausing the showcase animation leaves the result visible. Settled popup nodes stay attached during refresh, preserving animation progress and expanded details.

## Validation

Run `npm run check` and the relevant Playwright suites: `resolution`, `popup-resolution`, `points`, `popup`, `byte`, `byte-mirror` and `design-system`. They cover outcome identity, account totals, claim persistence, refunds, mixed bets, missing SOL payouts, keyboard controls, reduced motion, compact overflow and the popup claim position.
