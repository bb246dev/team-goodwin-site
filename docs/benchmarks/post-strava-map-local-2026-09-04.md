# Post-Strava-map local benchmark — 2026-09-04

## Scope and timestamp

- Preview URL: `http://127.0.0.1:4173/`
- Capture completed: 2026-09-04 21:35 UTC
- Comparison baseline: `docs/benchmarks/pre-strava-map-2026-09-04.md`
- Production was not changed. The preview used the rebuilt static export and the
  current public production race payloads through a temporary local server.

The change is limited to the live-map source, one dependency-free browser
module, build inclusion for that module, and focused tests. No administrator,
OAuth, webhook, candidate, or direct Strava endpoint is called by the browser.

## Functional map comparison

| Observation | Pre-Strava production baseline | Updated local preview |
|---|---:|---:|
| State shapes | 51 | 51 |
| Race markers | 50 | 50 |
| Existing route paths before race | 3 | 3 |
| Runner image markers | 1 | 1 |
| RV image markers | 1 | 1 |
| Stored Strava activity paths | 0 | 0 |
| Warm map render observation | 161 ms | 232 ms |
| Browser console errors after map render | 0 | 0 |

The updated map remains empty at the top of a fresh page: no map SVG, topology
request, Strava module request, or public race request occurs before the map is
within 300 pixels of the viewport. When scrolled into view, static topology and
all existing markers render before the Strava module is imported. The 71 ms
difference between the two single warm observations is not a controlled timing
regression: the baseline used production hosting and a different browser run,
while the updated check used the repository's temporary local server.

After the map approaches view, the updated integration adds three requests to
the existing topology request:

- `/assets/strava-race-map.mjs`: 10,181 raw bytes; 3,023 bytes with gzip
- `/strava/public/races`: 6,075 bytes in the current 50-race pre-race payload
- `/strava/public/race-status`: 168 bytes in the current pre-race payload

Both API responses validated successfully. They reported 50 ordered scheduled
races, an inactive race window, zero completed races, and no activity data.
There is no pre-race polling.

## Lighthouse comparison

Lighthouse 13.4.1 and Chrome were run once per preset against the rebuilt local
preview. Times are milliseconds. TBT is the lab responsiveness proxy.

| Profile | Source | Performance | A11y | Best Practices | SEO | FCP | LCP | Speed Index | TBT | CLS | Requests | Weight KiB | Console / failed |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Mobile | Production baseline | 96 | 100 | 77 | 100 | 1,473 | 2,527 | 3,425 | 10 | 0.0114 | 53 | 1,517.1 | 0 / 0 |
| Mobile | Updated local preview | 60 | 97 | 77 | 100 | 6,153 | 13,953 | 6,153 | 0 | 0.0044 | 44 | 6,604.8 | 0 / 0 |
| Desktop | Production baseline | 98 | 100 | 77 | 100 | 658 | 941 | 1,299 | 0 | 0.0091 | 48 | 2,917.7 | 0 / 0 |
| Desktop | Updated local preview | 82 | 96 | 77 | 100 | 1,362 | 2,523 | 1,362 | 0 | 0.0001 | 36 | 4,727.9 | 0 / 0 |

These absolute Lighthouse totals are not directly comparable. The pre-change
benchmark records that current production uses a newer split, compressed asset
set that is absent from this repository. The local preview serves the older
monolithic HTML and multi-megabyte image set without production compression or
CDN behavior. That difference dominates transfer weight and LCP. Lighthouse
made zero requests to either Strava endpoint and zero requests for the new
module during its initial-load audits, so the Strava integration did not enter
the measured critical path.

The local accessibility deductions came from existing route-card color
contrast and existing accessible-name mismatches. The new hidden race status
was present, readable, and did not appear in any accessibility failure.

## Polling, fallback, and safety checks

- An initial snapshot requires both public endpoints to return valid JSON and a
  complete, uniquely numbered 50-race schedule.
- A timeout, non-200 response, malformed payload, incomplete schedule, or count
  mismatch keeps all 50 static stops and logs one fixed warning without details.
- API schedule fields join to retained static coordinates by `raceId`, with
  `raceNumber` as fallback. City-name matching is not used.
- During the operational window only, refreshes run 45 seconds after the prior
  request finishes. Concurrent refresh calls coalesce. Polling pauses while the
  page is hidden and resumes when it becomes visible.
- Before and after the operational window, no refresh timer is installed.
- Stored summary polylines are decoded locally and rendered with the existing
  completed-route class. A completed activity without a polyline still updates
  status and leaves map rendering intact.
- The browser module contains only the two public Strava URLs and no token,
  credential, private configuration, or administrator route.

## Assessment

No functional, console, network-error, CLS, or critical-path regression was
found in the integration. The expected map-view request increase is three small
requests. A full replacement of the public site's current production assets
from this repository is still unsafe because the pre-change benchmark documents
production/repository drift. The reviewed map HTML and new public module are
ready to be merged into the authoritative production asset set before release.
