# Live Tracking Gradient — Approved Benchmark

Approved on 2026-08-30 as the baseline for future gradient iterations.

## Frozen artifacts

- Source: `source-html/live-tracking-gradient-benchmark-2026-08-30.html`
- Built preview: `dist/live-tracking-gradient-benchmark-2026-08-30.html`
- Source SHA-256: `e82274e48491f93108ddb0b9af6ce936f969cdef28d23bbfd8c71f67fee1286c`
- Built SHA-256: `2be18f8cc38b07659888ac8e4f85c7f542a22642faaf7e3c6c12610851db52b2`

The frozen files are byte-for-byte identical to the approved working version at the time this benchmark was created.

## Required behavior

- Preserve the original page structure and normal document flow.
- Preserve section order: `the-run`, `map`, `updates`, `articles`, `why`, `rsvp`.
- Keep exactly three original feature cards in `the-run`.
- Keep the gradient in a fixed, non-interactive background layer.
- Never pin, resize, translate, clip, duplicate, reveal, or reflow page content.
- Progress from black to `#193B3B` to off-white while scrolling down.
- Reverse to the same states and positions while scrolling upward.
- Switch foreground copy from white to black as the background becomes light.
- Keep the header image, navigation, fonts, map, cards, RSVP section, and footer intact.
- Keep the live map initialized and avoid horizontal overflow at mobile sizes.

## Recorded desktop geometry

Reference viewport: 865 × 804.

- Document height: 9,292 px
- Hero: 865 × 709 px
- `the-run`: 796 × 736 px
- `map`: 796 × 1,452 px
- `updates`: 796 × 1,363 px
- `articles`: 796 × 1,615 px
- `why`: 796 × 944 px
- `rsvp`: 825 × 973 px

These values matched the unchanged `live-tracking.html` page exactly at the reference viewport.

## Recorded gradient states

- Top: `rgb(0, 0, 0)`, white copy.
- Articles phase: approximately `rgb(24, 58, 58)`, white copy.
- Footer phase: `rgb(247, 247, 242)`, black copy.
- Returning upward to the map restored the same dark state and orb position recorded on the downward pass.

## Responsive check

At 390 × 844, the approved version retained all six sections and three feature cards, initialized the map, and produced no horizontal overflow.
