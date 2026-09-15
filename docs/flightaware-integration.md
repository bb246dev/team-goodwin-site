# FlightAware AeroAPI v4 foundation

Prepared on 2026-09-15 for the Team Goodwin cPanel Node application. This is a
disabled integration foundation: it does not contain a FlightAware key, any
private-aircraft registration, active polling job, live provider call,
deployment, or public tracker redesign. The five verified pre-booked commercial
routes are configured, but their flight idents remain unknown and tracking is
disabled.

## What is implemented

The server-side flow is now:

```text
FlightAware AeroAPI v4 (future trusted refresh job only)
  -> server-only FlightAware service
  -> provider-neutral normalized flight state
  -> shared MySQL/MariaDB cache
  -> optional sanitized fields on /strava/public/race-status
  -> explicit browser tracking-source selector
```

The production browser never calls FlightAware. A public request never refreshes
FlightAware and therefore cannot multiply AeroAPI usage. Existing Strava and HAPN
routes, polling, response fields, and fallbacks remain unchanged.

## Reconciled Team Goodwin itinerary

The configured itinerary was reconciled from the previously supplied Team
Goodwin pre-booked schedule, the UTC-normalized records in
`api/flight-tracking-core.mjs`, the local-time production reference in
`production-merge/hapn-api2-production-base-patch-2026-09-09/public_html/assets/tracker-base.js`,
the current race schedule seed, and the five planned paths in
`source-html/live-tracking.html`. The explicit route, local times, timezones,
and airline records agree across the itinerary and production-reference
sources.

| Leg | Type | Origin-local departure | Arrival-local time | Airline | Ident | Registration | `faFlightId` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| HNL-ANC | Commercial | 2026-10-09 23:11 HST | 2026-10-10 07:22 AKDT | Alaska Airlines | Unknown | Not applicable | `null` |
| ANC-PDX | Commercial | 2026-10-10 15:51 AKDT | 2026-10-10 20:35 PDT | Alaska Airlines | Unknown | Not applicable | `null` |
| PDX-SLC | Commercial | 2026-10-11 17:15 PDT | 2026-10-11 20:10 MDT | Delta Airlines | Unknown | Not applicable | `null` |
| CMH-LAX | Commercial | 2026-10-20 19:03 EDT | 2026-10-20 21:11 PDT | American Airlines | Unknown | Not applicable | `null` |
| MIA-ATL | Commercial | 2026-10-24 16:21 EDT | 2026-10-24 18:24 EDT | Delta Airlines | Unknown | Not applicable | `null` |

`scheduledDate` records the origin-local departure date. The offset-bearing
source timestamps normalize to UTC in configuration, and the resolver uses the
normalized UTC departure day for provider matching. This keeps the HNL leg on
the correct October 9 local itinerary date even though it departs on October 10
UTC.

An older bundled schedule marks the Salt Lake City and Atlanta arrival modes as
`charter`, while the later explicit itinerary and production tracker name Delta
Airlines for both legs. The later, route-specific records are used here. That
older schedule also marks Little Rock and Miami arrivals as `charter`, but it
does not supply authoritative airport pairs, departure times, timezones, or
registrations for those transfers. They are not configured as FlightAware legs.
Team Goodwin must confirm those private-transfer details before they can be
added.

The five existing static flight paths correspond one-for-one with the five
configured legs above. They remain unchanged and continue to be the planned
visual geometry. Live FlightAware state may later augment those planned legs;
this change does not implement a visual fallback or modify map rendering.

## Authoritative configuration

Enter verified flight legs only in:

`strava-app/config/flight-legs.mjs`

`FLIGHT_LEGS` contains the five reconciled routes above. Every object must
contain:

| Field | Meaning |
| --- | --- |
| `id` | Unique stable leg ID |
| `type` | `commercial` or `private` |
| `scheduledDate` | Verified `YYYY-MM-DD` date |
| `scheduledDeparture` | ISO-8601 timestamp when known, otherwise `null` |
| `origin` | Verified IATA, ICAO, or supported airport code |
| `destination` | Verified IATA, ICAO, or supported airport code |
| `ident` | Commercial flight ident/number, otherwise `null` |
| `registration` | Private aircraft registration, otherwise `null` |
| `faFlightId` | FlightAware instance ID when resolved, otherwise `null` |
| `trackingEnabled` | Explicit boolean gate for this leg |
| `notes` | Internal note or `null` |

A private leg with both `registration: null` and `faFlightId: null` is valid.
The service returns a scheduled `registration_pending` state without making an
API request. Put a received registration into that leg's `registration` field;
do not create a second configuration source.

Enter explicit source windows only in:

`strava-app/config/tracking-sources.mjs`

`TRACKING_SOURCE_WINDOWS` remains intentionally empty. Commercial flight idents,
the unresolved charter/private-transfer conflict, and the commissioning window
policy must be confirmed before source selection can safely change. Outside a
configured window, `strava` remains authoritative. A window may explicitly
select `strava`, `flightaware`, `manual`, or `none`. A `flightaware` window must
name an existing flight leg. Windows cannot overlap, so the system never guesses
which source wins.

## Server service and live-mode gate

`strava-app/lib/flightaware/service.mjs` is designed around AeroAPI v4's fixed
HTTPS origin and `x-apikey` authentication. It supports:

- resolving a commercial ident with a bounded scheduled-date range;
- resolving a private registration with the same route/date checks;
- using an opaque `fa_flight_id` when one has already been confirmed;
- retrieving the latest flight status or current position;
- projecting departure, arrival, and ETA information from normalized state; and
- rejecting ambiguous matches instead of guessing.

The client has request timeouts, a response-size ceiling, JSON content-type
checks, disabled redirects, fixed-host/path checks, and sanitized errors. It is
disabled when `FLIGHTAWARE_API_KEY` is absent or malformed. Merely setting the
key does not start polling: no refresh job is wired in this pass.

FlightAware documents `GET /flights/{ident}` for an ident, registration, or
`fa_flight_id`, and `GET /flights/{id}/position` for the latest position. The
real account must be commissioned against the current official AeroAPI v4
documentation before production use:
https://www.flightaware.com/aeroapi/portal/documentation

## Normalized flight state

`strava-app/lib/flightaware/normalize.mjs` isolates Team Goodwin code from raw
provider response shapes. Its internal state contains:

- schema version, leg ID, provider, ident, registration, and `faFlightId`;
- origin, destination, and one of `scheduled`, `pre_departure`, `departed`,
  `en_route`, `landed`, `cancelled`, `diverted`, or `unknown`;
- scheduled/actual departure and scheduled/estimated/actual arrival timestamps;
- latitude, longitude, altitude in feet, groundspeed in knots, and track in
  degrees;
- last position time, last provider update time, availability, and freshness.

Missing provider fields normalize to `null`. Provider status text is mapped to
Team Goodwin's allowlisted statuses; it is never forwarded as UI markup. An
airborne flight can remain `en_route` while `trackingAvailable` is false, which
supports “flight in progress, position temporarily unavailable” behavior without
inventing a coordinate.

## Shared cache and API-cost protection

Migration `strava-app/migrations/007_flight_tracking_cache_mariadb.sql` adds the
shared `flight_tracking_cache` table. It stores only normalized state plus fresh,
retention, and update timestamps. This cache is shared across Passenger workers
and visitors.

`strava-app/lib/flightaware/cache.mjs` centralizes the future refresh policy:

| Phase | Current refresh eligibility interval |
| --- | ---: |
| Scheduled, not imminent | 6 hours |
| Within 6 hours of departure | 15 minutes |
| Departed/en route | 2 minutes |
| Landed/cancelled/diverted | 24 hours |
| Unknown/unavailable | 30 minutes |

These are constants, not active timers. A future trusted server job will call the
cache refresh method. It coalesces concurrent work within a process, reuses a
fresh shared record, and retains an eligible last-known record on provider
failure. Public `/race-status` handling calls only the cache read path and can
never invoke FlightAware.

## Public race API and browser source selection

With the shipped empty tracking-source schedule,
`/strava/public/race-status` is exactly the existing five-field response. No
field is renamed or removed.

During a future explicitly configured FlightAware source window, the response
may add `trackingSource: "flightaware"` and a minimal `flight` object containing
the leg ID, safe ident/route/status/times, availability/freshness, and an optional
normalized position. It omits the API key, raw response, `faFlightId`, cache
internals, notes, and private configuration. A cache or provider failure is
contained and cannot fail the race-status endpoint.

`assets/strava-race-map.mjs` accepts this optional extension and exports an
explicit `selectTrackingPosition` abstraction. It defaults to the current
Strava/static position when no source is present. It will select a flight
position only when the server explicitly says `flightaware` and supplies a fresh
valid position. This pass does not change the rendered marker or add FlightAware
browser polling.

## Failure behavior

- Missing key or disabled leg: normalized `not_configured`; no request.
- Private registration still TBD: normalized `registration_pending`; no error.
- Flight not found: normalized `flight_not_found`; no guessed match.
- Ambiguous candidates: sanitized internal error; no guessed match.
- No position: flight status remains usable with `trackingAvailable: false`.
- Stale position: retained internally as stale; not exposed as a live public
  coordinate.
- Rate limit, timeout, malformed/oversized response, or provider outage: no raw
  body or credential is returned; eligible cached state is retained.
- Cache/config failure: existing race-status response remains available.

## Security controls

- `FLIGHTAWARE_API_KEY` is loaded only by the cPanel server's existing private
  configuration allowlist and is included in startup log redaction.
- `.env`, `.env.*`, `.goodwin-strava-config.json`, and
  `goodwin-strava-config.json` remain gitignored; only blank examples are kept.
- The API key, provider client, and raw provider responses are absent from the
  static website build.
- Outbound calls are HTTPS-only to the fixed AeroAPI hostname, with redirects
  disabled, bounded response size, bounded duration, and no user-controlled URL.
- Existing CSP, same-origin CORS behavior, health response, authentication, and
  security headers are unchanged.

## Enabling later

Do not enable live use by setting a key alone. Complete these steps in order:

1. Confirm the selected FlightAware plan and license permit the intended public
   display, caching, precision, and retention.
2. Obtain the AeroAPI v4 key and add `FLIGHTAWARE_API_KEY` to the private
   `/home/goodfjcw/.goodwin-strava-config.json` file, never to the repository or
   `public_html`.
3. Add the verified commercial flight idents, resolve the outstanding private
   transfer details, and explicitly enable only approved legs in
   `strava-app/config/flight-legs.mjs`.
4. Import migration 007 into the production MariaDB database.
5. Commission each endpoint against a non-production/live AeroAPI key: confirm
   ICAO/IATA ident behavior, date-range limits, airport code formats, field/tier
   availability, blocked/private-aircraft behavior, cancellation/diversion
   shapes, rate-limit headers, and real response sizes.
6. Add a trusted server-side cron/background refresh job that calls the shared
   cache. Do not attach provider refreshes to public requests.
7. Tune the centralized phase intervals against the paid plan and observed
   limits, then add explicit source windows in
   `strava-app/config/tracking-sources.mjs`.
8. Exercise scheduled, airborne, no-position, stale, landed, cancelled,
   diverted, rate-limited, and outage cases before deployment.
9. Make and approve any visitor-facing copy/marker change as a separate tracker
   UI change.

## Information Team Goodwin must provide

For every commercial leg:

- commercial airline/flight ident, preferably the unambiguous ICAO ident;
- scheduled date;
- origin and destination airport codes;
- scheduled departure timestamp with timezone/UTC offset when known; and
- confirmed `fa_flight_id` later, if operations resolve it in advance.

For every private leg:

- scheduled date;
- origin and destination airport codes;
- scheduled or approximate departure timestamp with timezone/UTC offset;
- registration/tail number when received (it may remain `null` until then); and
- confirmed `fa_flight_id` later if available.

For both types, provide the intended source-switch start/end times and whether
tracking is approved for public display. No value should be inferred from a map
label, carrier name, city pair, or approximate legacy animation.
