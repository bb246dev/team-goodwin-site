# Post-footer production benchmark — 2026-09-09

Status: **PASS**

Production origin: `https://goodwingoodge.com/`

Release commit: `130b6dc2e5b5ad6fd7ca99c862badc9733ade969`

This benchmark was collected after the corrected root-route footer release was deployed and byte-verified in production. It compares the same production page and map checks recorded before the release in `pre-footer-production-2026-09-09.md`.

## Before and after

| Measurement | Before | After | Change |
|---|---:|---:|---:|
| Median page TTFB | 272 ms | 272 ms | 0 ms |
| Median page total | 272 ms | 274 ms | +2 ms |
| Homepage total | 289 ms | 295 ms | +6 ms |
| Homepage transfer | 1,196,949 B | 1,198,563 B | +1,614 B |
| Static map render | 2,458 ms | 2,540 ms | +82 ms |
| CLS | 0.0006904 | 0.0006904 | unchanged |

## Interpretation

- No material page-performance regression was observed.
- No material map-render regression was observed.
- The small transfer and timing increase is consistent with the one additional footer stylesheet.
- CLS was unchanged.
- Nine benchmark pages completed with zero console errors, zero broken images, and zero counted first-party failures.

## Map and API checks

- Map ready: yes
- State shapes: 51
- Race markers: 50
- Core routes: 3
- Flight paths: 5
- Runner marker: visible
- RV marker: visible
- Pre-race HAPN frontend requests: 0
- `GET /strava/public/races`: HTTP 200, 50 races
- `GET /strava/public/race-status`: HTTP 200, inactive, 0 of 50 completed
- `GET /strava/public/tracking-status`: HTTP 200, sanitized public projection

`GET /strava/health` remains HTTP 404. This was present before the footer release and is a known routing/version-parity issue, not a footer regression.
