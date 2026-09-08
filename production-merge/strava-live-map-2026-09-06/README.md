# Controlled Strava live-map production merge

This package was prepared from the live production document and its current
`tracker-base.js` asset on 2026-09-06. It does not contain a rebuilt website
export.

## Authoritative production inputs

- `https://goodwingoodge.com/`
- `https://goodwingoodge.com/live-tracking/`
- `https://goodwingoodge.com/live-tracking.html`

All three URLs returned the same document (SHA-256
`edfe3abd43998cf94655c92a1a7cda8e1137bc5f37a50b4858e10b1689910d51`) and
load `/assets/tracker-base.js?v=20260831mobile-critical-path`. The captured
production tracker asset had SHA-256
`743faaf0d6c76c80e9ee50443bbe1d03f6589f1983c51b0e4376d08f64bc2faf`.

## Production upload set

Upload the module first, then the tracker bundle:

1. `public_html/assets/strava-race-map.mjs` (new file)
2. `public_html/assets/tracker-base.js` (merge into the current production asset)

No HTML, CSS, image, font, compressed asset, `ambient-scroll` asset, public-site
route, or backend file is part of this deployment set. Keep a copy of the
current production `tracker-base.js` before replacing it so rollback is one file.

The production tracker asset currently advertises a seven-day browser cache.
An incognito window or hard reload is needed for an immediate post-upload check;
ordinary visitors will adopt the new bundle as their existing cache expires.

## Validation

- Node 22.23.2 suite: 96/96 tests passed.
- Same-harness production baseline: 51 state shapes, 50 markers, three core
  route paths, five existing flight paths, one runner marker, and one RV marker.
- Controlled candidate: identical structure, no initial map/Strava requests,
  one stored activity polyline rendered in the included-activity fixture, no
  first-party request failures, no broken images, and no console errors.
- API failure and module failure: complete static map retained; one fixed,
  value-free warning was emitted.
- Median static-map observation across three same-harness passes: production
  571.1 ms; candidate 569.3 ms (−1.8 ms, approximately −0.3%).
- Measured CLS was identical at `0.00034909562149853173`.

Raw browser results are in `validation-results.json`.
