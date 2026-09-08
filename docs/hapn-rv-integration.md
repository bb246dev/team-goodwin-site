# Hapn RV integration

## Status

Implemented and tested, but inactive until the Sites runtime contains the three
required Hapn values. The website calls Hapn only from the server-side tracking
endpoint. No browser code or deployment artifact contains Hapn credentials.

The server-side adapter is at `integrations/hapn/hapn-tracking-core.mjs`. The
public endpoint is `/api/tracking-status`, and the live map uses its safe
`rvStatus` field. The browser refreshes that endpoint every two minutes while
the map is active and pauses while the page is hidden.

## Values still needed for activation

Obtain these before implementation:

- HAPN OAuth client ID
- HAPN OAuth client secret
- RV tracker IMEI
- Optional changes to the safe defaults: 15-minute stale threshold and
  coordinates rounded to three decimal places

Do not place credentials or the IMEI in browser code, static HTML, source
control, logs, screenshots, or URLs.

The Sites-hosted backend owns the Hapn connection. The cPanel Strava application
remains separate and receives no Hapn credentials.

## Server-side configuration

The adapter accepts these server-only values when it is eventually activated:

```text
HAPN_CLIENT_ID=...
HAPN_CLIENT_SECRET=...
HAPN_DEVICE_IMEI=...
HAPN_STALE_AFTER_SECONDS=900
HAPN_PUBLIC_COORDINATE_DECIMALS=3
```

All three credential/device values must be present together. The stale threshold
is optional and accepts 60–86,400 seconds. Public coordinate precision is
optional and accepts 2–5 decimal places; the default is 3.

## Public data contract

The adapter normalizes HAPN data to a deliberately limited object:

```json
{
  "source": "hapn",
  "configured": true,
  "active": true,
  "stale": false,
  "updatedAt": "2026-10-10T12:00:00.000Z",
  "lat": 40.831,
  "lng": -74.117
}
```

It omits the OAuth credentials, bearer token, IMEI, HAPN dashboard URL, and
street address. It also omits speed, heading, battery status, mileage, and other
device telemetry that the public map does not need. Stale or unavailable data
falls back to the map's planned/static RV marker.

## Activation checklist

1. Obtain the OAuth client ID, OAuth client secret, and tracker IMEI from Hapn.
2. Store them as Sites runtime variables; mark the client ID, client secret, and
   IMEI as secrets.
3. Save and deploy a new Sites version so the runtime revision is applied.
4. Verify `/api/tracking-status` returns an active, fresh `rvStatus` without any
   private Hapn fields.

## Adapter behavior already covered by tests

- OAuth client-credentials request and bearer-token use
- token reuse and one-time refresh after an authorization rejection
- coalescing concurrent status requests
- latitude/longitude validation and configurable public coordinate precision
- stale-location detection
- safe inactive behavior when configuration is absent
- rejection of partial or invalid configuration
- omission of private HAPN fields from normalized output
- safe static-map fallback and hidden-page polling pause
