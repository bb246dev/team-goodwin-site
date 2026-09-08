# TG-M01 health-endpoint remediation — 2026-09-07

## Status

**TG-M01: PASS — CLOSED.**  
**Final production validation:** 2026-09-07, approximately 11:07–11:20 AST  
**Production origin:** `https://goodwingoodge.com`

The prepared package was deployed manually before this validation. This final
validation was read-only: no runtime file, cPanel setting, database record,
configuration, GitHub setting, OAuth connection, webhook, commit, or deployment
was changed. Only this record and the authoritative audit were updated for
closure.

## Final production evidence

### Generic public health — PASS

An uncached request to `/strava/health` returned:

```text
HTTP/2 200
Cache-Control: no-store
Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
Content-Type: application/json; charset=utf-8

{"status":"ok"}
```

The body contains exactly one field. It does not disclose configuration,
dependency/module, connection-pool, database, Strava-configuration, exception,
path, credential, or token state.

The root `/health` path returned 404, and the former internal `/strava/api/health`
form returned 404. Production therefore exposes one health URL rather than a
second public alias.

### Retired diagnostics — PASS

All source/test-derived externally plausible legacy forms were checked with
no-cache headers and a unique query value:

| Production path | HTTP | Response |
| --- | ---: | --- |
| `/strava/health-startup` | 404 | `{"error":"not_found"}` |
| `/strava/api/health-startup` | 404 | `{"error":"not_found"}` |
| `/strava/node-test/health-startup` | 404 | `{"error":"not_found"}` |
| `/health-startup` | 404 | Generic LiteSpeed not-found page |
| `/api/health-startup` | 404 | Generic LiteSpeed not-found page |
| `/node-test/health-startup` | 404 | Generic LiteSpeed not-found page |

The three application-served 404 responses used JSON `not_found` bodies plus
the existing Strava API CSP, referrer, nosniff, and no-store/private headers.
None returned any former readiness field or startup category.

### Strava and access-control regression — PASS

- `/strava/public/races` returned HTTP 200 with exactly 50 sequential races,
  Hawaii first and New York last. All 50 remain scheduled and no activity result
  is exposed before the event.
- `/strava/public/race-status` returned HTTP 200 with `active:false`, the expected
  `ggma-2026` boundaries, `completedRaces:0`, and `totalRaces:50`.
- Same-origin CORS remained restricted to `https://goodwingoodge.com`; an
  `Origin: https://evil.example` request received no allow-origin header.
- `/strava/status`, `/strava/candidates`, and `/strava/connect` each returned
  HTTP 401 with the administrator Basic challenge and `{"error":"unauthorized"}`.
- A correctly shaped webhook verification GET with an intentionally invalid
  verifier returned HTTP 403 `strava_webhook_verification_failed`. This reached
  the existing verification handler without registering, acknowledging, or
  changing a webhook.
- The operator's authenticated manual check confirms William Goodge remains
  connected. Independent unauthenticated validation intentionally cannot reveal
  athlete identity or connection state; the protected boundary and full OAuth,
  state, token, callback, and rotation tests all passed.

### Production map regression — PASS

The active production assets remain byte-identical to the Phase 1 baselines:

```text
a6c9fea694c1bb73181ed1a9ca9801169326bd8194c576e453b2d4faf2928c54  /assets/tracker-base.js
7a750659403f256d7a5305b84f164da7a75041d362627e016c6e5457c9de9b80  /assets/strava-race-map.mjs
```

At the initial top-of-page position, an interactive production browser contained
no generated state, marker, route, runner, or RV nodes, confirming that the map
remained behind its near-viewport lazy gate. That persistent browser session had
a previously cached tracker response, so final completeness was independently
checked in a separate fresh-profile browser. The fresh run reported
`data-map-ready="true"` and rendered:

```json
{
  "stateShapes": 51,
  "raceMarkers": 50,
  "coreRoutePaths": 3,
  "flightPaths": 5,
  "runnerMarkers": 1,
  "rvMarkers": 1
}
```

The map accessibility label became `0 of 50 races completed`, proving that the
production public API snapshot was accepted. The rendered DOM contained no
static-fallback warning, and the interactive page reported no broken images. The
fallback, malformed-response, polling, and near-viewport paths also passed in the
focused test suite. The persistent-cache behavior was previously documented in
the Phase 1 validation and is not a TG-M01 regression.

### Final test and package gates — PASS

The exact test runtime was Node `v22.23.2`.

```text
Focused startup/security/cPanel-route/map/public-API tests: 40 passed, 0 failed
Full repository suite:                                  97 passed, 0 failed
cPanel package: 19 files, Node 22, one dependency, routes and migration present
```

No genuine test, package, or production-validation failure occurred.

## Remediation design

The Passenger application now has one external public health contract:

| Condition | Public URL | HTTP | Exact JSON body |
| --- | --- | ---: | --- |
| Initialization complete and database ping succeeds | `/strava/health` | 200 | `{"status":"ok"}` |
| Initialization incomplete or database ping fails | `/strava/health` | 503 | `{"status":"unavailable"}` |

Passenger may strip the `/strava` mount before invoking the application, so the
application also accepts the internal mounted form `/health`. That is one logical
cPanel route, not a second intended public endpoint. The prior internal
`/api/health` alias is no longer handled and returns 404.

Both health responses use `Cache-Control: no-store`, the existing Strava API CSP,
`Referrer-Policy: no-referrer`, and `X-Content-Type-Options: nosniff`. Their JSON
schema does not change with the failing component.

The four former startup diagnostic paths are explicitly retired before the
normal listener is available and continue to return 404 after initialization:

- `/health-startup`
- `/api/health-startup`
- `/node-test/health-startup`
- `/strava/health-startup`

The retired response is only `{"error":"not_found"}`. There is no redirect and
no second public startup endpoint.

Detailed startup failures remain available only through the existing sanitized
server-side stderr/Passenger log categories. The public readiness-state object
and its serialization were removed. No detailed admin HTTP route was retained
because there is no demonstrated operational need for one.

## Scope and files

Application/runtime source:

- `strava-app/app.js`
- `strava-app/README.md`

Tests and package validation:

- `tests/passenger-startup.test.mjs`
- `tests/strava-build.test.mjs`
- `scripts/check-strava-cpanel-package.mjs`

Security and deployment documentation:

- `docs/strava-integration.md`
- `docs/security/cis-owasp-audit-2026-09-07.md`
- this validation record

Generated cPanel output:

- `dist/goodwin-strava-api/`
- `/Users/micah/Desktop/goodwin-strava-api-tg-m01-2026-09-07.zip`

No website/map asset, OAuth flow, athlete credential, token handling, webhook,
race rule, public race API, database schema, Passenger shim, private config, or
administrator-authentication behavior was changed.

## Validation evidence

Required runtime:

```text
Node v22.23.2
```

Focused startup, health, cPanel-mount, and route regression suite:

```text
23 tests passed; 0 failed
```

Full repository suite:

```text
97 tests passed; 0 failed
```

The full suite includes map lazy-loading/static-fallback coverage, 50-race API
and schedule checks, public/admin route boundaries, OAuth, token rotation,
webhook, race-window, candidate, MySQL contract, and retained/stripped cPanel
mount tests.

cPanel package validation:

```text
cPanel package passed: 19 files, Node 22, one production dependency, routes and migration present.
```

Direct smoke test of the built `dist/goodwin-strava-api/app.js`:

```text
/strava/health         200  {"status":"ok"}
/health                200  {"status":"ok"}        (Passenger-stripped form)
/api/health            404  {"error":"not_found"}
/strava/health-startup 404  {"error":"not_found"}
```

The package checker now requires the generic health contract and every explicit
retired path, and rejects serialization of the former startup object or a
component-specific `database` success field.

The first sandboxed focused run could not bind loopback and reported `EPERM`.
This was a tooling restriction, not an application failure. The identical tests
were rerun with loopback access under Node 22.23.2 and passed 23/23; the full run
then passed 97/97.

## Security result

Automated healthy and failure-mode requests prove that unauthenticated health
responses do not disclose whether configuration loaded, `mysql2` loaded, a pool
was created, MySQL is reachable, Strava configuration is valid, or which startup
failure category occurred. The former diagnostic aliases return 404 during both
startup and initialized operation.

Sanitized internal logs still identify startup failure categories for operators.
They are not returned over HTTP and remain subject to the existing private
cPanel/Passenger log access boundary.

## Deployment artifacts

The ZIP contains the 19 allowlisted package files at its archive root; no
`node_modules`, test files, environment files, private config, website files, or
secrets are included. Archive integrity validation reported no errors.

```text
199973bbe410f5b7cda26783635b1da41b65f57ddd226f0d8d1c4e235cb997fd  /Users/micah/Desktop/goodwin-strava-api-tg-m01-2026-09-07.zip
49f5bb2d83f21bc45a592cf1285e953099103ae612a7a0c41a3e2409bc9a8dd0  dist/goodwin-strava-api/app.js
9b969b6855ca7be30cdae6f14cdfc68099cbb30fc45e46bffedcde87cc3a2a23  dist/goodwin-strava-api/passenger.cjs
da95ca1b3b0d09b99b50e733dd1e7a047f208cb239f068fa72c79edc77c89297  dist/goodwin-strava-api/package.json
a3f18e694c41c112da771a8918fc0506284d4fb5c0c0ba642cef6c65a4d8607a  dist/goodwin-strava-api/package-lock.json
```

`app.js` is the only changed executable runtime file. The complete reviewed ZIP
may be extracted into the existing `goodwin-strava-api` application root for a
reproducible deployment. No SQL import, schema migration, dependency change,
environment-variable change, private-config change, or athlete reauthorization
is required.

The deployment prerequisite was to change any cPanel or external uptime monitor
from `/strava/health-startup` to `/strava/health` and accept only the two
documented status/body combinations. Monitor configuration itself was not
inspected during this unauthenticated validation; the replacement endpoint is
live and ready for that contract.

## Closure decision

There are no remaining TG-M01 findings. The detailed public diagnostic is gone,
the replacement health contract is minimal and non-cacheable, legacy forms are
unavailable, and the Strava/map/access-control regressions pass. **TG-M01 is
CLOSED.**

The next recommended audit item is **TG-M03 — HSTS is absent across the origin**.
It requires a separately authorized, staged remediation and was not started by
this validation.
