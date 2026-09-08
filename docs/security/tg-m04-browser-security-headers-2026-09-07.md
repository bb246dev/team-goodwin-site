# TG-M04 — Baseline browser security headers Stage A deployment runbook

**Prepared:** 2026-09-07  
**Production:** `https://goodwingoodge.com`  
**Hosting:** Namecheap shared hosting / cPanel / LiteSpeed, with Passenger at `/strava`  
**Authoritative audit:** `docs/security/cis-owasp-audit-2026-09-07.md`  
**Supporting inventory:** `docs/security/tg-m02-browser-headers-csp-2026-09-07.md`  
**Status:** **PASS / CLOSED — PRODUCTION VALIDATED**  
**Change class:** Root response-header configuration only; no application package, restart, migration, DNS change, or CSP change

## Scope and decision

This runbook covers audit finding **TG-M04** only. Audit item TG-M02 remains
closed as the asset/indexing cleanup. TG-M08 CSP work has not begun and is not
part of this change.

The Stage A change adds exactly four headers to static/public-site HTTPS
responses on `goodwingoodge.com` and `www.goodwingoodge.com`:

```http
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
X-Frame-Options: DENY
Permissions-Policy: accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()
```

The existing production policy must remain exactly:

```http
Strict-Transport-Security: max-age=86400
```

Do not add CSP or CSP Report-Only, change HSTS, add `includeSubDomains`, add
`preload`, or modify the Passenger application.

## 1. Root `.htaccess` evidence and mandatory pre-edit gate

### What the repository and deployment records establish

- No root `.htaccess` is present in the current workspace, the known
  production-merge tree, the cPanel application package, Git history, or the
  known-good checkpoint `4c0526b72282d5d681639285ead91b709cc410d6`.
- The authoritative audit records the live root `.htaccess` and virtual-host
  override policy as unavailable for external inspection.
- TG-M03 records a manually managed, host-scoped root HSTS block at
  `/home/goodfjcw/public_html/.htaccess`, deliberately outside Passenger,
  rewrite, caching, compression, and cPanel-generated sections.
- Production currently proves that the final HSTS value is emitted exactly
  once across static and Passenger responses. It does not reveal the full file
  ordering or whether cPanel later added generated sections.
- cPanel **Indexes → No Indexing** supplies the `/assets` indexing control; the
  TG-M04 block must not alter that setting or add `Options` directives.

Therefore the exact current live file cannot be reconstructed safely from the
repository. A read-only inspection of the complete live file and a private
checksum backup are mandatory immediately before manual deployment. This is a
deployment gate, not permission to change unrelated content.

### Stop conditions

Stop without editing if the live file contains any of the following that was
not already reconciled:

- another `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, or
  `Permissions-Policy` source;
- a global/unconditional `Header` rule that would overlap the proposed rule;
- a different or duplicate HSTS source;
- a generated-section marker that would place the proposed block under cPanel
  ownership;
- an unexpected `/strava` rewrite or mount rule that changes the original
  request URI before root header evaluation;
- an include of another file that owns response headers; or
- syntax, ownership, or permission uncertainty.

If a stop condition exists, preserve the file and reconcile it before any
deployment. Do not guess, merge competing rules, or weaken Strava.

## 2. Exact TG-M04 Stage A block

Add this exact standalone block only after the pre-edit gate passes:

```apache
# BEGIN TG-M04 BASELINE BROWSER SECURITY HEADERS
<IfModule mod_headers.c>
  Header always set X-Content-Type-Options "nosniff" "expr=%{HTTPS} == 'on' && %{HTTP_HOST} =~ m#(?i)^(www\.)?goodwingoodge\.com(?::443)?$# && %{REQUEST_URI} !~ m#^/strava(?:/|$)#"
  Header always set Referrer-Policy "strict-origin-when-cross-origin" "expr=%{HTTPS} == 'on' && %{HTTP_HOST} =~ m#(?i)^(www\.)?goodwingoodge\.com(?::443)?$# && %{REQUEST_URI} !~ m#^/strava(?:/|$)#"
  Header always set X-Frame-Options "DENY" "expr=%{HTTPS} == 'on' && %{HTTP_HOST} =~ m#(?i)^(www\.)?goodwingoodge\.com(?::443)?$# && %{REQUEST_URI} !~ m#^/strava(?:/|$)#"
  Header always set Permissions-Policy "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()" "expr=%{HTTPS} == 'on' && %{HTTP_HOST} =~ m#(?i)^(www\.)?goodwingoodge\.com(?::443)?$# && %{REQUEST_URI} !~ m#^/strava(?:/|$)#"
</IfModule>
# END TG-M04 BASELINE BROWSER SECURITY HEADERS
```

The four directives passed a read-only syntax check under local Apache 2.4.67:
`Syntax OK`. This confirms the Apache expression grammar, not the unknown live
LiteSpeed build or file context. Any production `500` requires immediate
rollback.

### Why the conditions are narrow

- `%{HTTPS} == 'on'` limits the change to HTTPS responses.
- The anchored Host expression allows only the apex and `www`, optionally with
  the default HTTPS port. It excludes staging and the known Namecheap/cPanel,
  mail, and service aliases that share infrastructure.
- `%{REQUEST_URI} !~ m#^/strava(?:/|$)#` excludes both the exact `/strava`
  mount and every path below it. Query strings do not expand this scope.
- `set`, rather than `add` or `append`, avoids deliberately creating multiple
  values in the selected header table.
- `always` applies the headers to static non-2xx/error responses and internal
  redirects where tenant root rules are evaluated.
- A standalone marked block makes rollback exact and prevents accidental
  editing of the accepted HSTS line.

## 3. Exact insertion point and cPanel action

These are operator instructions for a separately authorized manual deployment;
they were not executed during preparation.

1. Sign in to the normal Namecheap cPanel account with MFA. Open **File
   Manager** and enable **Show Hidden Files (dotfiles)**.
2. Open `/home/goodfjcw/public_html/.htaccess`. Do not edit an `.htaccess`
   inside `assets`, the Passenger application root, or another directory.
3. Copy the complete file outside `public_html`, for example:
   `/home/goodfjcw/security-backups/2026-09-07/tg-m04/public_html.htaccess.pre-tg-m04`.
   Use owner-only directory/file permissions (`0700`/`0600`) where cPanel
   permits. Record filename, byte count, timestamp, and SHA-256.
4. Read the entire live file and apply every stop condition above. Confirm the
   existing HSTS response directive remains the single source of
   `max-age=86400`.
5. Prefer inserting the standalone TG-M04 block **immediately after the
   complete existing TG-M03 HSTS block and before the first rewrite,
   Passenger, cache, compression, or generated cPanel section**. If the live
   file already orders HSTS after another unmanaged section, place TG-M04
   immediately after HSTS without moving any existing line. If HSTS is inside
   a generated/coupled section or no adjacent unmanaged root location exists,
   stop. Do not nest TG-M04 inside or edit the HSTS block.
6. Do not move, reformat, deduplicate, or alter any existing line. Save once.
7. Immediately run the header, Strava, and functional validation below. A
   `500`, missing value, duplicate/conflicting value, static header on
   `/strava`, changed HSTS, or material functional regression triggers
   rollback.

The desired order is conceptual and preserves ownership boundaries:

```text
existing unmanaged root directives
existing TG-M03 HSTS block (unchanged)
new standalone TG-M04 block
existing rewrite / Passenger / cache / compression sections (unchanged)
existing generated cPanel sections (unchanged)
```

If the actual live ordering cannot satisfy that layout without entering a
generated or coupled section, stop and obtain a configuration-specific review.

## 4. Current and expected wire behavior

Fresh read-only production checks during preparation reconfirmed:

- `/` returns HTTP 200 with exactly one HSTS field and none of the four TG-M04
  fields.
- `/strava/health`, `/strava/public/races`, and
  `/strava/public/race-status` return HTTP 200 with the application's enforced
  `default-src 'none'; frame-ancestors 'none'; base-uri 'none'`,
  `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, and the
  single accepted HSTS field.
- Unauthenticated `/strava/status` and `/strava/connect` return HTTP 401 with
  the same Strava security headers. An unauthenticated `/strava/webhook` check
  returned HTTP 403 with the same Strava security headers.

After Stage A, every in-scope static response should contain exactly one of
each of the four TG-M04 values and exactly one existing HSTS value. No Strava
response should gain `X-Frame-Options`, `Permissions-Policy`, the static
referrer value, or a second `nosniff` field from the root rule.

## 5. Static error-response behavior

The block intentionally uses `Header always set`. Expected in-scope results:

- a representative static 404 receives all four TG-M04 fields;
- `/assets/` remains a non-listing HTTP 403 and receives all four fields if the
  root `.htaccess` participates in that generated response;
- other static errors receive the fields when LiteSpeed evaluates tenant root
  rules for them; and
- Passenger 401/403/404 responses remain excluded and retain only their
  application-generated header profile.

Provider-generated failures that occur before tenant `.htaccess` processing
may not receive application-owner headers. That limitation must not be
misreported as provider-level compliance.

## 6. Post-deployment validation

### Exact header matrix

Request each URL independently with cache-busting/no-cache where useful and
inspect raw response fields, not only browser developer-tool summaries.

Static HTML:

- `/`
- `/the-run/`
- `/will/`
- `/fifty-runs/`
- `/live-tracking/`

Static resources:

- JavaScript: `/assets/tracker-base.js`
- CSS: `/assets/tracker-base.css`
- image: `/assets/mission-america-logo.png`
- font: `/fonts/font-8.ttf`
- video: `/assets/hero-signal-optimized.mp4`
- representative static 404 with a unique nonce path
- `/assets/` as the existing representative static 403

Every in-scope response must contain exactly one:

```http
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
X-Frame-Options: DENY
Permissions-Policy: accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()
Strict-Transport-Security: max-age=86400
```

Fail validation for duplicate fields, comma-joined duplicates, altered values,
conflicting policies, HSTS changes,
`includeSubDomains`, `preload`, any CSP/CSP Report-Only field introduced by
TG-M04, or any unexpected HTTP 500.

### Strava exclusion and regression

Check these unauthenticated paths without submitting or changing state:

- `/strava/health` — HTTP 200 and exactly `{"status":"ok"}`
- `/strava/public/races` — HTTP 200 and 50 races
- `/strava/public/race-status` — HTTP 200 and correct inactive pre-race state
- `/strava/status` — HTTP 401 with the existing Basic challenge
- `/strava/connect` — HTTP 401 with the existing Basic challenge
- `/strava/webhook` — existing unauthenticated verification behavior; do not
  send a webhook event
- representative `/strava` 404

For every Strava response:

- `Content-Security-Policy` remains exactly
  `default-src 'none'; frame-ancestors 'none'; base-uri 'none'`;
- `Referrer-Policy` remains exactly `no-referrer`;
- `X-Content-Type-Options` remains exactly one `nosniff`;
- the accepted HSTS value remains exactly once; and
- the static `strict-origin-when-cross-origin`, `X-Frame-Options`, and
  `Permissions-Policy` values are absent.

This proves the original request URI exclusion works before Passenger handling,
including whether Passenger later strips `/strava` internally.

### Functional regression

- Homepage, The Run, Will, Fifty Runs, and Live Tracking return HTTP 200 with
  expected content.
- Browser checks show no new console errors, broken images, mixed behavior, or
  unexpected first-party failures.
- Map lazy loading remains inactive before the viewport gate and activates near
  the map.
- The map renders 51 state shapes, 50 race markers, three core route paths,
  five flight paths, one runner marker, and one RV marker.
- Strava public API requests begin near the map viewport, use the correct
  first-party paths, and preserve static fallback behavior.
- Google Sheets updates work with cold and warm cache and preserve the failure
  fallback.
- Google Tag Manager/Analytics requests remain expected; the referrer policy
  may reduce cross-origin referrers to the origin by design.
- Local fonts render; the hero video loads/plays as before; images have no load
  failures.
- Desktop Chrome/Safari and representative mobile Chrome/Safari behavior is
  healthy.
- No CSP or CSP Report-Only header appears on the static site in this stage.

## 7. Rollback

Rollback must preserve TG-M03.

1. Remove only the lines between and including the two TG-M04 marker comments.
   Do not edit the adjacent HSTS block or any other directive.
2. If any other byte changed, or if file integrity is uncertain, restore the
   private checksum-verified pre-TG-M04 `.htaccess` backup instead.
3. Confirm the restored live file matches the recorded pre-change SHA-256.
4. Re-request the homepage, an active asset, a static 404/403, `/strava/health`,
   and a protected Strava route. Confirm no 500, the four TG-M04 static fields
   are gone, Strava headers remain unchanged, and HSTS remains exactly:
   `Strict-Transport-Security: max-age=86400`.
5. Preserve the backup and validation evidence privately. No Passenger restart,
   application upload, database migration, DNS change, or cache purge should be
   required solely for this header rollback.

## 8. Readiness and closure rule

**Pre-deployment TG-M04 readiness was PASS, subject to the mandatory live-file
inspection and checksum-backup gate.** The production MIME inventory was
compatible with `nosniff`; no legitimate framing or disabled-capability
dependency was found; and the exact block was host-, HTTPS-, and path-scoped.
The change was small and directly reversible.

The deployment would have been blocked if the live-file pre-edit gate had
exposed an unexpected header source, generated section, include, or URI-rewrite
interaction requiring reconciliation.

The complete production header, Strava, error-response, browser, map, Google
Sheets, analytics, font, video, and HSTS validation passed on 2026-09-07.
TG-M04 is therefore **CLOSED**. TG-M08 CSP work remains a separate later
authorization and was not started.

## 9. Final production validation — 2026-09-07

### Result

**TG-M04 PASS / CLOSED.** Validation was read-only. No production, `.htaccess`,
cPanel, application/runtime code, database, DNS, GitHub, HSTS, or CSP state was
changed, and nothing was deployed or committed.

### Static header evidence

Fresh no-cache/cache-busted requests checked the apex homepage, The Run, Will,
Fifty Runs, Live Tracking, `tracker-base.js`, `tracker-base.css`,
`strava-race-map.mjs`, a representative image, font, and video, a unique static
404, `/assets/` as the existing static 403, and the `www` homepage. Expected
statuses were preserved: pages/assets returned 200, the unique path returned
404, and `/assets/` returned 403 without a listing.

Every response in that static matrix contained exactly one of each:

```http
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
X-Frame-Options: DENY
Permissions-Policy: accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()
Strict-Transport-Security: max-age=86400
```

There were no duplicates, comma-joined duplicates, or conflicting values. HSTS
contained neither `includeSubDomains` nor `preload`. Static responses did not
gain CSP or CSP Report-Only.

The active asset hashes also remained at the controlled Phase 1 baselines:

```text
tracker-base.js      a6c9fea694c1bb73181ed1a9ca9801169326bd8194c576e453b2d4faf2928c54
strava-race-map.mjs  7a750659403f256d7a5305b84f164da7a75041d362627e016c6e5457c9de9b80
```

### Strava exclusion and authentication evidence

The following production responses retained exactly one application-owned CSP,
referrer, `nosniff`, and HSTS field, while receiving no static X-Frame-Options
or Permissions-Policy field:

```http
Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
Strict-Transport-Security: max-age=86400
```

Observed route results:

- `/strava/health`: 200 and exactly `{"status":"ok"}`.
- `/strava/public/races`: 200 and exactly 50 races.
- `/strava/public/race-status`: 200, `active:false`, `completedRaces:0`,
  `totalRaces:50`, and the expected `ggma-2026` window.
- `/strava/status`: 401 with the existing Basic challenge.
- `/strava/connect`: 401 with the existing Basic challenge.
- invalid webhook verification: 403 and the existing generic rejection.
- representative Passenger 404: 404 and the existing generic response.

This proves the root rule excluded both the `/strava` mount and its children;
there was no duplicate `nosniff` or conflicting referrer policy. The live
William Goodge connection was not exposed through an unauthenticated request.
The prior operator-confirmed connected status, current healthy public snapshot,
and unchanged OAuth/connection tests provide the authorized non-secret
regression evidence; no connection or credential state was modified.

### Browser, public-site, and map evidence

Fresh isolated-Chrome and in-app-browser checks found:

- all five representative pages returned 200 with their expected title/content;
- ordinary navigation from the homepage to The Run worked;
- no page required an iframe/frame, so `DENY` did not break a framing feature;
- document images reported no failed loads; local fonts loaded and Inter was
  available; homepage/Live Tracking video reached ready state 4 without error;
- Google Sheets GViz and Google Tag Manager returned 200, and Google Analytics
  collection returned 204;
- the homepage map remained unloaded before its viewport gate, then initialized
  near the viewport;
- the fresh map rendered 51 state shapes, 50 race markers, three core route
  paths, five flight paths, one runner marker, and one RV marker;
- both `/strava/public/races` and `/strava/public/race-status` were requested and
  applied, with the accessible map label reporting 0 of 50 races complete; and
- a separate fresh context that blocked the Strava map module and public API
  requests in the browser still rendered the complete 51/50/3/5/runner/RV
  static fallback.

The root and `/live-tracking/` response bodies remained byte-identical at
SHA-256 `edfe3abd43998cf94655c92a1a7cda8e1137bc5f37a50b4858e10b1689910d51`,
matching the previously validated production body. No new console or network
error attributable to TG-M04 was found.

Two existing route-relative behaviors were visible in a truly fresh profile
and are not caused by response headers: `/will/` still receives the known
optional `/api/instagram-feed` 404/fallback, and direct `/live-tracking/`
initially requests its topology and runner/RV PNGs beneath
`/live-tracking/assets/`. The topology has an existing successful fallback;
the two marker PNG candidates return 404 on that alias even though the marker
groups and the canonical homepage map are present. The identical pre-change
body hash and unchanged active asset hashes prove this was not introduced by
TG-M04. It is a separate route-relative asset issue to triage in an authorized
application phase; it does not weaken or invalidate the header deployment.

### Automated regression evidence

The exact requested runtime was reused from the existing temporary npm cache:

```text
Node v22.23.2
Focused security/startup/public-API/map suite: 28 passed, 0 failed
Full repository suite:                         97 passed, 0 failed
cPanel package validation:                     passed, 19 files
git diff --check:                              passed
```

The first sandboxed focused run could not bind `127.0.0.1` and reported nine
`listen EPERM` failures. The identical suite passed 28/28 unchanged when
loopback binding was permitted, confirming an execution-sandbox limitation
rather than an application failure.

### Closure and next item

There are no remaining TG-M04 findings. The validated block is safe to retain,
and rollback remains removal of only the marked TG-M04 block or restoration of
the checksum-verified pre-change `.htaccess` backup while leaving TG-M03 HSTS
unchanged.

The next recommended separately authorized item is **TG-M05 — validate the
expected Strava webhook subscription and add idempotency/concurrency/rate
controls**. TG-M08 CSP remains open but was not started during this validation.

## References

- Apache HTTP Server 2.4 `mod_headers`:
  <https://httpd.apache.org/docs/2.4/mod/mod_headers.html>
- LiteSpeed security response headers:
  <https://docs.litespeedtech.com/lsws/security-headers/>
