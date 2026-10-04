# Main-site airport overrides — 2026-09-29

## Scope

This standard static release changes only the current production main-site map
assets:

- `public_html/assets/tracker-base.js`
- `public_html/assets/strava-race-map.mjs`

It does not upload or modify `/tracking-preview/` or its embed. The existing
embed behavior, including its already-live airport schedule, is intentionally
preserved.

## Pre-deployment production benchmark and rollback

The exact live files were saved under
`/private/tmp/team-goodwin-deploy-TeBk07/rollback-main-site-before-airport-overrides-2026-09-29/`.
The Git repository also retains the two live runtime assets in
`production-merge/mission-window-alignment-2026-09-09/public_html/assets/`.

| Live resource | Bytes | SHA-256 |
| --- | ---: | --- |
| `/` and `/live-tracking/` | 33,310 | `4e96d5a878a95e93af6b5cbcd926c2dd56d0d7015f8f2a3bd035fafcc893239f` |
| `/assets/tracker-base.js` | 88,530 | `a5cefc6b5da47c0a186c175779e571cca0dafde6b0356ce9e0a934158cf5065e` |
| `/assets/strava-race-map.mjs` | 15,263 | `bf93f69c291f96cd6a80602250d119584d2b4c01137fb1b23011e3c25a800c1c` |

The live embed baseline was HTTP 200 with HTML SHA-256
`d258a4933d699f98fa880e0d73a125828f1cf0fe6e1e60989ebc4b8566bbca3c`.
Its manifest SHA-256 was
`f43f3285d5f08bffb68df9f6798ffd7c06d7d8574fc189b37931df2348d1afbb`
and its scheduled feed module SHA-256 was
`14a9da15157f01199e25b702438e8a0b04ce01a7b8ff5239dc263de45e7253dd`.

Uncached HTTP baseline samples were:

| Resource | Status | Bytes | TTFB | Total |
| --- | ---: | ---: | ---: | ---: |
| Main page | 200 | 33,310 | 0.863 s | 0.865 s |
| Tracker runtime | 200 | 88,530 | 0.655 s | 1.159 s |
| Map module | 200 | 15,263 | 1.055 s | 1.055 s |
| Embed | 200 | 2,539 | 0.794 s | 0.794 s |

## Candidate behavior

The four placements are half-open windows with explicit local UTC offsets:

- Will at HNL: October 9, 9:11pm–11pm HST.
- Will at ANC: October 10, 2pm–3:51pm AKDT.
- RV at PDX: October 11, 4am–8am PDT.
- Will at PDX: October 11, 1pm–5pm PDT.

The placement layer changes only the displayed Will or RV marker. Strava race
and status requests remain active under the existing authoritative mission
status, HAPN continues updating beneath an RV override, and the flight-status
loader plus all five rendered flight routes are unchanged. A boundary scheduler
rerenders at each placement start and end; it does not use estimated running
windows.

## Validation

- Manifest policy validation: passed for a two-file protected Standard release.
- Focused main-map and preserved-provider tests: 24/24 passed.
- Full regression suite: 208/208 passed.
- Isolated site and cPanel build: passed; all 19 generated changes remained
  under `dist/`.
- Browser scenarios: before HNL, exact HNL start/end, ANC, RV at PDX, and Will
  at PDX all passed with 51 state geometries, 50 route stops, five flight
  routes, one Will marker, one RV marker, zero failed requests, and zero console
  errors.
- Browser map-render benchmark: preserved baseline 896.9 ms; candidate scenarios
  836.6–847.0 ms in the same headless harness. CLS remained approximately
  `0.00038`.
- Every candidate browser scenario requested `/strava/public/races`,
  `/strava/public/race-status`, and `/strava/public/tracking-status`.

The approved upload hashes are recorded in
`deploy/manifests/releases/main-site-airport-overrides-2026-09-29.json`.
