# HAPN API #2 Production Validation

**Validation date:** 2026-09-08/09

**Production site:** `https://goodwingoodge.com`

**Method:** read-only HTTP, fresh-profile browser, and local deterministic tests

**Decision:** **PASS / COMPLETE**

## Executive decision

The HAPN server-side endpoint is live, healthy, minimized, and safely stale before the race window. Cache-busted production downloads match the corrected controlled frontend candidate exactly. The production map, Strava integration, pre-race HAPN gate, security controls, and deterministic race-window/failure matrix all pass.

HAPN API #2 is complete and production-ready. This validation did not modify production or start API #3. API #3 may proceed separately only after its own architecture intake and provider-specific security checkpoint.

HAPN owns only the normalized `rvLocation` domain. Its inclusive operational
window is `2026-10-09T00:00:00-04:00` through
`2026-11-01T23:59:59-05:00`.

## Production asset identity

| Asset | Production SHA-256 | Size | Result |
| --- | --- | ---: | --- |
| `/assets/tracker-base.js` | `570b8f8431f2202b383d5ce7b74f1027e9dd35ef66adb94a57568f2ed7c26931` | 83,264 bytes | Exact corrected candidate |
| `/assets/strava-race-map.mjs` | `4d8b6e1b33b701651fa5219e5a12736dee5d0605ac7810fa8a1d1eb427629dae` | 15,109 bytes | Exact corrected candidate |

Unique cache-busted production requests returned these identities. Both files are byte-identical to the controlled candidate that passed the deterministic browser matrix.

The exact deployed frontend bytes are preserved under
`production-merge/hapn-api2-production-base-patch-2026-09-09/public_html/assets/`.

## Production-compatible backend identity

The backend remains the three-file HAPN-only overlay based on the actual live
Strava checkpoint `4c0526b72282d5d681639285ead91b709cc410d6`, preserved under
`production-merge/hapn-api2-live-compatible-2026-09-09/goodwin-strava-api/`.
That overlay does not import `resumeWebhookEvents` and does not require the newer
TG-M05 runtime or migrations. Its corrected `lib/hapn-tracking-core.mjs` is
12,832 bytes with SHA-256
`52832c19369476390a003a6da72f71fea1d06e0a3bea2f021303a36ac25ac5ed`.

The public backend endpoint is `GET /strava/public/tracking-status`.

## Pre-race production acceptance

The fresh-profile browser check passed for the corrected production frontend:

- the map remained lazy and made no provider request before approaching the map;
- the static RV marker was visible at the known-good baseline position;
- HAPN frontend request count was zero;
- no stale HAPN position was applied;
- race status was inactive for the configured window beginning `2026-10-09T00:00:00-04:00`;
- map structure was 51 state shapes, 50 race markers, three core routes, five flight paths, one runner marker, and one RV marker;
- no browser console errors, broken first-party images, or unexpected first-party request failures were observed.

The browser requested only the existing Strava public races and race-status resources after map activation. The corrected frontend's HAPN endpoint path is present, but the pre-race gate correctly prevented that request.

## Strava regression

Read-only production responses passed:

- `GET /strava/public/races`: HTTP 200, exactly 50 races;
- `GET /strava/public/race-status`: HTTP 200, inactive pre-race with the expected window and `0/50` completion state;
- current activity/completion rendering agreed with the public snapshot;
- anonymous requests to `/strava/status`, `/strava/connect`, and `/strava/candidates` returned HTTP 401;
- the current map retained the established static fallback and lazy-loading behavior.

## HAPN backend

`GET /strava/public/tracking-status` returned HTTP 200 with only:

- `available`;
- `stale`;
- `observedAt`; and
- `position` containing only latitude and longitude.

At validation time the response was available but stale. That state is harmless before the race window because the corrected browser contract is required to leave the static RV in place and avoid the request entirely.

The response exposed no credential, device identifier, provider/account metadata, authorization material, or raw provider response. Untrusted and nominal Origin probes received no CORS grant. The first-party response included a same-origin resource policy, `nosniff`, a restrictive endpoint CSP, `no-referrer`, HSTS, and a deliberately short shared-cache policy (`s-maxage=30`, `stale-while-revalidate=30`).

## Deterministic race-window and failure isolation

The controlled corrected candidate passed all 16 browser scenarios locally:

- one second before start: no HAPN request and static RV;
- exact start: fresh HAPN data eligible;
- during the window, fresh data moved the RV;
- during the window, stale, unavailable, malformed, or timed-out HAPN data retained the static RV;
- exact end: fresh data still eligible;
- one second after end: no HAPN request and static RV;
- malformed or unavailable authoritative race status failed closed to static RV;
- HAPN and Strava healthy: provider ownership remained isolated;
- HAPN failed while Strava remained healthy: Strava continued and the RV remained;
- Strava unavailable with otherwise fresh HAPN: race-window authority failed closed, so the RV remained static;
- all live providers unavailable: the complete map and RV remained usable;
- hidden-page scheduling coalesced work and did not replay missed polls as a burst.

The production files are byte-identical to the controlled candidate covered by these results.

## Performance

Corrected production passed with zero provider requests on initial page load, zero HAPN LCP work, no additional module waterfall, and a lazy map. HAPN activates only at the existing map/provider gate and in an eligible race window. The controlled comparison measured the corrected pre-race static render at 878.5 ms versus 881.6 ms for the known-good baseline, with identical measured CLS and no hidden-tab catch-up burst.

## Security result

The HAPN-specific production checks passed for secrets, public-data minimization, same-origin access, endpoint headers/cache behavior, and absence of a browser path to provider credentials. Local tests cover strict public schema handling, safe fallback, timeout behavior, timestamp validation, retention, scheduler isolation, and DOM-safe numeric map inputs. Dependency audits reported zero vulnerabilities, and credential/identifier scans found no operational HAPN secret in the inspected frontend or repository artifacts.

The site-wide HTML response still does not emit a CSP and HSTS remains at its existing one-day policy. These are unchanged pre-existing browser-header findings, not regressions introduced by HAPN. The HAPN JSON endpoint itself emits a restrictive CSP and the existing HSTS header.

## Test evidence

- Preservation-focused HAPN, live-overlay, Passenger, race-window, multi-provider, map, and Strava suite: **58/58 passed**.
- Full staged-snapshot Node 22.23.2 preservation suite: **141/141 passed**.
- Controlled corrected-candidate browser matrix: **16/16 passed**.
- HAPN production-base frontend unit suite: **8/8 passed**.
- Map, Strava, HAPN backend/frontend, race-window, multi-provider, Passenger/package, and failure-isolation coverage passed within the full suite.
- Root and Strava package dependency audits: **0 vulnerabilities**.
- Secret scan: **passed** without printing protected values.
- `git diff --check`: **passed**.

## Remaining findings and release decision

No HAPN-specific blocking finding remains. The visible pre-race RV is intentionally the static baseline marker; production will not request or apply HAPN until the validated race authority is active within the inclusive operational window.

HAPN API #2 is complete and production-ready. The unchanged site-wide CSP/HSTS observations remain tracked as pre-existing browser-header work and are not HAPN regressions. From the API #2 gate, it is safe to proceed to API #3 planning, but API #3 must remain a separate, unimplemented provider until its own Section 14 intake, security review, tests, and isolated deployment gate are complete.
