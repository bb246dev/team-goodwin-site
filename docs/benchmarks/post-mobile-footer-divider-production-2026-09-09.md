# Mobile footer hierarchy release — post-deployment production benchmark

**Captured:** 2026-09-09T13:42:24.102Z

**Production:** <https://goodwingoodge.com>

**Implementation commit:** `0d9f9ccb4a1b19a14a1fb81b624f1379930c9493`

**Status:** **PASS**

## Before and after

| Measurement | Before | After | Change |
|---|---:|---:|---:|
| Median page TTFB | 252 ms | 287 ms | +35 ms |
| Median page total | 252 ms | 287 ms | +35 ms |
| Homepage TTFB | 286 ms | 284 ms | -2 ms |
| Homepage total | 287 ms | 285 ms | -2 ms |
| Homepage document body | 33,246 B | 33,246 B | unchanged |
| Homepage transfer | 1,198,563 B | 1,198,618 B | +55 B |
| Static map render | 2,472.6 ms | 2,472.9 ms | +0.3 ms |
| CLS | 0.0006904 | 0.0006904 | unchanged |

The nine-page median shifted by 35 ms in this external network sample while the
homepage improved by 2 ms, the map measurement changed by 0.3 ms, and CLS was
identical. This is ordinary request variability rather than evidence of a
material stylesheet regression. The 55-byte transfer change is limited to the
stylesheet response transfer accounting; the HTML document body was unchanged.

## Browser, map, and API checks

- All 16 clean routes passed at 375×812, 390×844, 430×932, 768×900,
  1024×900, and 1440×900: 96/96 route/viewport cases.
- Console errors: zero.
- Broken images: zero.
- Unexpected first-party failures: zero.
- Mobile slideshow: healthy with all five intro images and its logo loaded.
- Map: 51 state shapes, 50 race markers, 3 core routes, 5 flight paths, one
  runner marker, and one RV marker.
- Frontend HAPN requests before the race window: zero.
- `GET /strava/public/races`: HTTP 200 with exactly 50 races.
- `GET /strava/public/race-status`: HTTP 200 and inactive pre-race.
- `GET /strava/public/tracking-status`: HTTP 200 with its sanitized public
  projection.
- The protected tracker and map assets retained their approved SHA-256 values.

No production rollback was required.
