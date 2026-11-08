# Background sources

MIT sources discovered through 21st.dev. Adapted to deterministic SVG/CSS, muted colors and reduced motion. No blurred surfaces or raster textures.

- Magic UI (license in LICENSE.magicui): https://github.com/magicuidesign/magicui/tree/main/apps/www/registry/magicui — animated-grid-pattern.tsx, ripple.tsx, retro-grid.tsx. Retro version uses SVG perspective lines instead of the upstream shader.
- Bundui Floating Paths: https://github.com/bundui/components/blob/main/components/core/backgrounds/floating-paths.tsx. MIT license per repository README: https://github.com/bundui/components#license. Curve geometry retained; CSS replaces Motion path animation.

## Ember refinement

The current comparison keeps all effects in Plot's black/orange palette. Previous blue/green/violet grids and rings were removed.

- Ember Beams is an original SVG interpretation of Kokonut Beams' moving light shafts: https://21st.dev/@kokonutd/components/beams-background. Inspected MIT source: https://github.com/kokonut-labs/kokonutui/blob/main/public/r/beams-background.json. No canvas, blur buffer or upstream code is copied.
- Ember Silk retains Bundui's curve construction, reduced to nine warm strokes.
- Ember Sparks interprets Magic UI Particles as 22 deterministic SVG embers concentrated at the edges. No canvas or per-frame JS loop.
- Ember Rim uses narrow edge traces inspired by Corsair Animated Border: https://21st.dev/@kevingirelli/components/animated-border. The existing license is in ../corsair/LICENSE. No full-screen gradient, texture or blur.
