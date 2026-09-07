# Controlled Strava map merge validation — 2026-09-06

## Production authority and scope

The live responses from `/`, `/live-tracking/`, and `/live-tracking.html` were
byte-identical. Each returned the 29,388-byte production document with the
split production assets `tracker-base.js`, `ambient-scroll.js`,
`tracker-base.css`, `ambient-scroll.css`, and the deferred map stylesheet. The
document SHA-256 was
`edfe3abd43998cf94655c92a1a7cda8e1137bc5f37a50b4858e10b1689910d51`.

The authoritative map code is `/assets/tracker-base.js`; its pre-merge SHA-256
was `743faaf0d6c76c80e9ee50443bbe1d03f6589f1983c51b0e4376d08f64bc2faf`.
The repository's older monolithic export was not used as the production input.
No production resource was changed during this work.

The merge changes only that captured tracker asset and adds
`/assets/strava-race-map.mjs`. The production HTML and all other split assets
remain byte-for-byte outside the deployment set.

## Functional validation

The browser harness served the exact live HTML, proxied all unchanged resources
from production, and alternated between the captured production tracker and the
controlled candidate. A successful fixture used 50 ordered races with one
included, matched activity. Separate runs forced API failure and module failure.

| Check | Production baseline | Candidate success | API failure | Module failure |
|---|---:|---:|---:|---:|
| Initial map SVG before approach | 0 | 0 | 0 | 0 |
| Initial Strava requests | 0 | 0 | 0 | 0 |
| State shapes | 51 | 51 | 51 | 51 |
| Race markers | 50 | 50 | 50 | 50 |
| Core route paths | 3 | 3 | 3 | 3 |
| Existing flight paths | 5 | 5 | 5 | 5 |
| Runner / RV markers | 1 / 1 | 1 / 1 | 1 / 1 | 1 / 1 |
| Stored activity paths | 0 | 1 | 0 | 0 |
| Console errors | 0 | 0 | 0 | 0 |
| Broken images | 0 | 0 | 0 | 0 |
| Unexpected first-party failures | 0 | 0 | 0 | 0 |

The deliberate missing-module run produced its expected module 404. Both forced
failure cases retained the complete static map and emitted only the fixed
warning `Public race data unavailable; using the static schedule.` A canceled
Google Analytics beacon occurred in both baseline and candidate headless runs
after a successful 204 response; it is not a first-party or merge regression.

The current live public payloads also passed the production module validator:
50 races, IDs `ggma-2026-01` through `ggma-2026-50`, inactive race window, and
zero completed races.

## Lazy loading and request delta

The candidate keeps the production `700px` map IntersectionObserver gate.
Before approach, the map contained no SVG and the browser requested neither the
module nor either Strava endpoint. After approach, the production baseline
requested the deferred map CSS and topology; the candidate added exactly:

- `/assets/strava-race-map.mjs`
- `/strava/public/races`
- `/strava/public/race-status`

The static map is rendered before the dynamic module import and remains visible
if the import or either API request fails. The module validates a complete,
ordered 50-race response before replacing any static schedule data. Polling runs
only while the API reports the race window active, waits 45 seconds after the
prior request, coalesces concurrent refreshes, pauses while the page is hidden,
and resumes on visibility.

## Targeted performance comparison

This comparison uses the exact production tracker and candidate under the same
local proxy harness; it does not compare the older repository export's absolute
Lighthouse scores.

Across three paired observations, median time from map approach to the first
static SVG was 571.1 ms for production and 569.3 ms for the candidate, a
−1.8 ms (approximately −0.3%) delta. Network variance dominated the individual
samples because topology remained a production request. The candidate adds no
work to the initial LCP path.

Measured CLS was identical in the final paired pass:
`0.00034909562149853173` for both baseline and candidate. The activity refresh
reuses the existing SVG container and route classes, so it does not change the
map stage's box dimensions or page styling.

## Verification and limitations

- Full suite under Node 22.23.2: 96/96 passed.
- cPanel package integrity check: passed (19 runtime files, Node 22, one
  production dependency, required routes and migrations present).
- The tracker asset has a seven-day public cache policy. The smallest two-file
  rollout intentionally leaves HTML unchanged; immediate verification requires
  an incognito window or hard reload, while ordinary browser caches expire
  naturally.
- Browser timings are short lab observations and establish regression direction,
  not field performance. The pre-Strava benchmark remains the field comparison
  reference after deployment.
