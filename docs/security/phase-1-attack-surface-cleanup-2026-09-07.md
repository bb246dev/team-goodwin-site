# Team Goodwin Phase 1 Attack-Surface Cleanup Runbook

**Prepared:** 2026-09-07  
**Status:** Manually executed; final production validation **PASS — CLOSED**  
**Authoritative audit:** `docs/security/cis-owasp-audit-2026-09-07.md`  
**Production validation:** `docs/security/phase-1-validation-2026-09-07.md`  
**Known-good Strava checkpoint:** `4c0526b72282d5d681639285ead91b709cc410d6`  
**Production:** https://goodwingoodge.com  
**Scope:** Directory indexing and two confirmed stale public artifact locations only  
**Decision:** **PHASE 1 CLOSED** — directory indexing returns `403`; the stale root tracker and previously observed nested tracker URLs return `404`, including repeated cache-busted/no-cache checks; active hashes and all page, map, Strava, Node 22.23.2 test, and cPanel package gates pass. No Phase 2 work is authorized by this runbook.

## Hard scope boundary

This runbook does not authorize or include changes to:

- `public_html/assets/tracker-base.js`
- `public_html/assets/strava-race-map.mjs`
- the live Strava backend or any Strava route
- CSP, HSTS, browser security headers, JSONP, map behavior, webhook behavior, or administrator authentication
- databases, cPanel application settings, GitHub, dependencies, source code, builds, commits, or deployments
- any public file or directory other than the two stale targets named below

Only these production actions are in scope when separately approved and manually executed:

1. Privately archive and then remove `public_html/assets/tracker-base.pre-strava-2026-09-06.js`.
2. After the final cPanel filesystem gate, privately archive and then remove `public_html/assets/public_html/`.
3. Disable directory indexing at `public_html/assets` with cPanel **Indexes → No Indexing**, or the single scoped fallback directive `Options -Indexes`.

## Phase A — verification before change

### A1. Complete externally visible nested-tree inventory

Production auto-index pages were retrieved directly on 2026-09-07. The complete non-hidden tree exposed by LiteSpeed is:

```text
/home/goodfjcw/public_html/assets/public_html/
└── assets/
    └── tracker-base.pre-strava-2026-09-06.js  (76,645 bytes)
```

The parent listing reports `public_html/` created/modified at approximately 2026-09-07 03:55 server time. The nested file reports approximately 2026-09-07 03:56 and 75 KiB. No other non-hidden file or directory is present in either public listing.

### A2. Exact redundancy/provenance proof

| Production object | Bytes | SHA-256 | Conclusion |
|---|---:|---|---|
| `/assets/tracker-base.pre-strava-2026-09-06.js` | 76,645 | `743faaf0d6c76c80e9ee50443bbe1d03f6589f1983c51b0e4376d08f64bc2faf` | Stale pre-Strava tracker |
| `/assets/public_html/assets/tracker-base.pre-strava-2026-09-06.js` | 76,645 | `743faaf0d6c76c80e9ee50443bbe1d03f6589f1983c51b0e4376d08f64bc2faf` | Byte-identical duplicate of the same stale tracker |
| Active `/assets/tracker-base.js` | 81,608 | `a6c9fea694c1bb73181ed1a9ca9801169326bd8194c576e453b2d4faf2928c54` | Active controlled Strava merge; preserve |
| Active `/assets/strava-race-map.mjs` | 10,181 | `7a750659403f256d7a5305b84f164da7a75041d362627e016c6e5457c9de9b80` | Active checkpoint module; preserve |

Additional provenance:

- `production-merge/strava-live-map-2026-09-06/manifest.json` identifies `743faaf...` as the tracker captured before the Strava merge and `a6c9fea...` as the approved candidate tracker.
- The live active `tracker-base.js` is byte-identical to that candidate.
- The live `strava-race-map.mjs` is byte-identical to both the controlled merge asset and `assets/strava-race-map.mjs` at commit `4c0526b72282d5d681639285ead91b709cc410d6`.
- Current `/` and `/live-tracking/` HTML are byte-identical with SHA-256 `edfe3abd43998cf94655c92a1a7cda8e1137bc5f37a50b4858e10b1689910d51`, matching the controlled merge manifest. Both reference the active tracker.
- Both stale production locations are currently directly downloadable as `200 text/javascript`, so deletion is still required even after indexing is disabled.

### A3. Production reference scan

The exact stale filename and the nested `/assets/public_html/` prefix were searched across:

- 16 current production HTML routes: `/`, `/the-run/`, `/will/`, `/fifty-runs/`, `/live-tracking/`, `/athletes/`, `/partners/`, `/week-1/`, `/week-2/`, `/week-3/`, `/faq/`, `/updates/`, `/privacy/`, `/terms/`, `/participation-terms/`, and `/accessibility/`.
- All 20 active root text assets listed by production: current JS, MJS, CSS, and JSON assets, excluding only the stale file being evaluated.

Results:

- References to `tracker-base.pre-strava-2026-09-06.js`: **0**.
- References to `/assets/public_html/`: **0**.
- `/` and `/live-tracking/` both reference `/assets/tracker-base.js?v=20260831mobile-critical-path`.
- The active tracker references `/assets/strava-race-map.mjs`.
- No high-confidence private key, live-token signature, client secret, access/refresh token, password, Authorization header value, or Bearer credential was found in either stale JavaScript copy. Public analytics/update identifiers are not secrets.

### A4. Active tracker verification

- Live active checksums match the controlled merge as recorded above.
- Focused local tests passed **12/12**:
  - controlled production merge structure and lazy map lifecycle;
  - 50-stop schedule;
  - route, state, marker, flight, zoom, runner, and RV rendering hooks;
  - public Strava endpoint allowlist;
  - public API ordering/projection;
  - static fallback for unavailable/malformed/incomplete API data;
  - near-viewport lazy loading and 45-second active-window polling.
- The broader authoritative audit recorded **96/96** project tests passing.

### A5. Unique-file result and mandatory uncertainty gate

**Unique files discovered in the externally visible nested tree: none.** Its one file is byte-identical to the root stale backup and to the pre-Strava tracker recorded in the controlled merge manifest.

However, LiteSpeed auto-indexing cannot prove the absence of hidden dotfiles or identify filesystem-level symlinks. Therefore:

> Do not delete `public_html/assets/public_html/` until cPanel File Manager is set to **Show Hidden Files (dotfiles)** and confirms that the tree contains exactly one ordinary `assets/` directory and one ordinary file with the expected name, size, and checksum. If any additional item, symlink, `.htaccess`, unexpected type, or checksum is present, stop Phase 1 and preserve the tree unchanged.

This is the only remaining execution gate.

## Phase B — private rollback archive

### B1. Open cPanel safely

1. Sign in to the normal Namecheap cPanel account using MFA if configured.
2. Open **Files → File Manager**.
3. Click **Settings** and enable **Show Hidden Files (dotfiles)**.
4. Do not open or change the Passenger/Node application root.

### B2. Re-run the filesystem gate

Navigate to:

```text
/home/goodfjcw/public_html/assets/public_html/
```

Confirm all of the following before continuing:

- It is an ordinary directory, not a symlink.
- It contains only the ordinary directory `assets/`.
- `assets/` contains only the ordinary file `tracker-base.pre-strava-2026-09-06.js`.
- There is no hidden file, `.htaccess`, archive, config, additional subdirectory, or symlink.
- The file is 76,645 bytes and has SHA-256 `743faaf0d6c76c80e9ee50443bbe1d03f6589f1983c51b0e4376d08f64bc2faf`.

Also confirm the separate root stale file exists at:

```text
/home/goodfjcw/public_html/assets/tracker-base.pre-strava-2026-09-06.js
```

It must have the same 76,645-byte size and SHA-256. If any check fails, stop without deleting.

### B3. Create a private, path-preserving archive

In the account home directory, create:

```text
/home/goodfjcw/security-backups/2026-09-07/public_html/assets/public_html/assets/
```

Requirements:

- The entire archive root must be outside `/home/goodfjcw/public_html`.
- Set `security-backups` and descendants to owner-only directory permissions (`0700`) if cPanel permits.
- Set copied files and the private checksum manifest to owner-only permissions (`0600`) if cPanel permits.
- Do not add configuration, credentials, environment files, logs, database exports, OAuth material, or any other file to this backup.

Copy, do not move yet:

```text
SOURCE
/home/goodfjcw/public_html/assets/tracker-base.pre-strava-2026-09-06.js

DESTINATION
/home/goodfjcw/security-backups/2026-09-07/public_html/assets/tracker-base.pre-strava-2026-09-06.js
```

Then copy the confirmed nested tree while preserving its relative path:

```text
SOURCE
/home/goodfjcw/public_html/assets/public_html/

DESTINATION PARENT
/home/goodfjcw/security-backups/2026-09-07/public_html/assets/
```

The result must contain:

```text
/home/goodfjcw/security-backups/2026-09-07/
└── public_html/
    └── assets/
        ├── tracker-base.pre-strava-2026-09-06.js
        └── public_html/
            └── assets/
                └── tracker-base.pre-strava-2026-09-06.js
```

### B4. Verify archive checksums before deletion

If cPanel Terminal is available, use the absolute Linux executable and all four explicit paths:

```sh
/usr/bin/sha256sum \
  /home/goodfjcw/public_html/assets/tracker-base.pre-strava-2026-09-06.js \
  /home/goodfjcw/public_html/assets/public_html/assets/tracker-base.pre-strava-2026-09-06.js \
  /home/goodfjcw/security-backups/2026-09-07/public_html/assets/tracker-base.pre-strava-2026-09-06.js \
  /home/goodfjcw/security-backups/2026-09-07/public_html/assets/public_html/assets/tracker-base.pre-strava-2026-09-06.js
```

All four lines must begin with:

```text
743faaf0d6c76c80e9ee50443bbe1d03f6589f1983c51b0e4376d08f64bc2faf
```

Create a private `SHA256SUMS.txt` under `/home/goodfjcw/security-backups/2026-09-07/` containing these path-preserving entries:

```text
743faaf0d6c76c80e9ee50443bbe1d03f6589f1983c51b0e4376d08f64bc2faf  public_html/assets/tracker-base.pre-strava-2026-09-06.js
743faaf0d6c76c80e9ee50443bbe1d03f6589f1983c51b0e4376d08f64bc2faf  public_html/assets/public_html/assets/tracker-base.pre-strava-2026-09-06.js
```

If Terminal is unavailable, download the two public source files and two private copied files through authenticated File Manager and compare SHA-256 locally. Do not continue unless all four hashes match.

### B5. Remove only the verified public artifacts

After the private copies and checksums pass:

1. In File Manager, select only `/home/goodfjcw/public_html/assets/tracker-base.pre-strava-2026-09-06.js` and delete it.
2. Select only `/home/goodfjcw/public_html/assets/public_html/` and delete that directory.
3. Leave cPanel Trash intact until all Phase D/E validation passes.
4. Do not select `tracker-base.js`, `strava-race-map.mjs`, the parent `assets/` directory, or any other file.

Expected public result:

- `/assets/tracker-base.pre-strava-2026-09-06.js` → `404` or `410`.
- `/assets/public_html/` and its former nested file → `404` or `403`.
- Active `/assets/tracker-base.js` and `/assets/strava-race-map.mjs` remain `200` and checksum-identical.

## Phase C — disable directory indexing

### Preferred cPanel change

Namecheap exposes cPanel's **Indexes** feature, and current cPanel documentation defines **No Indexing** as preventing visitors from listing a directory. Use this method first:

1. In cPanel, open **Advanced → Indexes**.
2. Start at **Web Root** for `goodwingoodge.com`.
3. Navigate to `public_html` and then locate `assets`.
4. Click **Edit** for `assets`.
5. Select **No Indexing**.
6. Click **Save**.
7. Confirm the Index Type shown for `assets` is **No Indexing**.

Do not choose Directory Privacy/password protection; active assets must remain anonymously readable.

Official interface reference: https://docs.cpanel.net/cpanel/advanced/indexes/

Namecheap cPanel overview confirming the Indexes feature: https://www.namecheap.com/support/knowledgebase/article/9797/29/cpanel-control-panel-overview/

### Minimal `.htaccess` fallback only if Indexes is unavailable

Use an asset-directory file so the change has the smallest scope:

```text
/home/goodfjcw/public_html/assets/.htaccess
```

1. Enable **Show Hidden Files**.
2. If the file exists, copy it to the private Phase 1 archive and record its checksum; edit it without deleting or replacing existing content.
3. If it does not exist, create it at this exact asset-directory path.
4. Add exactly one standalone directive and a final newline:

```apache
Options -Indexes
```

5. Do not add or alter Passenger, rewrite, caching, compression, MIME, CORS, CSP, HSTS, or other security directives.
6. If `/assets/` or direct assets return `500`, immediately remove only this added line (or restore the archived file) and ask Namecheap to use the cPanel/provider-level index setting.

Do not apply both cPanel Indexes and a manual `.htaccess` change. Record which single method was used.

### Required indexing outcome

- Direct browsing to `/assets/` must no longer produce a page titled `Index of /assets/` or a file list.
- With cPanel No Indexing/`Options -Indexes`, the expected response is `403` for directory-only requests without an index document.
- Direct files beneath `/assets` must remain accessible.

## Phase D — validation plan

Run validation immediately after the manual cleanup, before emptying Trash.

### D1. Direct security and checksum checks

From the same trusted Mac used for the audit:

```sh
/usr/bin/curl --silent --show-error --output /dev/null --write-out '%{http_code}\n' https://goodwingoodge.com/assets/
/usr/bin/curl --silent --show-error --output /dev/null --write-out '%{http_code}\n' https://goodwingoodge.com/assets/public_html/
/usr/bin/curl --silent --show-error --output /dev/null --write-out '%{http_code}\n' https://goodwingoodge.com/assets/tracker-base.pre-strava-2026-09-06.js
/usr/bin/curl --fail --silent --show-error --location --output /tmp/team-goodwin-active-tracker.js https://goodwingoodge.com/assets/tracker-base.js
/usr/bin/curl --fail --silent --show-error --location --output /tmp/team-goodwin-active-map.mjs https://goodwingoodge.com/assets/strava-race-map.mjs
/usr/bin/shasum -a 256 /tmp/team-goodwin-active-tracker.js /tmp/team-goodwin-active-map.mjs
```

Expected:

- `/assets/` is `403` or otherwise not a listing.
- Nested directory and stale file are `404`, `410`, or `403`, never `200` content/listing.
- Active tracker SHA-256 remains `a6c9fea694c1bb73181ed1a9ca9801169326bd8194c576e453b2d4faf2928c54`.
- Active map SHA-256 remains `7a750659403f256d7a5305b84f164da7a75041d362627e016c6e5457c9de9b80`.

### D2. Page smoke test

Use a private/incognito browser window or disable cache because active assets advertise a seven-day browser cache. Load each route with a hard refresh:

- Homepage: `https://goodwingoodge.com/`
- The Run: `https://goodwingoodge.com/the-run/`
- Will: `https://goodwingoodge.com/will/`
- Fifty Runs: `https://goodwingoodge.com/fifty-runs/`
- Live tracking: `https://goodwingoodge.com/live-tracking/`

For every route confirm:

- Page status/content is normal.
- Layout, navigation, fonts, images, video, and interactions render.
- DevTools Console contains no new error.
- DevTools Network contains no new unexpected failed request.
- `document.images` has no incomplete/zero-width image:

```js
[...document.images]
  .filter((image) => !image.complete || image.naturalWidth === 0)
  .map((image) => image.currentSrc || image.src)
```

Expected result: `[]`.

The known pre-existing optional `/api/instagram-feed` `404`, if still emitted on Will, is outside Phase 1. Record it as baseline; do not fix it here. The acceptance criterion is no new Phase 1-related failure.

### D3. Active asset/network validation

With DevTools Network open and **Disable cache** enabled:

- Filter to the `goodwingoodge.com` origin.
- Confirm all requested JavaScript, module, CSS, image, video, JSON, and font resources are `200` or valid `304` responses with expected types.
- Confirm `/assets/tracker-base.js?v=20260831mobile-critical-path` loads successfully.
- Confirm `/assets/strava-race-map.mjs` loads successfully only as the map approaches the lazy threshold.
- Confirm no requested URL contains `tracker-base.pre-strava-2026-09-06.js` or `/assets/public_html/`.

### D4. Map lazy-load and structure validation

1. Reload at the top of `/live-tracking/` with Network cleared and cache disabled.
2. Before the map is near the viewport, confirm no `/strava/public/races` or `/strava/public/race-status` request begins.
3. Scroll until the map comes within its approximately 700-pixel lazy margin.
4. Confirm the map/module loads and exactly two public GETs appear:
   - `/strava/public/races`
   - `/strava/public/race-status`
5. Confirm there is no request to an admin, connect, callback, candidate, or webhook route.
6. After the map renders, run:

```js
({
  stateShapes: document.querySelectorAll('#mission-map .map-state').length,
  raceMarkers: document.querySelectorAll('#mission-map .map-stop').length,
  coreRoutePaths: document.querySelectorAll(
    '#mission-map .map-route.future, #mission-map .map-route.complete:not(.map-activity-route), #mission-map .map-route.rv'
  ).length,
  flightPaths: document.querySelectorAll('#mission-map .map-route.flight').length,
  runnerMarkers: document.querySelectorAll('#mission-map .map-entity-marker.runner').length,
  rvMarkers: document.querySelectorAll('#mission-map .map-entity-marker.rv').length
})
```

Expected:

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

Also click/keyboard-focus representative race markers, operate map zoom controls, and confirm the runner/RV images are not broken.

### D5. Static fallback validation

This is a browser-local test; do not alter or stop the backend:

1. In DevTools Request Blocking, block `*://goodwingoodge.com/strava/public/*`.
2. Reload `/live-tracking/`, approach the map, and let the client calls fail locally.
3. Confirm the complete static map still renders with 51 state shapes, 50 race markers, three core route paths, five flight paths, one runner, and one RV.
4. Confirm only the fixed/value-free fallback warning is emitted and there is no uncaught console error.
5. Remove request blocking and reload; confirm both public API calls return normally.

### D6. Local regression tests

Without rebuilding or deploying, run:

```sh
node --test tests/production-strava-map-merge.test.mjs tests/strava-map-integration.test.mjs
npm test
npm run check:cpanel
```

Expected baseline: focused tests **12/12**, full suite **96/96**, cPanel package check passes. A Phase 1 cPanel-only cleanup should not change local test results.

## Phase E — security regression

Record a before/after table in the change ticket:

| Check | Before | Required after |
|---|---|---|
| `/assets/` directory listing | `200`, LiteSpeed index visible | `403` or non-listing; no filenames exposed |
| Root stale backup | `200`, 76,645 bytes | `404`/`410`/`403` |
| `/assets/public_html/` | `200`, directory index | `404`/`403` |
| Nested stale duplicate | `200`, 76,645 bytes | `404`/`410`/`403` |
| Active tracker | `200`, SHA `a6c9fea...` | Same status, bytes, and SHA |
| Active Strava map module | `200`, SHA `7a750659...` | Same status, bytes, and SHA |
| Five primary routes | `200` | `200`, visually/structurally normal |
| Active site assets | Accessible | No new inaccessible asset or MIME change |
| Live map structure | 51/50/3/5/1/1 | Same counts |
| Public Strava near-map calls | Two allowed public GETs | Same behavior |
| Static fallback | Complete static map | Same behavior |
| Console/images/network | No Phase 1 issue | No new error/broken image/unexpected failure |

Do not extend the regression into admin authentication, webhook, database, headers, JSONP, GitHub, or dependencies; those are later phases.

## Rollback procedure

### If indexing causes direct-asset failures or HTTP 500

1. If cPanel **Indexes** was used, set `public_html/assets` back to its prior **Inherit** setting.
2. If the fallback `.htaccess` was used, remove only the added `Options -Indexes` line, or restore the exact archived pre-change `assets/.htaccess`.
3. Recheck `/assets/tracker-base.js`, `/assets/strava-race-map.mjs`, and the five primary pages.
4. Do not restore directory indexing merely because `/assets/` itself returns `403`; that is the intended result. Roll back only for direct-file/page failure or `500`.

### If a removed artifact is unexpectedly needed

1. Copy the private archive files back to their exact original paths; do not move the only private copy.
2. Restore root stale file to:

```text
/home/goodfjcw/public_html/assets/tracker-base.pre-strava-2026-09-06.js
```

3. Restore nested tree to:

```text
/home/goodfjcw/public_html/assets/public_html/assets/tracker-base.pre-strava-2026-09-06.js
```

4. Verify each restored file is 76,645 bytes with SHA-256 `743faaf0d6c76c80e9ee50443bbe1d03f6589f1983c51b0e4376d08f64bc2faf`.
5. Keep directory indexing disabled; direct known paths can function without a listing.
6. Re-run the smoke/map/network checks and document why the artifact proved necessary before changing the cleanup plan.

No Passenger restart, Strava backend change, database action, cache purge, source deployment, or Git operation is required for this Phase 1 rollback.

## Stop conditions

Stop and make no deletion if any of these occurs:

- The cPanel hidden-file view shows anything beyond the one expected nested file/directory structure.
- Any nested item is a symlink or has an unexpected type.
- Any source or archive checksum differs from `743faaf...`.
- The active tracker or map checksum differs from its baseline before changes.
- Any production HTML/JS/CSS newly references the stale filename or nested path.
- The private archive cannot be proven outside `public_html` or cannot be restricted to the account owner.
- The cPanel Indexes change cannot be scoped to `public_html/assets`.
- A direct active asset becomes inaccessible, changes content/type, or a primary page/map regresses.

## Execution decision

- **Root stale backup removal:** Safe to execute after private copy/checksum verification.
- **Nested tree removal:** Externally verified as redundant with no visible unique file; safe only after the cPanel hidden-file/symlink gate confirms the exact tree.
- **Directory indexing change:** Safe to execute using cPanel **No Indexing** scoped to `public_html/assets`; use only the one-line asset-level `.htaccess` fallback if the interface is unavailable.
- **Overall Phase 1:** **PASS — CLOSED.** The operator completed the authenticated cPanel gate and manual actions, and the final read-only production validation passed. See `docs/security/phase-1-validation-2026-09-07.md`.
