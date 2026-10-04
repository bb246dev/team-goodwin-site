# Team Goodwin Live Map Multi-API Architecture

**Date:** 2026-09-07

**Status:** HAPN API #2 is live and passed final production acceptance; API #3 remains unimplemented and subject to its own intake and security checkpoint

**Scope:** Browser-side normalization, source ownership, failure isolation, polling, security controls, tests, and performance gates for the Team Goodwin live map

**Production baseline:** `https://goodwingoodge.com`

## 1. Purpose and non-goals

This architecture makes the current Strava integration and HAPN API #2 inputs to a normalized map-data layer, with API #3 reserved for later work. Provider payloads must terminate at an adapter boundary. Map rendering and DOM code consume only a validated, provider-neutral snapshot.

API #2 is HAPN and owns only the RV's observed live vehicle location. API #3 remains unassigned and unimplemented. HAPN cannot overwrite the static schedule or geometry, Strava activity/completion, planned flight data, or runner location.

The normalized ownership key is `rvLocation`. Production polling is bounded to
the inclusive operational window `2026-10-09T09:00:00-04:00` through
`2026-11-01T23:59:59-05:00`. Outside that window, and whenever HAPN is stale,
unavailable, invalid, or unauthorized by valid race status, the known-good
static RV remains authoritative.

The invariant is:

> The versioned static map renders first and remains complete. Every network source is an optional enhancement. A failed, slow, malformed, stale, or unavailable provider cannot prevent that static render or erase valid data from another source.

## 2. Current production map contract

### 2.1 Static schedule and geometry

The current tracker owns a 50-race static schedule. Each stop contains:

| Field | Current meaning |
| --- | --- |
| `n` | Race number, 1 through 50 |
| `state` | State display name |
| `abbr` | State abbreviation used by the static presentation |
| `city` | Race city |
| `date` | Display date such as `Oct 9` |
| `lat`, `lng` | Static map anchor coordinates |

The Strava adapter derives the stable race identifier `ggma-2026-NN`. The static fallback presents every race as `status: "scheduled"` with `activity: null`.

The static map also owns:

- the `/assets/us-states-albers-10m.json` topology and the expected 51 state shapes;
- 50 race marker anchors;
- three core route paths (future, completed, and RV route layers);
- five planned flight legs: HNL-ANC, ANC-PDX, PDX-SLC, CMH-LAX, and MIA-ATL;
- the default runner and RV marker inputs; and
- the complete visual fallback when dynamic code or data is unavailable.

The default race-window/status object is:

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

Legacy browser tracking globals are not part of the provider contract. HAPN emits a validated `rvLocation` domain patch, the ownership-aware reducer creates a new normalized `MapSnapshot`, and rendering reads the normalized model.

### 2.2 Strava public races

`GET /strava/public/races` returns `{ "races": [...] }`. The client accepts a complete, ordered set of exactly 50 races. Each race currently provides:

- `raceId`: unique `ggma-2026-NN` identifier;
- `raceNumber`: exact ordinal 1 through 50;
- `date`: `YYYY-MM-DD`;
- `state` and `city`;
- `status`: `scheduled` or `completed`; and
- `activity`: absent for scheduled races and present for a completed race.

A completed `activity` may contain:

- `stravaActivityId`, a decimal string;
- `startTime`, a parseable timestamp;
- nullable non-negative `distanceMeters`, `movingTimeSeconds`, `elapsedTimeSeconds`, and `elevationGainMeters`;
- nullable encoded `summaryPolyline`; and
- nullable `startLatLng` and `endLatLng` coordinate pairs.

The browser joins by `raceId`; `raceNumber` exists as a compatibility fallback. Static `abbr`, `lat`, and `lng` preserve the trusted map geography. A valid activity polyline is decoded in the browser and geographically anchored to the corresponding static race.

### 2.3 Strava race status

`GET /strava/public/race-status` provides:

- `active`;
- `raceWindowId`;
- `raceWindowStart` and `raceWindowEnd`;
- `completedRaces`; and
- `totalRaces`.

The client requires the known race window, `totalRaces: 50`, bounded counts, and agreement between `completedRaces` and the number of completed races in the races response.

The current public Strava contract does not expose an explicit observation or record-update timestamp. An activity `startTime` is the event time, not proof of snapshot freshness. A future normalized adapter can record when a valid snapshot was received, but must not mislabel that time as a provider observation.

### 2.4 Current load, refresh, and fallback behavior

- The complete static map renders without waiting for Strava.
- Dynamic map code and the two Strava requests are deferred until the map approaches the viewport.
- The races and status requests use a five-second request timeout and are validated as one atomic Strava snapshot.
- Failure of either response, schema validation, count/order checks, or cross-response consistency produces the complete static snapshot.
- A signature prevents unnecessary redraws when map-relevant data has not changed.
- During an active race window, refresh occurs 45 seconds after the previous load completes, so polls do not overlap.
- Refresh pauses while the document is hidden and resumes when visible.
- A refresh failure retains the last good dynamic view; it does not replace it with incomplete data.
- Outside the active race window, Strava refresh polling stops.

These behaviors are compatibility requirements for the first implementation of the multi-source coordinator.

## 3. Normalized map model

### 3.1 Boundary and flow

```text
versioned static data -----------------------+
                                               \
first-party Strava endpoints -> Strava adapter  \
first-party RV endpoint -> HAPN API #2 adapter ---> validated domain patches
future first-party endpoint -> API #3 adapter  /            |
                                                            v
                                               ownership-aware reducer
                                                            |
                                             immutable MapSnapshot
                                                            |
                                            map renderer / safe DOM view
```

There are four separations:

1. **Transport:** fetches first-party endpoints and applies timeout/cancellation rules.
2. **Provider adapter:** strictly validates one provider contract and emits domain patches or a typed failure; it never touches the map or DOM.
3. **Coordinator/reducer:** applies ownership, timestamp, and staleness rules to static data and last-known-good provider state.
4. **Renderer:** receives one normalized, immutable snapshot and has no knowledge of provider response shapes.

### 3.2 Proposed `MapSnapshot`

The exact TypeScript or JSDoc representation can be chosen during implementation, but the conceptual contract is:

```js
{
  schemaVersion: 1,
  generatedAt: "ISO-8601 Goodwin aggregation time",

  schedule: {
    source: "static",
    editionId: "ggma-2026",
    races: [{
      raceId: "ggma-2026-01",
      raceNumber: 1,
      state: "...",
      stateCode: "...",
      city: "...",
      scheduledDate: "YYYY-MM-DD",
      displayDate: "...",
      geometry: { anchor: { lat: 0, lng: 0 } }
    }]
  },

  athleteActivities: {
    byRaceId: {
      "ggma-2026-01": {
        raceId: "ggma-2026-01",
        source: "strava",
        sourceRecordId: "...",
        observedAt: null,
        updatedAt: null,
        receivedAt: "ISO-8601",
        startTime: "ISO-8601",
        phase: "completed",
        metrics: {
          distanceMeters: null,
          movingTimeSeconds: null,
          elapsedTimeSeconds: null,
          elevationGainMeters: null
        },
        route: {
          encoding: "google-polyline5",
          encoded: "...",
          start: null,
          end: null
        }
      }
    }
  },

  liveLocations: {
    byEntityId: {
      "runner:will": {
        entityId: "runner:will",
        entityType: "runner",
        source: "provider-id",
        observedAt: "ISO-8601",
        updatedAt: "ISO-8601 or null",
        receivedAt: "ISO-8601",
        position: { lat: 0, lng: 0, accuracyMeters: null },
        routeProgress: null,
        freshness: "fresh"
      }
    }
  },

  logistics: {
    byEntityId: {
      "vehicle:rv": {
        entityId: "vehicle:rv",
        entityType: "vehicle",
        source: "provider-id-or-static",
        observedAt: null,
        updatedAt: null,
        receivedAt: null,
        plannedPathStops: [3, 4, 5, 6],
        position: null,
        routeProgress: 0.64,
        freshness: "static"
      }
    }
  },

  progress: {
    source: "strava-or-static",
    active: false,
    raceWindowId: "ggma-2026",
    raceWindowStart: "ISO-8601",
    raceWindowEnd: "ISO-8601",
    completedRaces: 0,
    totalRaces: 50,
    observedAt: null,
    receivedAt: "ISO-8601 or null",
    freshness: "fresh-or-static"
  },

  providerState: {
    strava: {
      state: "fresh",
      lastAttemptAt: "ISO-8601",
      lastSuccessAt: "ISO-8601",
      nextEligiblePollAt: "ISO-8601 or null"
    }
  }
}
```

### 3.3 Model rules

- `raceId` is the join key. A provider race number alone cannot silently create or replace a race.
- `raceNumber` is a display/order attribute and must agree with the canonical schedule.
- Schedule, activity, live location, logistics, and progress remain separate domains. An update to one domain cannot overwrite another.
- `source` is an allowlisted provider identifier, not an arbitrary provider-supplied value.
- Race phase (`scheduled` or `completed`) is separate from provider freshness (`fresh`, `stale`, `unavailable`, `invalid`, or `static`).
- Unrecognized fields and enum values are rejected at the adapter boundary.
- Normalized values are immutable for a render cycle. Reducers create a new snapshot rather than mutating provider or static objects.
- Provider display strings never become HTML. The view uses `textContent` or equivalent safe property assignment; URLs and media types require explicit allowlists.

## 4. Source ownership and precedence

HAPN is explicitly API #2 and has authority only over the RV observed-location domain. API #3 remains unassigned and receives no implicit override rights.

| Domain/field | Authority | Fallback | May another provider override? | Stale behavior |
| --- | --- | --- | --- | --- |
| Event edition, race IDs, race order | Versioned Goodwin static schedule | None; invalid edition fails to static | No | Static for the published edition |
| State, city, scheduled date, display labels | Canonical Goodwin schedule | Current versioned static values | No external provider override; provider copies are consistency checks | Static remains visible |
| Marker anchors, topology, core routes | Versioned static geometry | Same static geometry | No | Not a live-data concern |
| Planned flight legs and planned RV path | Versioned static logistics | Same static plan | A future provider may add observed state, never replace the plan | Plan remains identifiable as planned/static |
| Race completion and athlete activity | Strava public races | Static `scheduled`/no activity, or accepted last-known-good Strava data while retainable | No, unless a later architecture decision explicitly reassigns this domain | Historical completed activity may remain; freshness label applies to snapshot, not the fact that the activity occurred |
| Activity metrics and race polyline | Strava matched activity | No dynamic metric/polyline | No | Retain verified historical result; do not synthesize new progress |
| Race-window active state and completed count | Strava race status, validated with races | Static inactive/0/50, or last-known-good while retainable | No | Mark stale; stop treating it as current after retention expires |
| Runner observed location | Designated live-location provider, **TBD** | Last-known-good within configured retention; then static runner presentation | Only one explicitly assigned authority per entity/field | Show as stale with an “as of” time if product approves; never imply current location |
| RV observed location | **HAPN (API #2)** | Last-known-good within the configured six-hour default retention ceiling; then planned/static RV state | No. HAPN owns only `vehicle:rv` observed position | Stale/unavailable input cannot erase an eligible last-known-good value; after retention expires, coordinates are removed and the static RV is used |
| Flight observed location/status | Designated flight/logistics provider, **TBD** | Planned flight leg/static display | Only one explicitly assigned authority per entity/field | Stale observed state is labelled; planned path remains distinct |
| Provider health/freshness | Coordinator, based on validated results and local clocks | `unavailable`/`invalid` | Providers cannot author their own UI health state | Never blocks static map or other providers |

The current Strava browser adapter merges its validated state/city/date copies into static stops. Initial refactoring must preserve visible production behavior. The normalized ownership rule above is the target boundary: future providers cannot overwrite schedule data, and any change that makes the canonical static schedule authoritative over those redundant Strava copies requires its own regression-tested implementation decision.

Conflict resolution is deterministic:

1. reject a patch that is not authorized for the domain;
2. join only to a canonical `raceId` or allowlisted entity ID;
3. for the same authorized source and record, accept only a newer provider version/observation timestamp;
4. when provider timestamps tie, use a documented provider sequence/version if available;
5. never use arrival order alone to let an older event replace a newer one; and
6. when ordering cannot be proved, retain the last-known-good value and record an internal ambiguous/out-of-order result.

## 5. Failure isolation

### 5.1 Provider state machine

Each provider independently reports one of:

- `fresh`: a valid, timely response was accepted;
- `stale`: last-known-good data exists but exceeds its fresh interval;
- `unavailable`: timeout, network failure, non-success response, or no retainable data;
- `invalid`: response size, JSON parsing, or schema/semantic validation failed; or
- `static`: no dynamic source is configured for the domain.

Failures are reduced to safe internal error codes. Raw response bodies, credentials, stack traces, upstream URLs, and provider errors are not put into the public snapshot or DOM.

### 5.2 Independent collection and commit

- The coordinator uses settled results so one rejected provider promise cannot reject the batch.
- A provider adapter emits a complete, validated patch for the domains it owns or emits no patch. Partial malformed provider state is not committed.
- The two current Strava endpoints remain one atomic Strava patch because their count and status invariants are cross-validated.
- Provider B and provider C commit independently of Strava and of one another.
- A failure cannot clear another provider’s accepted domain or the static base.
- A refresh failure retains eligible last-known-good data and updates only provider freshness metadata.
- An exception in normalization or rendering is caught at the provider/snapshot boundary; the last rendered valid snapshot or the static snapshot remains usable.
- If every provider fails, the output is the current full static map: 51 state shapes, 50 race markers, three core routes, five planned flight paths, and the static runner/RV presentation.

## 6. Timestamp and staleness model

Every future dynamic record must distinguish:

| Timestamp | Meaning | Requirement |
| --- | --- | --- |
| `observedAt` | When the provider measured the real-world fact | Required for live position; must come from a validated provider field |
| `updatedAt` | When the provider says the record/version changed | Required when the provider supports update ordering; otherwise `null` |
| `receivedAt` | When the Goodwin server accepted the validated payload | Always assigned server-side; useful for transport age, not measurement age |
| `generatedAt` | When the Goodwin public normalized response was assembled | Always assigned server-side or by the trusted first-party coordinator |

Schedule dates and Strava activity `startTime` are event times, not freshness clocks. Because the present Strava APIs lack an observation/update timestamp, the compatibility adapter records response receipt separately and does not invent `observedAt`.

Each provider and domain must declare configuration before implementation:

```text
freshForMs
retainStaleForMs
normalPollIntervalMs
activeWindowPollIntervalMs
requestTimeoutMs
maximumBackoffMs
```

HAPN API #2 defaults to `freshForMs = 900000` and `retainStaleForMs = 21600000`; both are bounded server-side configuration. API #3 has no freshness threshold because it remains unassigned and unimplemented.

Rules:

- A value is `fresh` only when its trusted observation/update age is within `freshForMs`.
- Beyond that threshold but within `retainStaleForMs`, it may remain visible only if the product decision for that domain permits it. It must be visibly/semantically marked stale with a trustworthy “as of” time.
- Stale live location never advances automatically and must not be described as current.
- After the retention period, the dynamic value becomes unavailable and its domain falls back without affecting other domains.
- Verified historical completed activities may remain because their age does not invalidate the historical fact; snapshot freshness is still reported separately.
- Clock-skewed future timestamps, timestamps earlier than an accepted record, and timestamps outside provider-specific bounds are rejected or quarantined.

## 7. Security contract for every provider

No future provider is implementation-ready until all of these controls have an owner, configuration, and tests.

### 7.1 Server-side acquisition

- Provider secrets stay server-side in private configuration, outside the public web root and browser bundles.
- Browser code receives no access token, refresh token, API key, signature secret, credential-bearing URL, or raw authorization response.
- Outbound connections use HTTPS only and a fixed allowlist of provider hostnames and ports.
- Upstream method, hostname, and path templates are code/config controlled. User input cannot supply an upstream URL, protocol, host, redirect target, or arbitrary path.
- Redirects are disabled or each redirect target is revalidated against the same allowlist.
- DNS/SSRF controls reject loopback, link-local, private, and otherwise prohibited destinations where the runtime permits verification.
- Each upstream call has a short configured timeout, response-body byte cap, bounded concurrency, and bounded retry count.
- Retries apply only to safe/idempotent operations, use jittered backoff, honor `Retry-After` where valid, and stop at a documented ceiling.
- Responses must pass content-type, JSON parse, strict schema, enum, string-length, numeric-range, coordinate, identifier, timestamp, cardinality, and cross-field validation.
- Oversized, malformed, or semantically inconsistent responses fail closed before entering the normalized store.

### 7.2 Public projection

- The public endpoint returns a versioned, minimal normalized projection, never a raw provider payload.
- Sensitive/internal provider identifiers are omitted unless a documented public use requires them.
- Live-person location requires explicit authorization, consent, precision/delay, retention, and incident/disable decisions before release.
- Error responses are generic and do not expose dependency names, upstream status bodies, internal paths, stack traces, config state, or credentials.
- Same-origin browser access is preferred. If CORS is emitted, allow only the exact approved Team Goodwin HTTPS origin(s), currently `https://goodwingoodge.com`; never use wildcard origin with credentials.
- Public browser requests use `credentials: "omit"` unless a separately reviewed feature requires authentication.
- GET/read-only semantics, response headers, cache behavior, and CDN/shared-cache suitability are documented per domain. Live location defaults to no-store or a deliberately short cache; immutable schedule and historical data may be cached longer.
- Public endpoints receive rate/abuse protection appropriate to cost and sensitivity without exposing provider quotas.

### 7.3 Logging and operation

- Logs contain structured event codes, provider IDs, timing, byte counts, and redacted correlation IDs—not credentials, authorization headers, secret-bearing URLs, raw provider bodies, or precise location unless explicitly approved and protected.
- Secrets are redacted in caught errors, test fixtures, package artifacts, source maps, health endpoints, and operator output.
- Provider health exposed publicly is generic. Detailed diagnostic state, if retained, stays in protected logs or existing administrator-authenticated facilities.
- Dependencies are minimized, pinned/locked, audited, and included in package validation.

## 8. Browser contract

- The browser calls first-party Goodwin endpoints where practical. It does not call a credentialed provider directly.
- Existing `/strava/public/races` and `/strava/public/race-status` remain unchanged and are wrapped by the Strava adapter.
- HAPN is exposed by the authoritative cPanel/Passenger application at `GET /strava/public/tracking-status`. The endpoint and renderer contract are provider-neutral; the browser never contacts HAPN directly.
- Even if the server aggregates providers, the public response retains per-domain `source`, time, and freshness metadata so stale/fallback behavior is explicit.
- The browser applies a decoded-size guard in addition to the server response cap, validates the public normalized schema, aborts timed-out requests, and rejects unknown schema versions.
- Provider strings cannot select HTML, CSS selectors, DOM IDs, script/module URLs, map layer types, or arbitrary navigation targets.

## 9. Coordinated polling

Implement one visibility- and race-aware scheduler with a registry of provider tasks. Do not add an independent `setInterval` per provider.

Each registered task declares its provider ID, owned domains, loader, due time, phase-specific interval, timeout, staleness policy, retry policy, and last-known-good state.

Scheduler behavior:

1. It is dormant during initial page load and activates only at the existing map-near-viewport gate.
2. Static rendering is never scheduled or network-dependent.
3. It calculates one next wake-up and runs only due tasks, preferably with a small documented concurrency ceiling.
4. A provider cannot have two overlapping requests. The next normal poll is scheduled from completion, not start.
5. The current Strava pair remains a single task and retains its 45-second active-window cadence unless separately changed and tested.
6. `visibilitychange` pauses/aborts unnecessary work. On return, due providers refresh once with small jitter; hidden intervals are not replayed.
7. Canonical race-window state selects active, inactive, pre-race, and post-race policies. Live polling stops or is materially reduced outside relevant periods.
8. Repeated transient failures use capped exponential backoff with jitter; valid `Retry-After` can extend the cooldown. Success resets the failure count.
9. Schema-invalid and oversized results use a longer cooldown than a single network failure and are not immediately retried in a tight loop.
10. The scheduler exposes only sanitized provider freshness to the renderer and never blocks a render awaiting all providers.

HAPN defaults to a configurable 120-second cadence during the Mission America race window. API #3 remains undecided and unimplemented.

## 10. Test matrix

In this matrix A is the existing atomic Strava source, B is API #2, and C is API #3.

| Scenario | Required assertion |
| --- | --- |
| A healthy; B and C down | Strava activity/progress applies; B/C domains use eligible stale or static fallback; map structure remains complete |
| B healthy; A and C down | Only B-owned domains apply; 50-race static schedule and geometry remain; B cannot synthesize Strava completion |
| C healthy; A and B down | Only C-owned domains apply; other domains fall back independently |
| All providers healthy | Every provider modifies only its owned domain; one normalized snapshot renders |
| One stale provider | Stale value follows its domain’s retain/display policy, includes an accurate as-of state, and does not block fresh providers |
| All providers down | Exact current static fallback renders with 51 shapes, 50 markers, three core routes, five flight paths, runner/RV defaults |
| Conflicting timestamps | Older observation/update cannot replace newer accepted state regardless of response arrival order |
| Equal timestamps/conflicting values | Provider sequence/version resolves it or last-known-good is retained; arrival order is not authority |
| Unauthorized field conflict | Adapter/reducer rejects the attempted cross-domain overwrite |
| Malformed JSON/schema | No partial commit; provider becomes invalid; other sources continue |
| Slow response/timeout | Request aborts at its provider timeout; scheduler and render remain responsive |
| Oversized upstream response | Server stops reading/rejects before parsing; sanitized failure only; no public raw payload |
| Oversized first-party response | Browser decoded-size/schema guard rejects it; last-known-good/static remains |
| Unknown schema version | Response rejected without renderer access |
| Missing/bad live timestamp | Live record rejected or treated under an explicitly configured receipt-time policy; never presented as provider-observed now |
| Clock-skewed future timestamp | Record rejected/quarantined and cannot dominate precedence |
| Race join | Exact canonical `raceId` joins; unknown, duplicate, missing, or mismatched IDs fail the provider patch |
| Duplicate update | Reducer is idempotent; no duplicate marker/path and no redraw if signature is unchanged |
| Out-of-order update | Monotonic timestamp/version rule retains the newer state |
| Refresh failure after success | Eligible last-known-good data remains with updated freshness; it is not replaced by empty data |
| Hidden tab | Polling pauses; no accumulated burst; at most one due refresh on visibility return |
| Outside race window | Live polling stops/reduces per approved policy; static map remains |
| Provider text contains markup/script | It renders only as inert text or is rejected; no HTML, URL, selector, or attribute injection |
| Malicious coordinates/polyline | Bounds, length, decode complexity, and point-count caps reject unsafe geometry without map failure |
| CORS/auth probe | No secret in browser; unapproved origins receive no usable CORS grant; public endpoints do not accept arbitrary upstream targets |
| Cache regression | Live/stale response cache directives match the documented domain policy; no private data enters a shared cache |

Required regression suites also preserve the current page/navigation behavior, lazy loading, state/marker/route counts, runner/RV markers, static fallback, console cleanliness, and absence of broken assets or unexpected first-party failures.

## 11. Performance budget

The controlled Strava merge and production benchmarks are the baseline, not a request to optimize unrelated findings.

Current evidence establishes:

- zero Strava/module requests added to the initial mobile load before the near-viewport gate;
- three Strava integration requests at map approach: one module and two public API requests;
- unchanged static structure under success and forced failure;
- controlled median static SVG render time of 571.1 ms before and 569.3 ms after the Strava candidate, a measured delta of -1.8 ms; and
- controlled CLS of `0.00034909562149853173` in both builds.

Budgets for API #2 and API #3:

| Measure | Architecture budget |
| --- | --- |
| Added initial requests | **0** before the current map-near-viewport activation |
| Added initial LCP impact | **None attributable to provider code or requests**; provider work stays off the initial critical path |
| New map-near-viewport requests | At most one first-party data request per added provider, so at most **2 additional requests** for API #2 and API #3 combined per due collection cycle |
| Dynamic module requests | Keep one map integration module request; adapters should be bundled or loaded without one module waterfall per provider |
| Per-provider payload | Initial target at most **32 KiB transferred** and **64 KiB decoded JSON** per response; a larger documented sample requires explicit budget and cap review before implementation |
| Combined new payload at first map approach | Target at most **64 KiB transferred** for API #2 and API #3 combined |
| Map render delta | Median added orchestration/render work at most **50 ms desktop / 100 ms mobile**, no new task over 50 ms, and no change to the required map structure |
| Layout stability | No provider-attributable initial CLS; controlled comparison delta target no more than **0.001** |
| Polling frequency | Strava remains two requests per 45-second active cycle. B and C together add no more than one request each per coordinated cycle unless a separately reviewed use case and provider limit require otherwise |
| Hidden/out-of-window polling | No hidden-tab catch-up burst; live polling stops or is reduced according to an approved, documented provider policy |

The previously recorded mobile homepage LCP observation is not attributed to Strava because no Strava requests occurred in that initial profile. This architecture does not broaden scope to that unrelated performance investigation.

Before implementation, real redacted provider samples must confirm or revise byte caps and intervals. Any revision must remain explicit and tested; it cannot become an unbounded response or polling loop.

## 12. Security development checkpoint

API #2 and API #3 each require a provider-specific security checkpoint before merge and again after deployment. This document is the standing architecture gate for those reviews.

### 12.1 Pre-implementation record

- business purpose, owned domain/fields, data classification, and public precision/retention decision;
- provider documentation, fixed HTTPS hosts, authentication method, rate limits, terms, and privacy constraints;
- redacted success/error samples, schema, IDs, units, timestamp semantics, pagination, size, and cache behavior;
- CIS/OWASP review relevant to outbound requests, authentication/secrets, validation, SSRF, logging, availability, privacy, and browser exposure;
- source precedence and stale/unavailable product behavior;
- threat model and abuse/cost controls;
- dependency choice and dependency audit, or justification for native platform APIs;
- secrets storage/package scan and log-redaction review;
- exact CORS, timeout, response/body cap, retry, rate-limit, and cache configuration;
- focused unit, integration, malformed-input, failure-isolation, DOM-safety, and performance tests; and
- deployment, rollback, and monitoring plan.

### 12.2 Release and post-deployment gate

- full test suite and cPanel package validation;
- dependency and secret scan of the exact package;
- checksum/file manifest and runtime-file inventory;
- read-only production validation of the new first-party endpoint;
- unchanged static fallback and Strava behavior;
- browser validation for initial-load, near-map, mixed failures, console/network, map counts, and mobile/desktop behavior;
- CORS, cache, generic-error, rate/timeout/body-limit, and no-secret exposure checks;
- observed payload and polling performance against this budget; and
- provider-specific security record and authoritative audit status update.

No new provider is complete solely because its happy-path marker appears on the map.

## 13. Implementation sequence

1. Introduce model types/validators and a static-to-normalized adapter with snapshot-equivalence tests.
2. Wrap the existing two-endpoint Strava behavior in one adapter without changing endpoints, cadence, UI, or fallback behavior.
3. Introduce the coordinator/reducer and prove the current map output is equivalent under success and failure.
4. Introduce the single scheduler while preserving the existing near-viewport, visibility, active-window, five-second timeout, and 45-second Strava behavior.
5. Complete the provider-specific checkpoint for API #2, then add only its adapter/server projection and owned domain.
6. Validate and deploy API #2 independently before beginning API #3.
7. Repeat the provider-specific checkpoint and isolated rollout for API #3.

Steps 1 through 6 are complete for HAPN API #2, including its isolated deployment and final production validation. API #3 remains a separate effort and must complete its own intake, provider-specific security checkpoint, tests, and isolated rollout.

## 14. Information required for each new API

The following inputs are resolved for HAPN API #2. They remain the required intake checklist before API #3 or any later provider can be designed in detail:

1. Provider/product name, documentation URL, production and sandbox base hostnames, and whether a test account exists.
2. Exact map purpose: activity, runner location, RV/logistics, flight, progress, weather, or another named domain.
3. The exact fields the product should display and the fields the provider returns, with redacted example success and error payloads.
4. Stable identifiers and how they map to `raceId` or an allowlisted entity ID.
5. Timestamp semantics and timezone for every event/update/observation field, plus any sequence/version value.
6. Coordinate system, units, accuracy, polyline/geometry encoding, maximum point count, and status enums.
7. Authentication type, credential lifecycle, token refresh/rotation, required scopes, and whether webhook signatures are supported.
8. Rate limits, quota/cost model, documented retry guidance, `Retry-After`, pagination, maximum response size, and caching/ETag support.
9. Provider update cadence, acceptable product freshness, how long stale data may remain, and relevant race/event windows.
10. Whether data arrives by polling, webhook, or both, and the provider’s duplicate/out-of-order delivery guarantees.
11. Data sensitivity, runner/driver consent, public location precision/delay, retention, deletion, and provider terms governing redistribution.
12. Desired behavior when that provider is stale or unavailable and whether an existing source is intended to remain authoritative.
13. Network constraints such as IP allowlisting, fixed regions, mTLS, or required inbound verification.
14. Whether the first-party projection should live in the existing Passenger application or a separately owned mount; this must be reconciled with cPanel routing before implementation.

## 15. Readiness decision

**Architecture readiness: PASS for HAPN API #2 production operation and for separately gated future-provider intake.**

The normalized boundary, ownership rules, failure isolation, configurable staleness model, security contract, coordinated polling model, test matrix, and performance gates are sufficient to prevent API #2 or API #3 from directly coupling to rendering or DOM logic.

**HAPN API #2 implementation and final production acceptance: PASS / COMPLETE.** The server-side first-party projection is live and validated, the production frontend assets match the corrected controlled-candidate hashes, and the pre-race production browser acceptance passed on 2026-09-09. HAPN owns only the RV observed-location domain and remains gated by the configured race window. **API #3 may proceed only as a separate effort after completing the Section 14 intake and provider-specific security checkpoint; it remains unimplemented.**
