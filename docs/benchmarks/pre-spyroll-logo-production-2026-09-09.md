# Spyroll footer-logo release — pre-deployment production benchmark

**Captured:** 2026-09-09T18:28:49.423Z

**Production:** <https://goodwingoodge.com>

**Runtime:** Node.js 22.23.2 with fresh headless Chrome profiles and cache disabled

## Route baseline

All 16 current clean routes returned HTTP 200:

`/`, `/the-run/`, `/will/`, `/fifty-runs/`, `/live-tracking/`,
`/athletes/`, `/partners/`, `/updates/`, `/week-1/`, `/week-2/`,
`/week-3/`, `/faq/`, `/privacy/`, `/terms/`,
`/participation-terms/`, and `/accessibility/`.

## Measurements

| Measurement | Pre-deployment |
|---|---:|
| Median page TTFB | 270 ms |
| Median page total | 271.5 ms |
| Homepage median TTFB | 290 ms |
| Homepage median total | 290 ms |
| Homepage document body | 33,246 B |
| Homepage initial transfer | 1,198,618 B |
| Static map render | 2,289.5 ms |
| Homepage CLS | 0.0006903973 |

The 16-page fresh-profile browser baseline reported zero console errors, zero
broken images, and zero counted first-party request failures.

## Map, Strava, and HAPN baseline

- Map ready: yes.
- State shapes: 51.
- Race markers: 50.
- Core routes: 3.
- Flight paths: 5.
- Runner marker: visible.
- RV marker: visible.
- Pre-race HAPN frontend requests: 0.
- `GET /strava/public/races`: HTTP 200 with 50 races.
- `GET /strava/public/race-status`: HTTP 200, inactive, 0 of 50 completed.
- `GET /strava/public/tracking-status`: HTTP 200 with the sanitized public
  tracking projection.

The historical `/strava/health` path returned the existing sanitized HTTP 404
`not_found` response. This is a pre-existing route observation; the three
public Strava/HAPN endpoints used by the site were healthy. This release does
not touch Passenger or any backend file.

## Release gate

The 16 cache-bypassed live HTML responses matched the approved candidate after
applying only the Spyroll image-reference replacement and the one dedicated
Spyroll sizing-stylesheet reference. No nested `*/index.html` alias is in the
deployment allowlist.
