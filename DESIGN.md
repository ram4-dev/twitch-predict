# Prediction Mirror — points UI

Data and jobs: Twitch channel and original prediction ID; title and outcomes; source status and betting deadline; separate internal balance; own stakes per outcome; internal pool, participant count, share; terminal winner and refundable/claimable points; personal bet history; operator channel watches; explicitly marked demo markets. Totals are computed by the existing points engine. No fabricated activity, chart, odds, or participant count.

Primary consumer question: Which side can I back, for how many of my points?
Primary operator question: Which channels are being followed and are new predictions replicated?

Taste Skill local installation: .agents/skills/taste-skill (design-taste-frontend). The current repository only contains this skill; the separate redesign-skill path advertised on its website is stale. Default installer partially installed taste-skill successfully before reporting the missing second path; the installed SKILL.md and app-screens reference were read.

Direction: true-black-flat, seed 554067584. Neutral black ground and #111 surfaces, Inter loaded locally, 14px body / 12px metadata, 20–24px section headings and tabular numbers. The product signature is the opposing outcomes with one proportion strip derived from the internal pool. Only pool data and actual outcome/status marks carry lime. Buttons and navigation stay neutral; no neon or glow.

The panel becomes a working dashboard with a compact header, a consumer market area, and a real operator section. The extension is a 700px detail view with its balance pinned in the header. The sidebar from the dealt shell is omitted for the extension because its 700px width is an explicit user constraint and its main destination is the current channel; the web panel uses a compact label navigation because it has few destinations. No random redraw.

Stack exception: the user explicitly requested shadcn/ui, so betting controls are React components from the official shadcn registry, bundled locally with esbuild and Tailwind. Existing vanilla shells and the offchain API/business rules are preserved. Taste Skill's default ban on framework migration is overridden by this explicit request, scoped to the betting component.

Sources: https://ui.shadcn.com/docs/installation/manual, https://ui.shadcn.com/r/styles/new-york-v4/button.json, https://www.tasteskill.dev/, https://tastelabs.com/api. Taste Labs private API was not invoked: no TASTE API credential in the vault, and its login browser snapshot timed out twice. Its public product/reference material informs the visual review only; no Taste Labs verification score is claimed.

Before audit: 3 FAIL (tiny uppercase labels, missing dealt font, text below 11px); 4 WARN (strong panel borders, no tabular figures, no data hue, 52px landing heading). Screenshots and JSON are in .taste-skill/before.

Final review: the initial oversized landing header was replaced by a 24px product title; loaded Inter is verified at all widths. Meta/data hierarchy is 12/13/14/16/24/30px, and tabular numbers survive the CSS optimizer (font shorthand removed from the widget). The internal pool split is the signature data element; its segments add to the internal pool and never use Twitch point counts. Zero pool shows zero and no artificial 50/50 bar. Black elevation and neutral buttons preserve the dealt style. The account and current market are the first consumer objects; the operator view has real watch/pair controls. Mobile keeps both outcomes and stacks the stake presets without horizontal page overflow.

Three visual rounds completed. Before: 3 FAIL / 4 WARN. After: 0 FAIL / 0 WARN at 1440, 768 and 390px, source lint 0 FAIL / 0 WARN. Screenshots at every width were inspected, including the final desktop and mobile renders; no inspector exception was used. Native-popup width was separately tested as 700px with unchanged host bounds. No private Taste Labs API assessment is claimed. Sample/demo predictions are visibly marked and resolve through demo-only controls; live markets retain automatic Twitch resolution.
