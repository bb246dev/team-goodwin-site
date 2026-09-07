# Post-Strava-map production benchmark - 2026-09-06

## Scope and timestamp

- Production URL: <https://goodwingoodge.com>
- Capture window: 2026-09-07 04:04-04:16 UTC (2026-09-07 00:04-00:16 AST)
- Purpose: compare live production after the controlled two-file Strava map
  deployment against `docs/benchmarks/pre-strava-map-2026-09-04.md` and
  `docs/benchmarks/controlled-strava-map-merge-2026-09-06.md`.
- Production was not modified. No authenticated Strava/admin endpoint was
  called.

The live production map is now serving the controlled deployed assets:

- `/assets/tracker-base.js`
  - SHA-256: `a6c9fea694c1bb73181ed1a9ca9801169326bd8194c576e453b2d4faf2928c54`
  - HTTP 200, `Cache-Control: public, max-age=604800`
  - `Last-Modified: Mon, 07 Sep 2026 03:59:24 GMT`
- `/assets/strava-race-map.mjs`
  - SHA-256: `7a750659403f256d7a5305b84f164da7a75041d362627e016c6e5457c9de9b80`
  - HTTP 200, `Cache-Control: public, max-age=604800`
  - `Last-Modified: Mon, 07 Sep 2026 03:59:17 GMT`

## Method

- Lighthouse 13.4.1 through `npx`, using the same page set as the pre-Strava
  benchmark: one mobile run and one desktop-preset run per page.
- `curl` 8.7.1 over HTTP/2 with compression, five sequential requests per page.
  Tables report the median and highest sample as the small-set p95.
- A separate clean-profile headless Chrome/CDP pass loaded live production,
  checked page console/network health, verified the lazy map before and after
  viewport approach, and recorded Strava request timing.
- Safe public Strava endpoints were checked directly. No protected route or
  credentialed endpoint was requested.

Lighthouse cannot provide field INP in a synthetic run. Total Blocking Time
(TBT) is recorded as the lab responsiveness proxy. The homepage mobile result
was rerun once because it moved materially from the pre benchmark; the rerun
again showed slow LCP with identical request count and transferred weight.

## Direct public-page response check

Document bytes are compressed response-body bytes, matching the pre-Strava
benchmark method. All primary documents returned HTTP 200.

| Page | Production path | HTTP | Median TTFB | Highest/p95 TTFB | Median total | Highest/p95 total | Document bytes |
|---|---|---:|---:|---:|---:|---:|---:|
| Homepage / live tracker | `/` | 200 | 388 ms | 442 ms | 389 ms | 600 ms | 8,261 |
| Overview / The Run | `/the-run/` | 200 | 377 ms | 407 ms | 377 ms | 407 ms | 4,922 |
| Athlete / Will | `/will/` | 200 | 387 ms | 399 ms | 387 ms | 399 ms | 6,345 |
| World Record Attempt / Fifty Runs | `/fifty-runs/` | 200 | 394 ms | 411 ms | 394 ms | 411 ms | 6,388 |
| Updates | `/updates/` | 200 | 386 ms | 397 ms | 398 ms | 494 ms | 9,127 |
| Week 1 | `/week-1/` | 200 | 392 ms | 407 ms | 392 ms | 408 ms | 4,478 |
| Week 2 | `/week-2/` | 200 | 384 ms | 394 ms | 384 ms | 395 ms | 4,636 |
| Week 3 | `/week-3/` | 200 | 390 ms | 405 ms | 390 ms | 405 ms | 4,650 |
| FAQ | `/faq/` | 200 | 385 ms | 407 ms | 385 ms | 408 ms | 9,743 |

These response timings are within the same production band as the 2026-09-04
pre benchmark. Document byte counts are unchanged from the pre benchmark.

## Lighthouse mobile

| Page | Perf. | A11y | Best practices | SEO | FCP | LCP | Speed Index | TBT | CLS | Requests | Weight KiB | Console / failed |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Homepage / live tracker | 68 | 100 | 77 | 100 | 1,929 | 7,220 | 6,733 | 27 | 0 | 53 | 1,517.9 | 0 / 0 |
| Overview / The Run | 84 | 94 | 96 | 92 | 1,335 | 4,132 | 4,384 | 39 | 0 | 23 | 513.4 | 1 / 1 |
| Athlete / Will | 82 | 98 | 96 | 92 | 1,377 | 4,285 | 4,592 | 26 | 0 | 32 | 990.2 | 2 / 2 |
| World Record Attempt / Fifty Runs | 83 | 100 | 96 | 92 | 1,262 | 4,223 | 4,459 | 19 | 0 | 23 | 514.5 | 1 / 1 |
| Updates | 81 | 95 | 77 | 100 | 1,624 | 4,383 | 4,903 | 10 | 0 | 29 | 601.0 | 0 / 0 |
| Week 1 | 65 | 100 | 96 | 92 | 4,422 | 6,835 | 4,619 | 0 | 0 | 26 | 1,150.2 | 1 / 1 |
| Week 2 | 63 | 100 | 96 | 92 | 4,430 | 7,157 | 5,938 | 0 | 0 | 26 | 1,150.3 | 1 / 1 |
| Week 3 | 63 | 100 | 96 | 92 | 4,523 | 6,595 | 5,945 | 0 | 0 | 26 | 1,150.3 | 1 / 1 |
| FAQ | 80 | 96 | 100 | 100 | 1,640 | 4,548 | 4,676 | 0 | 0 | 27 | 571.5 | 0 / 0 |

Mobile comparison to the pre-Strava benchmark:

| Page | Performance delta | LCP delta |
|---|---:|---:|
| Homepage / live tracker | -28 | +4,693 ms |
| Overview / The Run | +1 | -48 ms |
| Athlete / Will | -1 | +64 ms |
| World Record Attempt / Fifty Runs | -1 | +123 ms |
| Updates | +1 | -176 ms |
| Week 1 | +3 | -441 ms |
| Week 2 | +1 | -218 ms |
| Week 3 | +1 | -663 ms |
| FAQ | -1 | +268 ms |

The homepage mobile LCP regression is the only material synthetic metric change.
A second homepage mobile run reported Performance 70, FCP 1,742 ms, LCP
7,114 ms, Speed Index 5,902 ms, TBT 1 ms, CLS 0, 53 requests, and 1,517.9 KiB.
Both homepage mobile runs made zero Strava or `strava-race-map.mjs` requests
during Lighthouse collection, and the request count/weight matched the pre
benchmark. This should be tracked, but the captured evidence does not tie it to
the Strava map integration.

## Lighthouse desktop

| Page | Perf. | A11y | Best practices | SEO | FCP | LCP | Speed Index | TBT | CLS | Requests | Weight KiB | Console / failed |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Homepage / live tracker | 98 | 100 | 77 | 100 | 649 | 838 | 1,270 | 0 | 0.0082 | 51 | 2,928.4 | 0 / 0 |
| Overview / The Run | 93 | 93 | 96 | 92 | 692 | 791 | 920 | 0 | 0.1495 | 23 | 513.4 | 1 / 1 |
| Athlete / Will | 92 | 98 | 96 | 92 | 769 | 962 | 878 | 0 | 0.1522 | 32 | 990.3 | 2 / 2 |
| World Record Attempt / Fifty Runs | 83 | 100 | 96 | 92 | 587 | 587 | 821 | 0 | 0.3423 | 23 | 514.4 | 1 / 1 |
| Updates | 99 | 95 | 77 | 100 | 733 | 733 | 886 | 0 | 0.0139 | 30 | 623.5 | 0 / 0 |
| Week 1 | 86 | 100 | 96 | 92 | 648 | 648 | 1,119 | 0 | 0.2651 | 27 | 1,469.0 | 1 / 1 |
| Week 2 | 85 | 100 | 96 | 92 | 755 | 755 | 923 | 0 | 0.2651 | 27 | 1,469.1 | 1 / 1 |
| Week 3 | 86 | 100 | 96 | 92 | 605 | 605 | 829 | 0 | 0.2653 | 27 | 1,469.1 | 1 / 1 |
| FAQ | 99 | 96 | 100 | 100 | 647 | 647 | 851 | 0 | 0.0012 | 28 | 594.0 | 0 / 0 |

Desktop comparison to the pre-Strava benchmark:

| Page | Performance delta | LCP delta |
|---|---:|---:|
| Homepage / live tracker | 0 | -103 ms |
| Overview / The Run | -1 | +149 ms |
| Athlete / Will | -1 | +218 ms |
| World Record Attempt / Fifty Runs | 0 | -137 ms |
| Updates | 0 | +42 ms |
| Week 1 | 0 | +164 ms |
| Week 2 | -1 | +189 ms |
| Week 3 | 0 | -46 ms |
| FAQ | -1 | -29 ms |

Desktop performance remains effectively unchanged. Desktop homepage Lighthouse
did record the Strava module and two public API requests, which is expected for
the taller desktop synthetic viewport and the production `700px` map lazy-load
gate. Its Performance score stayed 98 and LCP improved slightly from the pre
benchmark.

## Live map verification

The clean Chrome production pass confirmed:

- Before the map approached the viewport:
  - `#mission-map` contained 0 SVGs.
  - No `/strava/` or `strava-race-map.mjs` resources were requested.
- After scrolling the map stage into view:
  - 51 state shapes rendered.
  - 50 race markers rendered.
  - 3 core route paths rendered.
  - 5 existing flight paths rendered.
  - Runner marker count: 1.
  - RV marker count: 1.
  - Stored Strava activity paths: 0, matching the pre-race/inactive state.
  - Map ARIA label: `Interactive Goodwin Generated Mission America route map. 0 of 50 races completed.`
  - CLS after map: `0.00034909562149853173`.
  - Broken images: 0.
  - Console errors: 0.
  - Unexpected first-party network failures: 0.

Near the map, the request delta was exactly the controlled integration set plus
the existing deferred map resources:

- Existing: `/assets/index-CIGW-MKW.css`
- Existing: `/assets/us-states-albers-10m.json`
- Added: `/assets/strava-race-map.mjs`
- Added: `/strava/public/races`
- Added: `/strava/public/race-status`

The measured time from map approach to static SVG availability was 2,295.4 ms in
this production run. The pre benchmark's single warm observation was 161 ms, and
the controlled local-proxy merge median was about 569 ms. This live value is
not considered a Strava-specific regression because the static SVG appeared
before Strava activity rendering, the required topology request remained the
dominant map dependency, and the controlled paired test showed no material
candidate-versus-baseline map-render delta. It should be used as the new live
post-deploy field observation.

Static fallback remains intact by design from the controlled merge validation:
the deployed module only replaces schedule state after receiving a complete,
ordered 50-race response, and the static 50-race map remains rendered if module
or API loading fails.

## Strava public API verification

All safe public checks passed:

- `GET /strava/public/races`
  - HTTP 200
  - 50 races returned, ordered from `ggma-2026-01` through `ggma-2026-50`
  - `Cache-Control: public, max-age=300, s-maxage=300, stale-while-revalidate=60`
  - No activity objects present in the current pre-race data.
- `GET /strava/public/race-status`
  - HTTP 200
  - `active: false`
  - `completedRaces: 0`
  - `totalRaces: 50`
  - Window: `ggma-2026`, `2026-10-09T00:00:00-04:00` through
    `2026-11-01T23:59:59-05:00`
  - Same public cache policy as `/strava/public/races`.
- `GET /strava/health-startup`
  - HTTP 200
  - `server: "running"`
  - `configLoaded: true`
  - `mysqlModuleLoaded: true`
  - `mysqlPoolCreated: true`
  - `databaseReachable: true`
  - `stravaConfigValid: true`
  - `startupErrorCategory: "none"`
  - `Cache-Control: no-store`

The health endpoint response time in the direct API pass was 125 ms total. The
public races response was 153 ms total, and race status was 406 ms total.

## Errors and known warnings

The post-deploy browser page-health pass found no console errors, no unexpected
network failures, and no broken images across the primary page set.

Lighthouse still reports the same known pre-existing failures from the
pre-Strava benchmark:

- `/favicon.ico` returns 404 on The Run, Will, Fifty Runs, and Week 1-3.
- `/api/instagram-feed` returns 404 on Will. The existing fallback Instagram
  grid remains visible.
- Homepage and Updates Best Practices remain at 77 due third-party/cookie or
  Chrome Issues-panel findings.
- SEO remains 92 on The Run, Will, Fifty Runs, and Week 1-3 because their live
  documents lack meta descriptions.
- Desktop CLS remains a baseline issue on Fifty Runs, Week 1-3, Will, and The
  Run. Values match the pre-Strava benchmark closely.

None of these findings is new evidence of a Strava map regression.

## Regression assessment

Public page health passed. All primary pages returned HTTP 200, the live map
structure is preserved, and the Strava backend public endpoints are healthy.

The controlled Strava behavior passed in production:

- No initial mobile Strava requests before the map approached the viewport.
- The expected Strava request set appears at the map lazy-load boundary.
- Current race state is pre-race/inactive with 0 completed races.
- Pending/excluded/private Strava data is not exposed by the public checks.

Material metric notes:

- Mobile homepage Lighthouse Performance fell from 96 to 68/70, with LCP moving
  from 2,527 ms to about 7.1-7.2 seconds. Because mobile Lighthouse made zero
  Strava requests, and because homepage request count and transferred weight
  stayed unchanged, this is not attributed to the Strava integration from the
  captured evidence. It should be watched in the next production pass.
- Desktop metrics are stable. Homepage desktop remained Performance 98, and
  its LCP improved from 941 ms to 838 ms.
- Other page deltas are within normal single-run synthetic variation or match
  known baseline issues.

## Conclusion

The post-deployment benchmark passes for the controlled Strava live-map
integration. Production is serving the expected two deployed files, existing
public pages and the static map remain healthy, Strava public API reads work,
and the integration does not enter the initial mobile LCP path.

It is safe to commit the controlled Strava map integration. Keep the homepage
mobile Lighthouse LCP observation in view as a production performance warning,
but the evidence collected here does not classify it as a Strava regression.
