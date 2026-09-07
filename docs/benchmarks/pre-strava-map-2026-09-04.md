# Pre-Strava-map production benchmark — 2026-09-04

## Scope and timestamp

- Production URL: <https://goodwingoodge.com>
- Capture window: 2026-09-04 20:49–21:03 UTC (16:49–17:03 AST)
- Purpose: record the live production baseline immediately before the stored,
  public Strava race-data API is deployed and connected to the existing map.
- Production was not modified. No authenticated endpoint was called.

The homepage is also the current tracking/live-map page. Its feature navigation
maps **Overview** to `/the-run/`, **Athlete** to `/will/`, and **World Record
Attempt / Fifty Runs** to `/fifty-runs/`. Updates, Week 1–3, and FAQ were included
as the other primary public content pages. Legal pages were present in the
sitemap but were outside this primary-page performance pass.

## Method

- Lighthouse 13.4.1 with Google Chrome 152.0.7977.77, one isolated mobile run
  and one desktop-preset run per page. Scores and timings are synthetic lab
  results and can vary between runs.
- curl 8.7.1 over HTTP/2 with compression, five sequential requests per page.
  Tables report the median and the highest of the five samples as the small-set
  p95. These direct timings include network distance from the benchmark host.
- Lighthouse network records supplied total transferred bytes, request counts,
  failed requests, and console-error findings.
- A separate unthrottled browser check scrolled the lazy map into view and
  inspected the resulting DOM, browser warnings, and failed images.
- The live HTML was compared by SHA-256 and normalized visible text with the
  repository's latest known-good tag,
  `team-goodwin-benchmark-partner-logo-links-v13` (`d7cf272`, 2026-08-30).

Lighthouse cannot provide field INP in a synthetic run. Total Blocking Time
(TBT) is recorded as its lab responsiveness proxy. The map render time is one
warm-browser observation and should be compared only with the same procedure.

## Direct public-page response baseline

Document bytes are compressed response-body bytes. All requests completed with
no redirects.

| Page | Production path | HTTP | Median TTFB | Highest/p95 TTFB | Median total | Highest/p95 total | Document bytes |
|---|---|---:|---:|---:|---:|---:|---:|
| Homepage / live tracker | `/` | 200 | 381 ms | 401 ms | 394 ms | 448 ms | 8,261 |
| Overview / The Run | `/the-run/` | 200 | 382 ms | 404 ms | 384 ms | 404 ms | 4,922 |
| Athlete / Will | `/will/` | 200 | 389 ms | 394 ms | 390 ms | 397 ms | 6,345 |
| World Record Attempt / Fifty Runs | `/fifty-runs/` | 200 | 378 ms | 405 ms | 378 ms | 405 ms | 6,388 |
| Updates | `/updates/` | 200 | 386 ms | 398 ms | 393 ms | 493 ms | 9,127 |
| Week 1 | `/week-1/` | 200 | 379 ms | 417 ms | 380 ms | 418 ms | 4,478 |
| Week 2 | `/week-2/` | 200 | 366 ms | 470 ms | 367 ms | 470 ms | 4,636 |
| Week 3 | `/week-3/` | 200 | 395 ms | 503 ms | 395 ms | 503 ms | 4,650 |
| FAQ | `/faq/` | 200 | 375 ms | 489 ms | 429 ms | 507 ms | 9,743 |

## Lighthouse mobile baseline

Times are milliseconds; weight is total transferred KiB. TBT is the available
lab proxy for interaction responsiveness.

| Page | Perf. | A11y | Best practices | SEO | FCP | LCP | Speed Index | TBT | CLS | Requests | Weight KiB | Console / failed |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Homepage / live tracker | 96 | 100 | 77 | 100 | 1,473 | 2,527 | 3,425 | 10 | 0.0114 | 53 | 1,517.1 | 0 / 0 |
| Overview / The Run | 83 | 94 | 96 | 92 | 1,441 | 4,180 | 4,407 | 34 | 0 | 23 | 513.7 | 1 / 1 |
| Athlete / Will | 83 | 98 | 96 | 92 | 1,290 | 4,221 | 4,798 | 23 | 0 | 32 | 990.2 | 2 / 2 |
| World Record Attempt / Fifty Runs | 84 | 100 | 96 | 92 | 1,272 | 4,100 | 4,459 | 40 | 0 | 23 | 514.4 | 1 / 1 |
| Updates | 80 | 95 | 77 | 100 | 1,633 | 4,559 | 4,906 | 32 | 0 | 29 | 601.0 | 0 / 0 |
| Week 1 | 62 | 100 | 96 | 92 | 4,571 | 7,276 | 6,289 | 0 | 0 | 26 | 1,150.2 | 1 / 1 |
| Week 2 | 62 | 100 | 96 | 92 | 4,516 | 7,375 | 6,259 | 0 | 0 | 26 | 1,150.3 | 1 / 1 |
| Week 3 | 62 | 100 | 96 | 92 | 4,427 | 7,258 | 6,257 | 1 | 0 | 26 | 1,150.5 | 1 / 1 |
| FAQ | 81 | 96 | 100 | 100 | 1,767 | 4,280 | 4,713 | 27 | 0 | 27 | 571.5 | 0 / 0 |

Across these nine single runs, mobile Performance averaged 77.0, ranged from
62–96, and had a median LCP of 4,280 ms. The Week 1–3 pages are the clear mobile
baseline low point at Performance 62 and roughly 7.3 seconds LCP.

## Lighthouse desktop baseline

| Page | Perf. | A11y | Best practices | SEO | FCP | LCP | Speed Index | TBT | CLS | Requests | Weight KiB | Console / failed |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Homepage / live tracker | 98 | 100 | 77 | 100 | 658 | 941 | 1,299 | 0 | 0.0091 | 48 | 2,917.7 | 0 / 0 |
| Overview / The Run | 94 | 93 | 96 | 92 | 551 | 642 | 811 | 0 | 0.1495 | 23 | 513.4 | 1 / 1 |
| Athlete / Will | 93 | 98 | 96 | 92 | 653 | 744 | 854 | 0 | 0.1522 | 32 | 990.2 | 2 / 2 |
| World Record Attempt / Fifty Runs | 83 | 100 | 96 | 92 | 636 | 724 | 795 | 0 | 0.3423 | 23 | 514.4 | 1 / 1 |
| Updates | 99 | 95 | 77 | 100 | 691 | 691 | 849 | 0 | 0.0139 | 30 | 623.5 | 0 / 0 |
| Week 1 | 86 | 100 | 96 | 92 | 484 | 484 | 789 | 0 | 0.2651 | 27 | 1,469.0 | 1 / 1 |
| Week 2 | 86 | 100 | 96 | 92 | 566 | 566 | 852 | 0 | 0.2651 | 27 | 1,469.1 | 1 / 1 |
| Week 3 | 86 | 100 | 96 | 92 | 497 | 651 | 1,076 | 0 | 0.2653 | 27 | 1,469.1 | 1 / 1 |
| FAQ | 100 | 96 | 100 | 100 | 576 | 676 | 804 | 0 | 0.0001 | 28 | 594.2 | 0 / 0 |

Across these nine single runs, desktop Performance averaged 91.7, ranged from
83–100, and had a median LCP of 676 ms. Desktop CLS is a notable baseline issue
on Fifty Runs (0.3423), Week 1–3 (about 0.265), Will (0.1522), and The Run
(0.1495). The homepage desktop weight is about 2.85 MiB, driven in part by a
partial hero-video transfer; its performance score remained 98 in this run.

## Existing live map and tracking baseline

- The map is lazy: after initial page load at the top, `#mission-map` had not
  begun loading and contained no SVG.
- Scrolling the map into view produced the completed map in 161 ms in one warm,
  unthrottled browser observation.
- Rendered structure: one SVG, 51 state shapes, 50 race markers, three route
  paths, and two runner/RV image markers. No map fallback text appeared.
- The map topology request was
  `/assets/us-states-albers-10m.json`: HTTP 200, 82,031-byte response body,
  82,294 bytes transferred in the Lighthouse mobile record, and a seven-day
  public cache header.
- Route stops and the initial marker/route state are still defined in the
  existing public JavaScript. `MISSION_LIVE_TRACKING_ENDPOINT` resolves to an
  empty string, so the page makes no live tracking API request.
- `/api/tracking-status` currently returns HTTP 404. Five direct samples had a
  median TTFB/total of 388/388 ms and a 1,251-byte HTML error body.
- The homepage made one public Google Sheets JSONP request for field updates
  (7,849 transferred bytes in the mobile Lighthouse record). It made no Strava
  request.
- The homepage map check produced no warnings, errors, or broken images.
- Both planned endpoints, `/strava/public/races` and
  `/strava/public/race-status`, returned HTTP 404 with the safe body
  `{"error":"not_found"}`. They are not deployed or connected to the map.

## Strava backend health baseline

`GET /strava/health-startup` returned HTTP 200 and `Cache-Control: no-store`.
All readiness fields reported healthy:

```json
{
  "server": "running",
  "configLoaded": true,
  "mysqlModuleLoaded": true,
  "mysqlPoolCreated": true,
  "databaseReachable": true,
  "stravaConfigValid": true,
  "startupErrorCategory": "none"
}
```

Five direct samples produced a median TTFB/total of 390/390 ms and a highest
sample of 509/509 ms. The response body was 169 bytes. No credentialed route was
requested and no secret value was collected.

## Errors, assets, Instagram, and audit warnings

- All primary documents returned HTTP 200. Lighthouse found no failed request
  on the homepage, Updates, or FAQ.
- `/favicon.ico` returned HTTP 404 on The Run, Will, Fifty Runs, and Week 1–3,
  producing one network console error per profile. The homepage's explicit
  `/assets/goodwin-favicon.png` loaded successfully.
- The Will page's `/api/instagram-feed` request returned HTTP 404, adding a
  second failed request and console error there. Its fallback remained visible:
  eight Instagram images/links rendered, and the browser found no broken image.
- Other first-party resources observed by Lighthouse, including CSS, public
  JavaScript, fonts, content images, partner marks, map topology, and the hero
  video range request, returned 200 or the expected 206 for video.
- Homepage and Updates Best Practices scored 77 because Lighthouse found two
  third-party cookies and Chrome Issues-panel findings. Neither logged console
  errors in these captures.
- SEO scored 92 on The Run, Will, Fifty Runs, and Week 1–3 because their live
  documents lack meta descriptions.
- Accessibility findings: The Run has heading-order and link-color findings;
  Will has a heading-order finding; Updates and FAQ have color-contrast
  findings. These are observations only; no optimization was performed.

## Repository comparison and isolation check

The latest known-good tag's nine tested HTML files are byte-identical to the
current repository `dist` copies. None of the nine live production HTML files is
byte-identical or normalized-text-identical to those tagged files. The live
homepage reports `Last-Modified: Wed, 02 Sep 2026 18:32:32 GMT`, after the
2026-08-30 tag, and its title has changed from the tagged marketing title to the
current live-tracker title.

The live homepage also requested 15 successful first-party assets that are not
present in the current repository `dist` export, including the split
`tracker-base` and `ambient-scroll` CSS/JavaScript, subset fonts, current hero
media, and current feature images. This means the repository tag cannot serve as
an exact binary recovery image of current production. The difference predates
this benchmark and cannot be classified as a Strava regression from the
available evidence; it is a reproducibility warning for future deployments.

Within the live production capture, the current site remains internally
coherent: all primary pages load, all 50 schedule rows render in order from
Hawaii/Honolulu to New York/New York City, the map renders its full static route,
the fallback Instagram grid remains visible, and all required public CSS and
JavaScript resources succeed. The Strava application is healthy but the planned
public race endpoints remain absent, and the current map code has no configured
live tracking endpoint. There is therefore no evidence that the Strava backend
has changed the current public map, page layout, or public JavaScript behavior.

## Readiness conclusion

Production is functionally ready to proceed with a controlled Strava map
integration, using this live capture as the comparison baseline. The existing
favicon/feed 404s, weak mobile Week-page performance, desktop layout shifts, and
repository/production drift should remain explicit known-baseline warnings; a
post-integration comparison must not attribute them to the Strava change.
