# Team Goodwin footer release — pre-deployment production benchmark

**Captured:** 2026-09-09T05:04:33.489Z

**Production:** <https://goodwingoodge.com>

**Runtime:** Node.js 22.23.2 with fresh headless Chrome profiles

**Release base:** `a250a3c11def68bbc7fe6e40ab2c655e491202ac`

## Release gate

The 16 current production HTML responses were downloaded with cache bypassing and
were byte-identical to the preserved production snapshot used for the approved
footer preview. The controlled candidate is therefore exactly current production
HTML plus the deterministic footer-only transformation. No unrelated HTML drift
was found.

The approved local browser matrix passed 48 page/viewport cases at 375x812,
390x844, 430x932, 768x900, 1024x900, and 1440x900. It reported no console errors,
broken images, horizontal overflow, clipping, overlap, or unexpected first-party
request failures. All six mobile social links were visible, both website labels
remained on one line, and the mobile slideshow loaded its five exact production
images and logo.

## Production page and browser baseline

- Nine representative production pages returned HTTP 200.
- Median-of-page median TTFB: 272 ms.
- Median-of-page median total document time: 272 ms.
- Homepage median TTFB / total: 288 / 289 ms.
- Homepage document body: 29,388 bytes before the footer release.
- Homepage initial transfer total in the fresh 390x844 profile: 1,196,949 bytes.
- Homepage observed CLS: 0.0006904.
- Nine browser page checks: zero console errors, zero broken images, and zero
  counted network failures.
- The map remained lazy at initial load. Its measured near-viewport render was
  2,458.4 ms in this network sample; this is a comparison point, not a budget.

## Map and API baseline

- Map: 51 state shapes, 50 race markers, 3 core routes, 5 flight paths, one
  runner marker, and one RV marker.
- Frontend HAPN requests before the race window: zero.
- `GET /strava/public/races`: HTTP 200 with exactly 50 races.
- `GET /strava/public/race-status`: HTTP 200, `active=false`, zero completed,
  and 50 total races.
- `GET /strava/public/tracking-status`: HTTP 200 with the minimized public
  projection; its stale provider position has no pre-race frontend effect.
- The historical `/strava/health` path currently returns the sanitized HTTP 404
  `not_found` response. This is a pre-existing production observation; all three
  public Strava/HAPN endpoints used by the site are healthy. The footer release
  does not touch Passenger or backend files.

## Release scope

Only footer-patched copies of current production HTML and
`assets/footer-social.css` are eligible for deployment. Tracker, map, Strava,
HAPN, database, credentials, headers, and all other production assets remain
outside the release.
