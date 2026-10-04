# Mission window production validation — 2026-09-10

## Result

**PASS / COMPLETE**

The coordinated Team Goodwin mission-window release is loaded and healthy in
production. No rollback was required.

## Release identity and deployment scope

- Implementation commit: `85c814c35e5d62d84ce487f8ddad52c85736a8b4`
- Runtime-diagnostic validation commit: `7ae20c28dfa69040d74aacb3d75b523ac13a3b03`
- Authoritative start: `2026-10-09T09:00:00-04:00`
- Authoritative end: `2026-11-01T23:59:59-05:00`
- Production backend: `/home/goodfjcw/goodwin-node-test/lib/race-window.mjs`
- Production map module: `/home/goodfjcw/public_html/assets/strava-race-map.mjs`
- Production tracker: `/home/goodfjcw/public_html/assets/tracker-base.js`

| Production file | Approved SHA-256 | Bytes |
| --- | --- | ---: |
| `goodwin-node-test/lib/race-window.mjs` | `43144d0e7d0bdca9e62b1b92ee89ad89695dad13244f44e7741634d7657978d0` | 2,296 |
| `public_html/assets/strava-race-map.mjs` | `7a0d5f7f6f4ff4a733670df6c2c1a4b0daa0a55d9c6f4972b45ef48ad685b31d` | 15,109 |
| `public_html/assets/tracker-base.js` | `3acba0931937b41d78fd4cca318772c96f3beead5bfceb0836738ff17fefcc4a` | 84,793 |

The two public assets were retrieved with cache-busted production requests and
matched the approved hashes exactly. The backend candidate had already passed
its upload hash gate and the loaded module was then proven independently by the
authenticated runtime diagnostic.

## Passenger reload and authenticated runtime proof

The first cPanel **Restart** action did not recycle the Passenger worker. The
generation, PID, and process start stayed unchanged while uptime increased, and
`tmp/restart.txt` did not receive a new timestamp. Validation remained paused.

The operator then used the dedicated cPanel **Stop**, waited for the application
to report Stopped, selected **Start**, and waited for Started. The authenticated
`/strava/admin/runtime-status` response immediately reported:

- `releaseGeneration`: `8036941077bd893dc8a80e3b405ede153b7a766cde4f5dd94f6ceb2b624c8e86`
- `pid`: `4157741`
- `processStartedAt`: `2026-09-10T06:20:08.740Z`
- `processUptimeSeconds`: `2`
- `raceWindowStart`: `2026-10-09T09:00:00-04:00`
- `raceWindowEnd`: `2026-11-01T23:59:59-05:00`
- `raceWindowModuleVersion`: `fbfda6c22891845d686a2bce51c3f281caf9352e71086cbb95395c2f28608169`

This is a new process relative to the pre-reload generation
`32ae7bafc33f85b5880933c8cb911db419d636cc71a826662f550b4db5ea617d`,
PID `3911101`, and start time `2026-09-10T05:39:07.634Z`. It proves that the
successful Stop/Start loaded the approved mission-window module. No credentials,
tokens, paths, configuration values, or database details were exposed by the
diagnostic response.

## Public cache convergence and API regression

Cache-busted and `Cache-Control: no-cache` production reads, followed by the
matched-method benchmark read, returned the converged public state:

```json
{
  "active": false,
  "raceWindowId": "ggma-2026",
  "raceWindowStart": "2026-10-09T09:00:00-04:00",
  "raceWindowEnd": "2026-11-01T23:59:59-05:00",
  "completedRaces": 0,
  "totalRaces": 50
}
```

- `/strava/public/races`: HTTP 200; 50 ordered races.
- `/strava/public/race-status`: HTTP 200; corrected window; inactive pre-race.
- `/strava/public/tracking-status`: HTTP 200; sanitized stale projection with
  only `available`, `observedAt`, `position`, and `stale` fields.
- `/strava/status`, `/strava/connect`, and anonymous
  `/strava/admin/runtime-status`: HTTP 401.
- Historical `/strava/health`: unchanged HTTP 404 `not_found`; not a blocker.

## Mission Clock, HAPN, and deterministic boundaries

Fresh production Chrome sessions showed `Countdown to race day`, a running
countdown, no visible `RACE IS ON`, no map SVG before the lazy-load boundary,
and zero frontend HAPN requests. The RV therefore remains on its static pre-race
fallback.

The exact deployed candidate was validated under Node.js 22.23.2:

| Instant | Mission Clock | Backend | HAPN | Static fallback |
| --- | --- | --- | --- | --- |
| Oct. 9, 08:59:59 EDT | countdown `00:00:00:01` | inactive | ineligible | pre-race position |
| Oct. 9, 09:00:00 EDT | `RACE IS ON`, elapsed `00:00:00:00` | active | eligible | progression begins at 0 |
| During mission | counts upward | active | eligible | time-based progression continues |
| Nov. 1, 23:59:59 EST | `RACE IS ON`, final active second | active | eligible | progress 1 |
| Nov. 2, 00:00:00 EST | `MISSION COMPLETE`; display held and interval stopped | inactive | ineligible | final position |

The offset-aware instants and the DST-spanning duration produced identical
results in New York, Honolulu, Los Angeles, London, and Tokyo timezones. HAPN
polling remains disabled before the start and after completion.

## Map and site regression

Fresh isolated production Chrome validation at mobile and desktop sizes found:

- 51 states, 50 race markers, 3 core routes, and 5 flight paths.
- One Will marker and one RV marker.
- Key text `WILL / FLIGHT / RV`; moving markers contain no text nodes.
- RV frame `x=-30`, `y=-20`, `width=60`, `height=40`, with
  `preserveAspectRatio="xMidYMid meet"`.
- Corrected U.S. projection and Columbus/HAPN near-coincidence retained by the
  deterministic suite.
- Map remains lazy; its module and public APIs are absent before the map nears
  the viewport.
- Zero pre-race HAPN browser requests; static RV fallback retained.
- Footer structure and social links unchanged; no horizontal overflow.
- Canonical Spyroll logo loaded at its unchanged 491×104 natural dimensions.
- Mobile intro replay loaded all five slideshow images successfully.
- Zero console errors, broken rendered images, counted first-party request
  failures, or uncanceled network failures.
- All 16 clean production routes returned HTTP 200.

The full Node.js 22.23.2 suite passed **162/162**. The focused mission-window,
race-window, HAPN, live-map, and runtime-diagnostic group passed **25/25**.
`git diff --check` also passed.

## Benchmark

Matched-method values use the saved pre-release and final post-release Node.js
22.23.2/fresh-Chrome harnesses.

| Measurement | Pre | Post | Change |
| --- | ---: | ---: | ---: |
| Homepage median TTFB | 323 ms | 240 ms | -83 ms |
| Homepage median total | 324 ms | 240 ms | -84 ms |
| Homepage document body | 33,310 B | 33,310 B | unchanged |
| Homepage initial transfer | 1,200,801 B | 1,201,109 B | +308 B (0.026%) |
| Static map render | 2,542.0 ms | 2,711.2 ms | +169.2 ms (6.7%) |
| CLS before map | 0.0006903973 | 0.0006903973 | unchanged |
| CLS after map | 0.0007170777 | 0.0007170777 | unchanged |
| Races API total | 257 ms | 237 ms | -20 ms |
| Race-status API total | 671 ms | 679 ms | +8 ms |
| Tracking-status API total | 228 ms | 280 ms | +52 ms |

The small single-run map/API timing variation is not material: layout stability,
document size, map structure, request lifecycle, and functional behavior are
unchanged, while homepage timings improved.

## Rollback and deferred work

Rollback was not triggered. The coordinated three-file backups remain available
at `/private/tmp/team-goodwin-mission-window-production-backup-2026-09-10/`.
If a later release-specific failure requires recovery, all three files must be
restored together and Passenger must be recycled with the proven manual cPanel
Stop/Start procedure.

API #3 and the `Will > Flight > RV` provider-priority architecture remain
deferred and were not implemented by this release.
