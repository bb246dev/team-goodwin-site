# HAPN RV integration (API #2)

## Ownership and data flow

HAPN is API #2 and owns only the RV's observed live vehicle location. It cannot
change the static schedule, state/map geometry, planned flight legs, runner
location, or Strava race activity/completion.

```text
HAPN -> cPanel/Passenger server adapter
     -> GET /strava/public/tracking-status
     -> validated rvLocation domain patch
     -> normalized MapSnapshot
     -> existing map renderer
```

The authoritative runtime is the existing Namecheap/cPanel Passenger
application in `strava-app`. The browser never calls HAPN and the separate Sites
runtime is not the production owner of API #2.

## Server-only configuration

Store these values in cPanel's protected environment or the existing private
application configuration outside `public_html`:

```text
HAPN_CLIENT_ID=...
HAPN_CLIENT_SECRET=...
HAPN_DEVICE_IMEI=...
HAPN_STALE_AFTER_SECONDS=900
HAPN_RETENTION_SECONDS=21600
HAPN_PUBLIC_COORDINATE_DECIMALS=3
```

The first three values are required together and are secrets. They must never
enter Git, frontend assets, HTML, URLs, logs, archives, screenshots, or public
responses. The default freshness threshold is 15 minutes, the default retention
ceiling is six hours, and coordinates default to three decimal places.

## Public contract

A fresh result contains only:

```json
{
  "available": true,
  "stale": false,
  "observedAt": "2026-10-10T12:00:00.000Z",
  "position": { "lat": 40.831, "lng": -74.117 }
}
```

No provider name, configuration state, IMEI, account/device metadata, address,
speed, heading, battery, dashboard URL, OAuth credential, or bearer token is
public. An unavailable result is `{ "available": false }`. A failed or stale
read may retain the last valid position only until the configured retention
ceiling; after that ceiling, no public coordinates are returned and the browser
uses the static RV marker.

The route is GET-only, same-origin, rate limited in the Passenger process, and
uses a deliberately short shared-cache policy. Unsupported methods return 405.
No CORS access-control header is emitted.

## Upstream controls

The adapter uses only fixed HTTPS HAPN hosts, disables redirects, applies a
five-second timeout, caps authentication responses at 16 KiB and status
responses at 32 KiB, and enforces JSON content types. Device-status validation
requires a successful object response with an object result and own IMEI,
latitude, and longitude fields. It strictly cross-checks the string IMEI,
validates finite coordinate values and ranges, requires a valid observation
timestamp, and rejects unreasonable future timestamps. Documented or future
provider metadata is tolerated but ignored; it never enters the normalized
public projection. Authentication validation and bounded status/auth retries
remain unchanged. Provider bodies and credentials are never logged or returned.

The production-compatible schema correction changes only
`lib/hapn-tracking-core.mjs`. It does not add private failure-category logging;
the public and server behavior continue to fail closed without writing provider
bodies, credentials, identifiers, coordinates, or authorization data to logs.

## Production health-route parity note

The live-compatible HAPN server base intentionally retains the older production
Strava runtime. Its public `/strava/health` path currently returns 404. That is a
separate deployment/version-parity issue and is not changed by the HAPN schema
correction.

## Deployment scope

Do not upload the generated `dist` tree or deploy the Sites package. The
controlled cPanel candidate consists only of the updated Passenger application
runtime files, `/assets/strava-race-map.mjs`, and the controlled patch to the
authoritative `/assets/tracker-base.js`. Preserve all production HTML, CSS,
images, fonts, headers, static geometry, five planned flight paths, and rollback
copies.
