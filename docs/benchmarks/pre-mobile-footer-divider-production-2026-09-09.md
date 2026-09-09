# Mobile footer hierarchy release — pre-deployment production benchmark

**Captured:** 2026-09-09T13:26:23.048Z

**Production:** <https://goodwingoodge.com>

**Runtime:** Node.js 22.23.2 with fresh headless Chrome profiles

**Release base:** `a6fe12a7d026e0f9353d94b8d796a12f73edc7fc`

## Release gate

The production stylesheet was downloaded with cache bypassing before deployment.
Its SHA-256 was `9463e76c0df4222121f73714948a54ee5ae1e4ba42e67b6954252179c19c6659`
and its size was 7,571 bytes. The approved candidate SHA-256 is
`dbbd76a2765a3d40dd131a901ec30b5d75a0df60ea2abf28e8abcb2c7b925ccb`
and its size is 7,922 bytes.

The expanded authorization covers the complete mobile-only difference: primary
navigation first, the centered divider, and the centered WILL GOODGE / GOODWIN
social columns below it. Production HTML and all non-footer assets remain outside
the release.

## Production page baseline

- All 16 clean production routes returned HTTP 200.
- Median-of-page median TTFB: 252 ms.
- Median-of-page median total document time: 252 ms.
- Homepage median TTFB / total: 286 / 287 ms.
- Homepage document body: 33,246 bytes.
- Homepage fresh-profile transfer total: 1,198,563 bytes.
- Homepage observed CLS: 0.0006904.
- Nine representative browser page checks reported zero console errors, zero
  broken images, and zero unexpected first-party failures.
- Static map render after the near-viewport trigger: 2,472.6 ms.

## Map and API baseline

- Map: 51 state shapes, 50 race markers, 3 core routes, 5 flight paths, one
  runner marker, and one RV marker.
- Frontend HAPN requests before the race window: zero.
- `GET /strava/public/races`: HTTP 200 with exactly 50 races.
- `GET /strava/public/race-status`: HTTP 200, `active=false`, zero completed,
  and 50 total races.
- `GET /strava/public/tracking-status`: HTTP 200 with its minimized public
  projection.
- `GET /strava/health`: HTTP 404, the previously documented production
  routing/version-parity observation unrelated to this static stylesheet release.

## Local release validation

- Six-viewport, 16-route browser matrix: 96/96 passed.
- Full Node.js 22.23.2 suite: 145/145 passed.
- Root and Strava/HAPN production dependency audits: zero known vulnerabilities.
- No local console error, unexpected first-party failure, broken image,
  horizontal overflow, clipping, overlap, map regression, or pre-race HAPN
  request was observed.
