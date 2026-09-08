# Team Goodwin Phase 1 Production Validation — 2026-09-07

**Validation status:** **PASS — Phase 1 CLOSED**  
**Production origin:** `https://goodwingoodge.com`  
**Final validation window:** 2026-09-07, approximately 10:00–10:13 AST  
**Authoritative audit:** `docs/security/cis-owasp-audit-2026-09-07.md`  
**Phase 1 runbook:** `docs/security/phase-1-attack-surface-cleanup-2026-09-07.md`  
**Known-good Strava checkpoint:** `4c0526b72282d5d681639285ead91b709cc410d6`

## Scope and decision

This was read-only production validation. No production file, cPanel setting, application/runtime code, dependency, database, Strava route, webhook, authentication control, GitHub setting, or deployment was changed. The only repository changes are security documentation.

All scoped Phase 1 attack-surface requirements now pass. The root stale tracker URL returned `404` for the exact URL and two distinct cache-busted, no-cache requests. The nested tree’s previously observed file returned `404`, both listing targets returned `403`, active hashes matched the known-good baseline, and all page, map, Strava, test, and cPanel package regressions passed.

The earlier validation in this same document found the root stale tracker returning `200`. That failed result is retained below as history; the final rerun after the last manual removal supersedes it for closure.

| Phase 1 criterion | Result | Production evidence |
|---|---|---|
| Root stale tracker is not public | **PASS** | Exact URL and two cache-busted/no-cache variants returned `404 text/html`, 1,251 bytes; none returned JavaScript |
| Accidental nested tree is not public | **PASS** | `/assets/public_html/` returned `403`; its one previously inventoried file returned `404` |
| Asset directory does not list | **PASS** | `/assets/` returned `403 Forbidden`; no listing was exposed |
| Active tracker preserved | **PASS** | `200`; production SHA-256 matches the runbook baseline |
| Active Strava map module preserved | **PASS** | `200`; production SHA-256 matches the runbook baseline |
| Public pages and first-party assets healthy | **PASS** | Five pages returned `200`; browser smoke tests were clean; 51 referenced first-party assets returned `200` |
| Map and Strava behavior preserved | **PASS** | Lazy gate, map DOM contract, API-applied state, public endpoints, and fallback tests passed |
| Focused/full Node 22.23.2 suites and cPanel validator pass | **PASS** | 12/12 focused; 96/96 full; cPanel package passed |

## 1. Stale artifact and indexing evidence

### Root stale tracker — PASS

The exact stale URL and two unique-query variants were requested with `Cache-Control: no-cache, no-store` and `Pragma: no-cache`. All three final checks returned:

```text
HTTP/2 404
Content-Type: text/html
Content-Length: 1251
Server: LiteSpeed
```

No final request returned the stale JavaScript or its previous 76,645-byte response. This closes the blocker from the first validation run.

Historical evidence: the earlier 09:22–09:47 AST validation returned `200 text/javascript`, 76,645 bytes, SHA-256 `743faaf0d6c76c80e9ee50443bbe1d03f6589f1983c51b0e4376d08f64bc2faf`. The final manual removal and final external rerun corrected that state.

### Nested accidental tree — PASS

```text
GET /assets/public_html/                                             -> 403
GET /assets/public_html/assets/tracker-base.pre-strava-2026-09-06.js -> 404
```

The direct URL for the nested tree’s only previously inventoried file is gone. The parent path does not disclose a listing.

### Directory indexing — PASS

```text
GET /assets/ -> 403 Forbidden
```

The response contained no directory entries. Direct legitimate asset URLs remained available, so the cPanel **No Indexing** selection did not broadly deny asset access.

## 2. Active asset parity

Production GET bodies were hashed and compared with the Phase 1 runbook baselines:

| Asset | HTTP | Bytes | Production SHA-256 | Runbook baseline | Result |
|---|---:|---:|---|---|---|
| `/assets/tracker-base.js` | 200 | 81,608 | `a6c9fea694c1bb73181ed1a9ca9801169326bd8194c576e453b2d4faf2928c54` | same | **PASS** |
| `/assets/strava-race-map.mjs` | 200 | 10,181 | `7a750659403f256d7a5305b84f164da7a75041d362627e016c6e5457c9de9b80` | same | **PASS** |
| `/` | 200 | 29,388 | `edfe3abd43998cf94655c92a1a7cda8e1137bc5f37a50b4858e10b1689910d51` | same | **PASS** |
| `/live-tracking/` | 200 | 29,388 | `edfe3abd43998cf94655c92a1a7cda8e1137bc5f37a50b4858e10b1689910d51` | same | **PASS** |

The active tracker and module remain byte-identical to the controlled Strava integration baseline.

## 3. Public-page and first-party asset regression

| Page | HTTP | Browser result |
|---|---:|---|
| Homepage `/` | 200 | Expected title/H1 and content rendered; no console errors; no broken images |
| The Run `/the-run/` | 200 | Expected title/H1 and mission content rendered; no console errors; no broken images |
| Will `/will/` | 200 | Expected title/H1, portrait, and feed fallback content rendered; no console errors; no broken images |
| Fifty Runs `/fifty-runs/` | 200 | Expected title/H1 and all 50 numbered itinerary entries rendered; no console errors; no broken images |
| Live Tracking `/live-tracking/` | 200 | Expected tracker page rendered; no console errors; no broken images |

A separate read-only sweep extracted referenced first-party scripts, stylesheets, images, video, partner marks, and CSS dependencies from the five newly downloaded pages, then added the known map runtime assets. All **51/51** checked first-party URLs returned `200` with an appropriate content type. This included:

- active tracker JavaScript and CSS;
- `strava-race-map.mjs`;
- U.S. map topology JSON;
- runner and RV marker images;
- ticker JSON;
- page images, Instagram fallbacks, partner marks, favicon/webclip assets, and the hero video;
- all first-party stylesheets and page scripts referenced by the five pages.

No unexpected first-party asset failure was observed.

## 4. Map regression evidence

### Lazy loading — PASS

At the top of `/` and `/live-tracking/`, before the map approached the viewport, the map contained zero generated state, race, route, runner, or RV nodes. After the map was brought into the lazy threshold, it rendered. This preserves the near-viewport lazy gate.

### Fresh-profile production map — PASS

A separate fresh Chrome profile loaded the live production page with a 4,000-pixel viewport and an 8-second virtual-time budget. The captured post-load DOM was 420,787 bytes and had `data-map-ready="true"`. The exact production DOM counts were:

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

The map accessibility label changed to `0 of 50 races completed`, which is applied only when an API-sourced public race snapshot is accepted. No static-fallback warning was logged in that fresh production run.

The browser emitted one handled warning on `/live-tracking/`: the first relative topology candidate resolved to `/live-tracking/assets/us-states-albers-10m.json` and returned `404`; the tracker then loaded its second candidate, `/assets/us-states-albers-10m.json`, and rendered the complete map. This is existing fallback behavior, not a new console error or a Phase 1 regression.

### Static fallback — PASS with non-destructive evidence

No production outage was induced. The active tracker and map module hashes match the known-good baseline, and the focused suite passed the unavailable, malformed, and incomplete public-API fallback cases. Those tests confirm fallback to the complete 50-race static schedule with a safe warning. The focused suite also confirms that static route/state/flight/runner/RV rendering hooks remain present.

## 5. Strava regression evidence

### Startup health

The initial final-rerun request and two subsequent cache-busted rechecks returned `200`, `Cache-Control: no-store`, and the fully healthy state:

```json
{
  "server": "running",
  "configLoaded": true,
  "mysqlModuleLoaded": true,
  "mysqlPoolCreated": true,
  "databaseReachable": true,
  "stravaConfigValid": true,
  "startupErrorCategory": "none"
}
```

Final health result: **PASS**. The transient `initializing` response observed during the earlier failed validation did not recur in any of the three final-rerun checks.

### Public endpoints

- `/strava/public/races`: `200 application/json`; exactly **50** ordered races; race 1 is `ggma-2026-01`; race 50 is `ggma-2026-50`.
- `/strava/public/race-status`: `200 application/json`; `active:false`, the expected `ggma-2026` window, `completedRaces:0`, and `totalRaces:50`, which is correct for 2026-09-07 before the race window.
- Same-origin requests with `Origin: https://goodwingoodge.com` returned `Access-Control-Allow-Origin: https://goodwingoodge.com` on both endpoints.
- The fresh-profile browser map accepted and applied the API snapshot, confirming the public integration works from the production page.

No live Strava backend route or data was modified.

## 6. Test evidence

The requested runtime was obtained in a temporary npm cache and verified as `v22.23.2`; the project and its dependency files were not changed.

Focused Node 22.23.2 command:

```text
Node v22.23.2
node --test tests/production-strava-map-merge.test.mjs tests/strava-map-integration.test.mjs
12 tests, 12 passed, 0 failed
```

Full Node 22.23.2 command:

```text
Node v22.23.2
node --test tests/*.test.mjs
96 tests, 96 passed, 0 failed
```

cPanel package validation under Node 22.23.2:

```text
cPanel package passed: 19 files, Node 22, one production dependency, routes and migration present.
```

Loopback binding was allowed for the server tests, avoiding the known sandbox-only `listen EPERM` condition documented in the authoritative audit. No genuine test or tooling failure occurred in the final rerun.

## 7. Unexpected findings

No blocking Phase 1 finding remains.

1. **Known pre-existing cache behavior:** the persistent in-app browser session can retain an older tracker response because the page’s tracker version token did not change and the asset is cacheable. The origin serves the correct 81,608-byte tracker, its checksum matches the approved baseline, and a separate fresh-profile production browser rendered the complete current map and applied the Strava snapshot. Existing client-cache behavior is not caused by Phase 1 and does not make the removed stale URL publicly retrievable.
2. **Expected handled warning:** `/live-tracking/` tries one route-relative topology URL that returns `404` before the valid parent asset succeeds. It did not prevent map rendering and was not a console error.
3. **Private rollback evidence limit:** the backup path and intended `0700` directory/`0600` file permissions were not inspected, in accordance with the instruction not to access private backup contents. The operator reports that the rollback copy is outside `public_html`; no public backup URL was found in the scoped checks.

## 8. Closure and next phase

**Phase 1 is CLOSED.** The scoped public artifact removal, nested-tree removal, directory-index denial, active-asset parity, public-page, map, Strava, Node 22.23.2 test, and cPanel package gates all pass.

No Phase 2 work was performed. The next recommended separately authorized remediation item is **TG-M01: retire, restrict, or reduce the detailed public `/strava/health-startup` diagnostic**, first confirming that no cPanel or external monitor depends on it and retaining only a schema-constant generic health endpoint if needed. HSTS and browser-header work remain later staged phases.
