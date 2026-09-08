# Live Tracking Gradient — Sage/Emerald Approved Benchmark

Approved on 2026-08-30 as the baseline for future compression and center-out diffusion experiments.

## Frozen artifacts

- Source: `source-html/live-tracking-gradient-benchmark-sage-2026-08-30.html`
- Built preview: `dist/live-tracking-gradient-benchmark-sage-2026-08-30.html`
- Source SHA-256: `af3a5a9d947f782354e35a231c22be54a81c794e04d76b5c6759f5af1c63c747`
- Built SHA-256: `ec9efd246d327ceef561f34f351af96c8fdbc437999521f479876ed22d0eceb4`

The frozen files are byte-for-byte identical to the approved active version at the time this benchmark was created.

## Approved gradient behavior

- Keep the gradient in one fixed, non-interactive background layer.
- Preserve the original page layout and normal document flow.
- Run through two scroll-controlled color spectra.
- First spectrum peak: muted sage `rgb(125, 151, 145)`.
- Second spectrum peak: light sage `#AFC5BC` / `rgb(175, 197, 188)`.
- Never use full white as a gradient endpoint.
- Finish at dark emerald `#193B3B` / `rgb(25, 59, 59)` with white copy.
- Reverse deterministically when the viewer scrolls upward.
- Switch foreground copy according to the calculated background brightness.
- Fade the bright bloom out before the final emerald state.

## Layout invariants

- Preserve section order: `the-run`, `map`, `updates`, `articles`, `why`, `rsvp`.
- Preserve the three original feature cards in `the-run`.
- Never pin, resize, translate, clip, duplicate, reveal, or reflow page content.
- Keep the header image, navigation, fonts, live map, cards, RSVP section, and footer intact.
- Keep the map initialized and avoid horizontal overflow at mobile sizes.

The approved desktop geometry remains identical to the unchanged `live-tracking.html` page recorded in `live-tracking-gradient-2026-08-30.md`.

## Excluded from this benchmark

Center-out diffusion and vertical color compression are not part of this frozen version. Those effects should be developed only in the active gradient page or a new experimental version and compared against this benchmark.
