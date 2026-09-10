# Mission window alignment — pre-deployment production benchmark

**Captured:** 2026-09-10T02:26:05.296Z

**Production:** <https://goodwingoodge.com>

**Runtime:** Node.js 22.23.2 with fresh headless Chrome profiles and cache disabled

## Route baseline

All 16 clean production routes returned HTTP 200: `/`, `/the-run/`, `/will/`,
`/fifty-runs/`, `/live-tracking/`, `/athletes/`, `/partners/`, `/updates/`,
`/week-1/`, `/week-2/`, `/week-3/`, `/faq/`, `/privacy/`, `/terms/`,
`/participation-terms/`, and `/accessibility/`.

The fresh-profile browser pass reported zero console errors, zero broken images,
and zero counted first-party request failures on every route.

## Measurements

| Measurement | Pre-deployment |
| --- | ---: |
| Median page TTFB | 275 ms |
| Median page total | 275 ms |
| Homepage median TTFB | 323 ms |
| Homepage median total | 324 ms |
| Homepage document body | 33,310 B |
| Homepage initial transfer | 1,200,801 B |
| Static map render | 2,542 ms |
| Homepage CLS before map | 0.0006903973 |
| Homepage CLS after map | 0.0007170777 |

## Map, API, and pre-race behavior

- Map ready: yes; 51 states, 50 race markers, 3 core routes, 5 flight paths,
  one Will marker, and one RV marker.
- The map remained lazy: no Strava module or API request occurred before the
  map neared the viewport.
- Pre-race HAPN frontend requests: 0.
- `GET /strava/public/races`: HTTP 200 with 50 races.
- `GET /strava/public/race-status`: HTTP 200 and inactive with 0 of 50 races
  complete. The live pre-release response still advertised the incorrect
  `2026-10-09T00:00:00-04:00` start and the correct
  `2026-11-01T23:59:59-05:00` end.
- `GET /strava/public/tracking-status`: HTTP 200 with a sanitized stale public
  tracking projection.
- The historical `/strava/health` route returned its existing HTTP 404
  `not_found` response and is not classified as a regression.

## Production runtime hashes

| Runtime file | Pre-deploy SHA-256 | Bytes |
| --- | --- | ---: |
| `/public_html/assets/tracker-base.js` | `42ff22f91263e81529a09d2bef6f61f014eb96492ae9366a65c32654bffa6b98` | 83,592 |
| `/public_html/assets/strava-race-map.mjs` | `4d8b6e1b33b701651fa5219e5a12736dee5d0605ac7810fa8a1d1eb427629dae` | 15,109 |
| `/goodwin-strava-api/lib/race-window.mjs` | `977a51b5ed4b63a7b0280325036bac4d33d9d5f19e22bd8ad14046f883d8caac` | verified by the deployment precondition gate |

## Release baseline decision

The baseline is healthy and the timing mismatch is reproduced: the public
backend reports midnight while the approved mission begins at 9:00 AM EDT.
The controlled three-file release may proceed only if the deployment
precondition gate re-verifies all three hashes together.
