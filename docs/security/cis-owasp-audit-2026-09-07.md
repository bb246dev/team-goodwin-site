# Team Goodwin CIS/OWASP Security Audit

**Assessment date:** 2026-09-07  
**Assessment type:** Read-only code, dependency, deployment-surface, HTTP, TLS, and configuration review  
**Production target:** `https://goodwingoodge.com` and the `/strava` Passenger application  
**Repository:** `bb246dev/team-goodwin-site`  
**Reproducible code baseline:** commit `4c0526b72282d5d681639285ead91b709cc410d6`  
**Overall posture:** **Moderate risk; generally strong application controls with material web-server, operational, and software-supply-chain hardening gaps**  
**Safe to remediate:** **YES**, through controlled, separately approved changes with backups and regression tests. The original audit was read-only; subsequent Phase 1, TG-M01, TG-M03, and TG-M04 remediation/closure evidence is recorded inline.

## Executive summary

No critical or high-severity vulnerability was confirmed. The Strava application's core security design is notably strong for a small shared-hosting deployment: routes and methods are allowlisted; administrative routes require a long secret; OAuth state is random, browser-bound, expiring, hashed, and single-use; remote connection links are hashed and single-use; tokens are encrypted with AES-256-GCM; outbound Strava requests are pinned to the provider origin and do not follow redirects; SQL uses placeholders with multiple statements disabled; request bodies and timeouts are bounded; CORS is restricted; error responses are generic; and the public database projection is deliberately narrow. The current 110-test Node 22.23.2 suite and 20-file cPanel package check pass; `npm audit --omit=dev --audit-level=low` reported zero known vulnerabilities in both package roots on the original assessment date.

The principal remaining risks are outside that core: an active Google Sheets JSONP flow, absent CSP, and several DOM construction paths need stronger trust boundaries; the unsigned, public GitHub `main` branch has no protection or CI security gates; and administrator perimeter/credential-lifecycle controls still depend on unverified hosting features. Phase 1 disabled public asset indexing and removed the confirmed stale/nested public artifacts. TG-M01 replaced the detailed public startup diagnostic with one generic health contract. TG-M03 closed with a validated host-only 24-hour HSTS policy and explicit acceptance of its shorter-duration residual risk. TG-M04 added and validated baseline static browser headers. TG-M05 now validates the private webhook subscription, durably deduplicates and orders events, recovers interrupted work, bounds webhook abuse, and throttles failed administrator authentication across Passenger workers. Most remaining CIS host and MariaDB controls cannot be proven without authenticated cPanel, filesystem, database, and provider evidence.

### Open finding counts after Phase 1, TG-M01, TG-M03, TG-M04, and TG-M05 closure

| Severity | Count |
|---|---:|
| Critical | 0 |
| High | 0 |
| Medium | 3 |
| Low | 6 |
| Informational | 2 |

### CIS objective status counts

The formal matrix below contains 48 applicable objective checks plus one Linux applicability decision. Because production identifies itself as LiteSpeed rather than Apache, the CIS Apache HTTP Server 2.4 Benchmark is used as the nearest public HTTP-server baseline by control objective, not as a claim that this is an Apache CIS-CAT assessment. Report-local IDs such as `AH-07` are not official CIS recommendation numbers.

| Status | Count |
|---|---:|
| PASS | 20 |
| FAIL | 6 |
| PROVIDER-CONTROLLED | 13 |
| UNABLE TO VERIFY | 9 |
| NOT APPLICABLE | 1 |

## Scope, evidence, and integrity

### In scope

- The tracked repository at the stated commit, including static HTML/assets, Node.js application code, database migrations/seeds, deployment scripts, documentation, and tests.
- Existing uncommitted and untracked workspace material only to identify drift, duplicate deployment trees, and dead-code candidates. It was not assumed to be deployed.
- Current public HTTP/TLS behavior for representative static pages, Strava public/admin/webhook routes, sensitive-path probes, directory behavior, redirects, methods, error responses, and cPanel's public login surface.
- GitHub's unauthenticated repository/branch metadata and local Git configuration/history indicators.
- Runtime dependencies and lockfiles in the root and `strava-app` package roots.
- CIS Apache HTTP Server 2.4 v2.4.0 objectives as the nearest HTTP-server baseline, CIS MariaDB 10.11 v1.0.0 or MariaDB 10.6 v1.1.0 depending on the version the host confirms, CIS Controls v8/v8.1 supply-chain themes, OWASP ASVS 5.0.0, and OWASP Top 10:2025.

### Read-only restrictions honored

- No source, configuration, cPanel, production, database, DNS, GitHub setting, dependency, OAuth, webhook registration, or hosting state was changed.
- No build, commit, push, deployment, package installation, migration, or authenticated administrative request was performed.
- Only this report was created.
- Existing workspace changes were preserved. At the end of collection, pre-existing modifications remained in `build-offline.mjs`, `dist/README.txt`, and `dist/server/index.js`, with pre-existing untracked benchmark, Hapn integration, production-merge, and gradient files. The audit did not adopt or overwrite them.
- Production shell checks used absolute system executables to avoid the earlier PATH/tooling problem.

### Methods used

- Manual source and configuration review, route/data-flow tracing, Git tracked-file and status review, secret-pattern review of the current tree/workspace and high-confidence patterns in Git patch history.
- Safe unauthenticated HTTP requests and header inspection; selective `OPTIONS` and `TRACE` behavior checks; no credential guessing, brute force, fuzzing, high-volume traffic, or destructive request.
- TLS 1.0/1.1/1.2/1.3 negotiation tests, certificate/chain inspection, and hostname verification. No aggressive cipher enumeration was performed.
- `npm ls --omit=dev --all`, lockfile/script review, and two explicit npm advisory lookups. The npm audit requests disclosed dependency names and versions to the npm registry; they did not upload project source, secrets, configuration contents, or user data and made no updates.
- Existing test suite and package checker. The first sandboxed test run produced 16 `listen EPERM` results because local socket binding was prohibited; the identical read-only suite passed 96/96 after localhost binding was allowed.
- Unauthenticated GitHub API inspection. Account-only settings were not inferred where the API returned `401`.

### Limitations

- No authenticated cPanel, SSH, filesystem, MariaDB, phpMyAdmin, Namecheap support, GitHub administration, Strava administration, DNS, backup console, or log-console access was used.
- Exact LiteSpeed, Passenger, MariaDB, cPanel, operating-system, kernel, OpenSSL-on-host, and WAF/ModSecurity versions or policies are **UNABLE TO VERIFY**. Node.js `22.23.2` is carried forward from the previously verified production checkpoint; this run reconfirmed that the package declares Node `22.x`, but did not authenticate to cPanel to re-read the live version.
- Linux-distribution CIS controls are **NOT APPLICABLE to this external tenant audit** until the provider identifies the OS and exposes evidence. They must not be recorded as passed.
- The LibreSSL client available locally did not support two initially attempted OpenSSL display flags. Tests were repeated with compatible commands; TLS results below are from the corrected checks.
- No complete authenticated cipher suite scan, dynamic browser penetration test, stored-XSS injection, request-flood test, credential test, database query, malware scan, or full binary Git-object secret scanner was run.
- `npm audit` is registry- and time-dependent and does not cover opaque prebuilt browser bundles, provider software, external scripts, or code not represented in a package lock.
- Production/repository parity was not proven for every file. The public `strava-race-map.mjs` SHA-256 matched the reviewed deployment asset, and the GitHub default branch matched the checkpoint commit; that is not a full-file attestation of `public_html` or the Passenger root.

## Technology and trust-boundary inventory

| Layer | Observed/reviewed technology | Trust/security notes |
|---|---|---|
| Public site | Static HTML, CSS, JavaScript, images, fonts | Hosted beneath Namecheap `public_html`; LiteSpeed response headers; Phase 1 disabled directory indexing under `/assets` |
| Application | Node.js 22 Passenger app mounted at `/strava` | Package requires Node `22.x`; known checkpoint reported live `22.23.2`; fixed public origin `https://goodwingoodge.com` |
| Database | MariaDB/MySQL via `mysql2` | Dedicated user is documented; actual server version, grants, bind/TLS, logging, backup, and at-rest encryption are unverified |
| Hosting | Namecheap shared cPanel, LiteSpeed, Passenger | OS, module policy, front-end limits, WAF, patch process, audit logging, and tenant isolation are provider-controlled or unverified |
| Source control | Public GitHub repository | Default branch `main`; unprotected at inspection time; no workflows; latest commit unsigned |
| OAuth/API | Strava OAuth and activity API | Fixed provider origin, bounded requests, encrypted tokens, restrictive application flow |
| Browser data | Google Sheets JSONP, Google Tag Manager/Analytics, local static media, optional Instagram feed | JSONP and tag manager execute supplier-controlled script in the site origin; CSP is absent |
| User storage | Browser `localStorage` for ticker cache, intro state, local email/comment demos | No server persistence in the reviewed paths; DOM rendering still needs safe construction |

## Production observations

### HTTP and route behavior

| Surface | Result | Security interpretation |
|---|---|---|
| `/`, `/the-run/`, `/will/`, `/fifty-runs/`, `/live-tracking/` | `200 text/html`, `Cache-Control: no-cache, must-revalidate` | HTTPS works with one validated host-only `Strict-Transport-Security: max-age=86400`; TG-M04 adds one `nosniff`, strict-origin referrer, `DENY` framing, and restricted Permissions-Policy field; CSP remains absent and is tracked under TG-M08 |
| `/strava/public/races` | `200 application/json` | Narrow public data contract; secure API response headers; first-party-only CORS; public cache policy |
| `/strava/public/race-status` | `200 application/json` | Same security posture as public races |
| `/strava/connect`, `/status`, `/candidates` | `401`, `WWW-Authenticate: Basic`, `no-store` | Administrative gate is active; no authentication bypass observed |
| `/strava/webhook` without verification token | `403` | Verification secret gate active |
| `/strava/health` | `200 application/json` | Generic `{"status":"ok"}` only, with the normal Strava CSP/referrer/`nosniff` policy and `no-store` |
| `/strava/health-startup` | `404 application/json` | Retired legacy diagnostic; former readiness fields are not exposed |
| `/.env`, `/.git/config`, `/strava/.env` | `403` | Sensitive dot paths denied |
| `/package.json`, `/package-lock.json`, `/strava/README.md`, `/node_modules/`, `/dist/` | `404` | No direct exposure observed |
| `/strava/package*.json`, migrations, seeds, private config names, backup ZIP names | `404` | Passenger deployment internals were not web-accessible at tested paths |
| `/assets/` | `403` in final Phase 1 validation | Directory listing disabled; direct legitimate assets remain available |
| `/assets/public_html/` | `403` in final Phase 1 validation | Accidental nested deployment tree is no longer browsable; previously observed nested file returns `404` |
| `/assets/tracker-base.pre-strava-2026-09-06.js` | `404` in exact and cache-busted final checks | Stale rollback/source asset is no longer publicly downloadable |
| `/server-status` | `403` | Status endpoint not public |
| `/server-info`, `/manual`, `/icons` | `404` | Default documentation/info not exposed at tested paths |
| `/cgi-bin` | `403` | Default path restricted |
| HTTP versions of representative pages/API routes | `301` to exact HTTPS URL | Redirect behavior is sound; apex and `www` HTTPS responses now carry the accepted host-only HSTS policy |
| `TRACE /` | `501` | TRACE not implemented |
| `OPTIONS /` | `200`, `Allow: OPTIONS, HEAD, GET, POST` | Static front end advertises unnecessary POST support; actual body handling was not tested |
| Unknown/error paths | Generic LiteSpeed or application errors | No stack trace, filesystem path, SQL detail, or secret observed |

The retired startup diagnostic originally returned the following secret-free but operationally revealing shape:

```json
{"server":"running","configLoaded":true,"mysqlModuleLoaded":true,"mysqlPoolCreated":true,"databaseReachable":true,"stravaConfigValid":true,"startupErrorCategory":"none"}
```

### Security headers

| Header/control | Static pages | Strava normal JSON routes | Generic health |
|---|---|---|---|
| Strict-Transport-Security | `max-age=86400` | `max-age=86400` | `max-age=86400` |
| Content-Security-Policy | Missing; tracked under TG-M08 | `default-src 'none'; frame-ancestors 'none'; base-uri 'none'` | `default-src 'none'; frame-ancestors 'none'; base-uri 'none'` |
| X-Content-Type-Options | `nosniff` | `nosniff` | `nosniff` |
| Referrer-Policy | `strict-origin-when-cross-origin` | `no-referrer` | `no-referrer` |
| Clickjacking control | `X-Frame-Options: DENY` | CSP `frame-ancestors 'none'` | CSP `frame-ancestors 'none'` |
| Permissions-Policy | `accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()` | Missing | Missing |
| Cache policy | `no-cache, must-revalidate` | `no-store` for admin; controlled public caching for public data | `no-store` |

### CORS and unauthenticated negative tests

- Public Strava routes returned `Access-Control-Allow-Origin: https://goodwingoodge.com` only when that exact origin was supplied. An attacker-controlled origin received no ACAO; credentials and wildcards were absent.
- Administrative and webhook routes returned no ACAO to an attacker-controlled origin.
- An attacker-origin preflight to a public route returned `405` with `Allow: GET` and no ACAO.
- Malformed/empty webhook JSON returned a generic `400`; `text/plain` returned `415`; an unauthenticated candidate assignment returned `401`; an invalid athlete connection token returned a generic `400`.
- The callback without state returned a generic `400` and expired the `__Host-goodwin-strava-state` cookie with `HttpOnly`, `Secure`, `SameSite=Lax`, and `Path=/`.

### TLS

- TLS 1.2 and TLS 1.3 negotiated successfully with certificate verification code `0`.
- TLS 1.0 and TLS 1.1 were rejected with a protocol-version alert.
- Certificate subject/SANs cover `goodwingoodge.com` and `www.goodwingoodge.com`.
- Issuer: SSL.com TLS Issuing RSA CA R1; RSA 2048-bit key; SHA-256 signature; observed validity 2026-08-31 through 2027-03-17; chain validation succeeded.
- HTTP/2 was observed.
- No `http://` active subresource was found in the representative HTTPS home-page markup; no mixed-content finding was confirmed.
- No aggressive/complete cipher enumeration was performed, so weak-cipher disablement beyond the negotiated samples is **UNABLE TO VERIFY**.

### cPanel surface

The public cPanel login on port `2083` was reachable, which is normal for shared cPanel hosting. Its inspected response used secure, HttpOnly, SameSite=Lax cookies plus `X-Frame-Options: SAMEORIGIN` and `X-Content-Type-Options: nosniff`. No exact cPanel version was disclosed. Brute-force protection, MFA enforcement, source-IP restrictions, account lockout, notifications, and patch status require authenticated/provider evidence.

## Positive controls confirmed

- Fixed route and method allowlists; unknown endpoints return `404`, and unexpected methods return `405`.
- Fixed production origin rather than trusting forwarded host headers.
- Administrative token has a 32-character minimum and is compared through SHA-256 plus a full comparison loop.
- OAuth state and remote athlete link values use 32 random bytes, are stored only as hashes, expire, and are atomically single-use.
- Browser binding uses a `__Host-` cookie with secure attributes; duplicate parameters fail closed.
- OAuth redirect URI, scopes, authorization origin, token origin, and Strava API origin are fixed. Provider redirects are rejected and requests have 10-second timeouts.
- Stored Strava access/refresh tokens use AES-256-GCM with random 96-bit IVs and athlete/version additional authenticated data. Refresh rotation is saved behind a database lease/transaction.
- Secret configuration is designed for a fixed file outside the app and web roots, limited to 16 KiB and an explicit key allowlist. Documentation requires owner-only mode `0600`.
- `mysql2` uses a five-connection pool, bounded queue, idle settings, `utf8mb4`, UTC, and `multipleStatements: false`.
- Reviewed SQL calls use `execute()` placeholders; transactional locks, unique indexes, foreign keys, and the one-race/one-activity match table protect integrity.
- Public activity data is type/range checked; polyline characters/length are constrained; pending/excluded rows, athlete metadata, review data, and credentials are not selected publicly.
- Webhook and admin JSON bodies are content-type checked, stream limited (16 KiB/4 KiB), and subject to one-second body deadlines.
- Application server header, request, and keep-alive timeouts are set to 10, 15, and 5 seconds.
- Errors hide provider bodies, request details, filesystem paths, SQL messages, and secrets; webhook logs are allowlisted.
- Activity fetches are allowed only during the fixed 2026-10-09 through 2026-11-01 operational window and fetched activity ownership/start time are checked.
- Sensitive external paths returned `403`/`404`; no high-confidence secret or private key was found in the current tracked tree, workspace scan, or high-confidence Git patch-history patterns.

## Findings and exact remediation guidance

### TG-M01 — Public startup diagnostic exposes internal readiness state (Medium)

**Remediation status — 2026-09-07:** **PASS / CLOSED.** Final uncached production validation returned HTTP 200 and exactly `{"status":"ok"}` from `/strava/health`, with `no-store`, CSP, referrer, and `nosniff` headers. `/strava/health-startup` and five other source/test-derived legacy forms returned 404 with no readiness data. Public races/status, administrator boundaries, webhook verification, OAuth regression tests, and the production map passed. Node 22.23.2 tests passed 40/40 focused and 97/97 full; the 19-file cPanel package validator passed. Full evidence: `docs/security/tg-m01-health-endpoint-remediation-2026-09-07.md`.

**Why it matters:** The response lets any visitor distinguish configuration, module, pool, database, and Strava-validation states. It does not expose secrets, but it improves timing/reconnaissance and can reveal outages or deployment mistakes. Its special response path also bypasses the normal Strava security headers.

**Initial evidence:** `GET /strava/health-startup` returned `200` and the six component booleans/category shown above. The source called it temporary in `strava-app/README.md:124`; the former `strava-app/app.js:192-217` path allowed four aliases and wrote the detailed state without the normal header helper. The final production evidence supersedes this initial exposure state.

**Affected component:** Passenger startup listener and public `/strava` mount.

**Implemented remediation:** The deployment retains only `GET /strava/health`, returning `200 {"status":"ok"}` or `503 {"status":"unavailable"}` with no component fields. Former paths return 404. The public state object/serializer was removed; sanitized startup categories remain only in private Passenger logs. Tests prove healthy and failure schemas, retained/stripped mounts, legacy 404 behavior, and absence of the former fields.

**Control mapping:** OWASP Top 10:2025 A02 Security Misconfiguration and A10 Mishandling of Exceptional Conditions; OWASP ASVS 5.0 configuration/error-handling themes; CIS HTTP information-disclosure objectives.

**Regression/compatibility risk:** Low to moderate. Passenger or Namecheap health checks may rely on the endpoint. Confirm the cPanel application monitor and any external uptime monitor before removal.

**Namecheap/cPanel steps:** Check cPanel Application Manager and cron/monitor definitions for the current URL; change them to the generic endpoint or process-level check; upload the reviewed app package; restart Passenger; inspect the application log once.

**Validation:** Unauthenticated detailed URLs return 404; `/strava/health` is schema-constant; valid routes remain healthy; failure-mode tests do not reveal which dependency failed; 40 focused and 97 full tests plus the cPanel package check are green.

### TG-M02 — Public asset directory indexing and stale deployment trees (Medium)

**Phase 1 final validation update — 2026-09-07:** **PASS / CLOSED for the scoped public-exposure cleanup.** An initial validation found the root stale tracker still returning `200`; after the final manual removal, the exact URL and two cache-busted/no-cache variants returned `404`. `/assets/` and `/assets/public_html/` returned `403`, the previously inventoried nested tracker returned `404`, active hashes matched the controlled baseline, 51/51 checked first-party assets passed, the complete map and Strava checks passed, Node 22.23.2 tests passed 12/12 focused and 96/96 full, and the cPanel package validator passed. Full evidence: `docs/security/phase-1-validation-2026-09-07.md`. Long-term allowlisted release packaging remains tracked separately under supply-chain controls and is not part of this completed cleanup phase.

**Why it matters:** Auto-indexing turns accidental uploads into discoverable content. The current listing exposes rollback JavaScript, duplicate assets, and a nested `public_html` packaging tree. No secret was found, but future backups/configs could become immediately enumerable, and old executable JavaScript expands the attack/supply-chain surface.

**Initial audit evidence:** `/assets/`, `/assets/public_html/`, and child asset directories returned LiteSpeed indexes. Listings included `tracker-base.pre-strava-2026-09-06.js` and nested `public_html/assets/` content. The final Phase 1 status is recorded above.

**Affected component:** Namecheap `public_html/assets` and LiteSpeed directory-index policy.

**Exact remediation:** First archive any required rollback file outside `public_html`. Delete the nested `assets/public_html/` tree and `tracker-base.pre-strava-2026-09-06.js` from the web root after checksum/back-up verification. Disable indexing for `public_html/assets` and descendants (`Options -Indexes` in the applicable `.htaccess`, or cPanel **Indexes → No Indexing**). Change the deployment package to an allowlist so backup suffixes, nested `public_html`, source maps, archives, configs, migrations, seeds, and server code cannot enter the static root.

**Control mapping:** CIS HTTP access/default-content objectives; CIS Controls 2, 4, and 16; OWASP Top 10:2025 A02 and A03.

**Regression/compatibility risk:** Low. Direct asset URLs should continue to work; only directory listings and stale files should disappear. A mistaken broad removal could break images/scripts, so remove only inventory-confirmed artifacts.

**Namecheap/cPanel steps:** Use File Manager to copy rollback files to a private home-directory backup; use **Indexes** to select `public_html/assets` and **No Indexing**; remove only the two confirmed artifact locations; clear LiteSpeed cache if enabled.

**Validation:** `/assets/` and each child directory returns `403` or a non-listing index page; required CSS/JS/images return `200`; the five representative pages visually load; no nested `public_html`, `.pre-*`, `.bak`, archive, source-map, config, migration, or seed file is web-addressable.

### TG-M03 — CLOSED: accepted host-only HSTS policy / residual risk accepted (Medium)

**Why it matters:** HTTP redirects protect requests only after the browser reaches the HTTP endpoint. Without HSTS, a first visit or cleared browser state remains vulnerable to downgrade/SSL-stripping on a hostile network.

**Original evidence:** `Strict-Transport-Security` was absent from representative static pages, public/admin Strava responses, and startup health. HTTP routes otherwise redirected to HTTPS.

**Affected component:** LiteSpeed/cPanel origin-wide response configuration.

**Accepted resolution:** Stage 1 validated `Strict-Transport-Security: max-age=300`; Stage 2 validated exactly one `Strict-Transport-Security: max-age=86400` field across the apex, `www`, representative static pages/assets, Passenger/Strava responses, and protected routes. The project intentionally retains the 24-hour host-only policy. `includeSubDomains` is excluded because discovered Namecheap/cPanel/mail/service aliases do not all satisfy HTTPS hostname requirements. Preload is excluded for the same operational reason and because its required long-term/subdomain commitment is inappropriate here. The previously proposed one-year duration is deferred and not required for project closure. The site owner explicitly accepts the residual downgrade window after an HSTS entry expires or is cleared.

**Control mapping:** CIS HTTP TLS/transport objectives; OWASP ASVS 5.0 secure-communication/configuration themes; OWASP Top 10:2025 A02 and A04.

**Regression/compatibility risk:** The accepted residual risk is weaker persistence than a one-year policy: a client that has not refreshed the policy within 24 hours again depends on the first HTTP-to-HTTPS redirect. The compatibility risk of `includeSubDomains` or preload remains unacceptable under the current shared-hosting/service-host architecture.

**Current operation and rollback:** Retain the validated host-scoped directive at `max-age=86400`. Rollback remains removal of only that host-scoped HSTS directive, followed by exact header and application validation; clients may retain the cached policy for up to 24 hours after their last valid response. No production change is part of this documentation closure.

**Validation and reassessment:** Stage 1 and Stage 2 production checks passed: redirects remained exact; the header appeared exactly once without `includeSubDomains` or `preload`; excluded staging/service hosts received no HSTS; representative pages, active assets, map behavior, Strava public APIs, and admin protection remained healthy. Reassess duration only if the hosting architecture changes, service aliases are retired or obtain valid HTTPS, or the project adopts a stronger persistence requirement.

### TG-M04 — CLOSED: baseline static browser hardening headers (Medium)

**Remediation status — 2026-09-07:** **PASS / CLOSED.** The host-, HTTPS-, and
path-scoped root rule now gives representative static 200, 403, and 404
responses exactly one `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, and
`Permissions-Policy: accelerometer=(), camera=(), geolocation=(), gyroscope=(),
magnetometer=(), microphone=(), payment=(), usb=()` field. Passenger routes are
excluded and retain exactly one application-owned CSP, `no-referrer`,
`nosniff`, and HSTS field. HSTS remains host-only `max-age=86400`, without
`includeSubDomains` or preload. Production pages, assets, navigation, Sheets,
Analytics, fonts/video, map, static fallback, Strava APIs, protected routes,
and webhook rejection passed. Node 22.23.2 tests passed 28/28 focused and 97/97
full; the 19-file cPanel validator and `git diff --check` passed. Full evidence:
`docs/security/tg-m04-browser-security-headers-2026-09-07.md`.

**Why it mattered:** Without clickjacking, MIME-sniffing, referrer, and permissions controls, browser defaults left avoidable exposure. CSP remains separately important because the live tracker executes JSONP and builds markup dynamically.

**Original evidence:** All five representative HTML pages lacked CSP, `X-Content-Type-Options`, `X-Frame-Options`/`frame-ancestors`, `Referrer-Policy`, and `Permissions-Policy`. Normal Strava JSON responses already applied a strong CSP, no-referrer, and `nosniff`.

**Affected component:** Static site response configuration and browser asset design.

**Implemented remediation:** Static HTTPS responses on the apex and `www` now receive the validated MIME-sniffing, strict-origin referrer, frame-denial, and unused-capability restrictions. `/strava` is excluded so Passenger's stronger application headers are not duplicated or weakened. CSP preparation/enforcement is explicitly outside TG-M04 and remains tracked under TG-M08; closing this finding does not imply CSP closure.

**Control mapping:** CIS secure-configuration/information-disclosure objectives; OWASP ASVS 5.0 browser, encoding, and configuration themes; OWASP Top 10:2025 A02 and A05.

**Regression/compatibility result:** The low-risk baseline headers passed production validation. CSP remains moderate to high risk because current pages contain inline code, Google Tag Manager, Google Sheets JSONP, Analytics traffic, and external links/media.

**Current Namecheap/cPanel state:** The marked TG-M04 `Header always set` block is active in the root `public_html/.htaccess`, limited to HTTPS apex/`www` static responses and excluding `/strava`. Rollback is removal of only that block or restoration of the checksum-verified pre-change file while preserving TG-M03 HSTS.

**Validation:** The scoped static 200/403/404 and Passenger 200/401/403/404 matrix passed without duplicate/conflicting fields. Provider-generated failures before tenant configuration and unforced 5xx behavior remain outside this read-only production check. CSP validation belongs to TG-M08.

### TG-M05 — Webhook events lack expected-subscription validation, deduplication, and bounded work controls (Medium)

**Remediation status — 2026-09-07:** **PASS / CLOSED.** Production is healthy with the required private expected-subscription configuration and all four migration-006 tables. The deployed Passenger/MariaDB change provides exact subscription/athlete gates, 14-day SHA-256 durable idempotency, transactional activity ordering/leases, restart recovery, safe delete semantics, a shared 120-events-per-minute work ceiling, bounded/redacted inputs and logs, and database-backed failed-admin-auth throttling. Uncached health/public API checks, anonymous and isolated wrong-auth checks, unchanged map-asset hashes, fresh-browser map validation, 103/103 focused tests, 110/110 full Node 22.23.2 tests, the 20-file cPanel validator, package/secret scans, and `git diff --check` passed. No live webhook activity or rate-threshold test was manufactured. Full evidence: `docs/security/tg-m05-strava-webhook-admin-hardening-2026-09-07.md`.

**Why it matters:** Strava webhook POSTs are not provider-signed. The code correctly treats events as hints and checks the connected athlete before fetching, but it accepts any positive `subscription_id`. Someone who learns/guesses the athlete ID can send valid-shaped create/update hints during the operational window and consume application, database, and Strava API resources. Replays are not explicitly deduplicated, and background work has no explicit concurrency queue.

**Evidence:** `strava-app/lib/routes.mjs:139-147` validates types/positive IDs; lines 251-288 acknowledge and schedule work; lines 258-259 note that POSTs are unsigned; ownership is checked at lines 273-277, but `subscription_id` is not compared and no event idempotency/rate/queue control is present.

**Affected component:** `/strava/webhook`, Passenger worker processes, Strava API quota, and candidate database tables.

**Exact remediation:** Store the expected Strava subscription ID in protected configuration or a registration table and compare every event before scheduling work. For mismatches, return a generic successful acknowledgement and do no fetch to prevent attacker-driven retries. Add an idempotency key/table with a unique tuple such as `(subscription_id, object_type, object_id, aspect_type, event_time)` and retention matching the webhook replay window. Bound concurrent background activity fetches per process and globally where practical; add a conservative provider-aware rate policy and metrics for invalid/mismatched/replayed events. Keep the existing owner and fetched-activity validations.

**Control mapping:** OWASP Top 10:2025 A06, A08, and A09; OWASP ASVS 5.0 API/business-logic, input-validation, and logging themes; CIS Controls 8 and 16.

**Regression/compatibility risk:** Moderate. Rejecting the wrong stored subscription after a Strava re-registration could stop ingestion. Use a controlled migration and dual-value transition if subscription replacement is possible.

**Namecheap/cPanel steps:** Add the expected ID to the private config outside `public_html`; deploy the tested schema/code; restart Passenger; optionally configure ModSecurity/LiteSpeed rate controls only after confirming Strava delivery behavior and source patterns.

**Validation:** Valid production events acknowledge quickly and enqueue once; wrong subscription, wrong owner, duplicates, oversized/malformed bodies, and out-of-window events cause no provider fetch; concurrent replay tests stay within queue/pool limits; legitimate Strava retry behavior remains successful.

### TG-M06 — Administrative authentication lacks perimeter throttling, MFA, and a documented rotation path (Medium)

**Why it matters:** The application secret is long and correctly checked, but a public Basic/Bearer gate is the only confirmed control. No application rate limit, lockout, IP allowlist, second factor, or verified WAF rule was observed. Missing HSTS increases the importance of careful client handling on a first connection.

**Evidence:** `/strava/connect`, `/status`, and `/candidates` returned `401`; `strava-app/lib/routes.mjs:92-106` supports Basic/Bearer; the minimum is enforced, but no failure counter/limiter exists. cPanel/ModSecurity controls are unverified.

**Affected component:** Administrative Strava routes and the operational administrator credential.

**Exact remediation:** Rotate to a password-manager-held 64+ character token and document rotation/rollback. Prefer Bearer for scripted calls and avoid browser-cached Basic credentials. Reject nonempty foreign `Origin`/cross-site `Sec-Fetch-Site` values on state-changing routes while allowing trusted non-browser clients without those headers. Add a front-door rate limit and alert on repeated `401`s; if administrator IPs are stable, restrict the admin paths at the edge. For stronger assurance, place admin routes behind an MFA-capable access proxy/identity layer while retaining application auth as defense in depth.

**Control mapping:** OWASP Top 10:2025 A01, A07, and A09; OWASP ASVS 5.0 authentication/access-control/service-authentication themes; CIS Controls 5, 6, 8, and 16.

**Regression/compatibility risk:** Moderate. IP allowlists can lock out travelling operators; generic rate limits can block automation; an access proxy must preserve Strava's public callback/webhook/public paths.

**Namecheap/cPanel steps:** Enable cPanel MFA and account notifications; confirm ModSecurity and cPHulk-equivalent protections with Namecheap; scope any directory/IP rule only to admin routes, never callback/webhook/public routes; rotate the private-file token and restart Passenger during a controlled window.

**Validation:** Correct Bearer access works; missing/wrong credentials remain generic; repeated failures are throttled/alerted; callback, athlete-connect, webhook, and public routes remain reachable; old token fails after rollback window; credentials never enter URLs/logs/shell history.

### TG-M07 — Release provenance and repository protection are insufficient (Medium)

**Why it matters:** The production path is manual and the public source repository has no mandatory review/test/security gate. An accidental or compromised push/upload can bypass the otherwise strong tests. Opaque prebuilt browser bundles are not represented in npm dependency metadata, and committed/generated deployment outputs increase drift.

**Evidence:** GitHub reported a public repository, default `main`, `protected: false`, no `.github/workflows`, and an unsigned latest commit. No Dependabot config exists locally; vulnerability-alert status returned `401` and is therefore unverified. The repository tracks `dist`, including generated static output and the cPanel app package; several hashed browser bundles coexist. Production is uploaded manually.

**Affected component:** GitHub, build/release process, local/generated artifacts, and cPanel upload workflow.

**Exact remediation:** Add a GitHub ruleset requiring pull requests, one approval, stale-review dismissal, required status checks, and blocked force-push/deletion. Add Node 22 CI running `npm ci`, `npm test`, `npm run check:cpanel`, dependency audit, secret scanning, and a build-manifest check. Enable Dependabot/security alerts if available. Produce a versioned deployment artifact in CI with a manifest and SHA-256 checksums; sign/tag releases or require signed commits for protected branches. Make static and Passenger outputs separate allowlisted artifacts; document who verifies checksums before cPanel upload.

**Control mapping:** OWASP Top 10:2025 A03 and A08; CIS Controls 2, 4, 16; CIS Software Supply Chain Security Guide.

**Regression/compatibility risk:** Low for branch rules; moderate for CI/artifact changes because the current manual deploy and generated output conventions must be migrated without overwriting production-only assets.

**Namecheap/cPanel steps:** No hosting change is required initially. Once CI artifacts exist, upload only the approved static manifest to `public_html` and only the approved Passenger manifest to the app root; compare checksums; preserve the last known-good private rollback artifact outside the web root.

**Validation:** A direct unreviewed `main` push is blocked; required checks run on a test PR; the release artifact contains no config, backups, source maps, migrations/seeds in the static package, or nested `public_html`; cPanel package checker and production smoke tests pass; deployed hashes match the manifest.

### TG-M08 — Active third-party script trust and DOM construction need stronger boundaries (Medium)

**Why it matters:** The live page loads mission updates through Google Sheets JSONP, which executes remote JavaScript with first-party page privileges. Google Tag Manager has similar intentional privilege. CSP is absent. Sheet ticker strings are escaped and URLs are protocol-checked, which is good, but the optional Instagram renderer inserts response URLs/captions into `innerHTML` with incomplete validation, and local comments use string markup. The Instagram production endpoint currently returns `404`, so no confirmed exploitable XSS was demonstrated; the code becomes risky if the endpoint is enabled or overridden.

**Evidence:** Production loaded Google Tag Manager and a dynamic `docs.google.com/.../gviz/tq` JSONP script. `production-merge/.../tracker-base.js:391-538` creates the JSONP script and escapes ticker content; lines 669-697 insert `permalink`, `mediaUrl`, and caption through `innerHTML` without HTTPS/host allowlisting; lines 1827-1842 render local comments with `innerHTML`. Main pages have no CSP.

**Affected component:** Live tracker browser JavaScript, updates/Instagram data paths, analytics, and static page header policy.

**Exact remediation:** Replace JSONP with same-origin validated JSON supplied by a server-side cache/proxy or controlled build artifact. Construct Instagram/comment/ticker elements with `createElement`, `textContent`, and property assignment; allowlist `https:` and expected hosts for links/media; never put response values into HTML strings. Remove or keep disabled the unused Instagram endpoint until the safe renderer and server contract are deployed. Inventory/approve external scripts, document their data handling, and separately prepare, observe, refine, and enforce CSP under TG-M08. Where dynamic tag-manager integrity cannot be pinned, minimize container permissions/tags and restrict CSP/connect destinations.

**Control mapping:** OWASP Top 10:2025 A03, A05, and A08; OWASP ASVS 5.0 encoding/sanitization/browser-resource themes; CIS Controls 2, 3, and 16.

**Regression/compatibility risk:** Moderate to high for JSONP replacement/CSP because live updates and analytics may depend on current origins/callback behavior; low for DOM-safe construction if visual regression tests are comprehensive.

**Namecheap/cPanel steps:** Add a same-origin JSON endpoint only in the Passenger app or generate a static JSON file through the trusted release process; do not place Google/Instagram secrets in browser code or `public_html`; stage CSP Report-Only before enforcement.

**Validation:** Malicious fixture strings/URLs render as text or are rejected; no `javascript:`, `data:` link, quote break-out, event attribute, or HTML tag executes; update caching/error fallback still works; the site operates under enforced CSP; production `/api/instagram-feed` remains absent until intentionally secured.

### TG-L01 — Static root advertises unnecessary POST support (Low)

**Why it matters:** Extra methods increase ambiguity and can create future handler/cache behavior that is harder to reason about. No state change or upload was confirmed.

**Evidence:** `OPTIONS /` returned `Allow: OPTIONS, HEAD, GET, POST`; Strava's own route layer is correctly method-specific.

**Affected component:** LiteSpeed static virtual host.

**Exact remediation:** Confirm with Namecheap whether POST is actually accepted at the static root. If unnecessary, restrict the static tree to `GET`, `HEAD`, and `OPTIONS`, explicitly excluding the `/strava` mount where POST is required. Keep TRACE disabled.

**Mapping:** CIS HTTP feature/method minimization; OWASP A02.  
**Regression/compatibility risk:** Moderate if scoped incorrectly because forms or Passenger routes may use POST.  
**Namecheap steps:** Use a narrowly scoped `.htaccess` method rule or provider setting; do not apply it to `/strava`.  
**Validation:** Root/static POST returns `405`; Strava webhook, connect-link, and candidate assignment POSTs retain expected auth/validation behavior.

### TG-L02 — Token-encryption key lifecycle has no safe rotation mechanism (Low)

**Why it matters:** AES-GCM storage is strong, but loss or replacement of the single key makes credentials unreadable, while compromise requires reconnecting/rotating. The `v1` envelope does not identify a key ID.

**Evidence:** `strava-app/lib/security.mjs:48-79` imports one 32-byte key and serializes `v1.<iv>.<ciphertext>`; documentation warns that losing/changing the key makes stored credentials unreadable.

**Affected component:** Strava token encryption and private cPanel configuration.

**Exact remediation:** Add a versioned keyring with one active key ID and limited legacy decrypt keys; include the key ID in the envelope; re-encrypt on successful decrypt/refresh; store an offline protected backup; document rotation, revocation, and athlete reauthorization recovery.

**Mapping:** OWASP A04/A08 and ASVS cryptography/secret-management themes; CIS Controls 3 and 16.  
**Regression/compatibility risk:** Moderate; a keyring parsing error can break OAuth.  
**Namecheap steps:** Keep all keys only in the owner-only private file outside app/web roots; deploy dual-read before rotating.  
**Validation:** Old ciphertext decrypts and migrates, new ciphertext uses the new key ID, wrong/tampered keys fail generically, and rollback/reconnect procedures are exercised without logging key material.

### TG-L03 — State-changing admin POSTs lack explicit browser CSRF/fetch-metadata checks (Low)

**Why it matters:** Authorization headers are not automatically attached cross-site like cookies, so practical CSRF risk is low. Explicit origin/fetch-metadata rejection prevents future browser/admin tooling changes from silently weakening the boundary.

**Evidence:** Admin POST routes require Basic/Bearer and JSON, and CORS is restrictive; no CSRF token or `Origin`/`Sec-Fetch-Site` policy is present.

**Affected component:** `/strava/connect-link` and candidate assignment.

**Exact remediation:** Reject requests with a present foreign `Origin` or `Sec-Fetch-Site: cross-site`; continue accepting trusted command-line requests where those headers are absent. If a cookie-authenticated admin UI is ever added, require a session-bound CSRF token.

**Mapping:** OWASP A01/A06 and ASVS request-integrity themes.  
**Regression/compatibility risk:** Low if absence is allowed; moderate for unusual proxies adding headers.  
**Namecheap steps:** Application change only; no global hosting rule.  
**Validation:** First-party/browser and headerless trusted CLI requests work; foreign-origin requests fail before side effects; CORS and auth tests remain green.

### TG-L04 — Static and server deployment boundaries are blurred in generated artifacts (Low)

**Why it matters:** `build-offline.mjs` copies the root `api` directory into static `dist` and also generates a server bundle, while the repository separately tracks `dist/goodwin-strava-api`. Production probes returned `404`, but the build shape makes accidental source exposure more likely during manual uploads.

**Evidence:** `build-offline.mjs:11-15` copies `api` to `dist`; lines 289 onward generate `dist/server/index.js`; tracked `dist/goodwin-strava-api` contains application source, migrations, and seeds; `/api/instagram-feed` is not active on Namecheap.

**Affected component:** Offline/Sites build and manual deployment packages.

**Exact remediation:** Split output roots and manifests: a static Namecheap artifact containing only web assets/pages, a Passenger artifact containing only the checked 19-file app package, and a separate optional Sites artifact if that target remains supported. Never upload a parent `dist` wholesale.

**Mapping:** OWASP A02/A03/A08; CIS Controls 2, 4, and 16.  
**Regression/compatibility risk:** Moderate because alternate Sites/offline workflows may rely on current files.  
**Namecheap steps:** Upload only manifest-listed files to each root and verify forbidden-file probes after deployment.  
**Validation:** Static artifact has no server modules/migrations/seeds/configs; Passenger artifact has no static site; alternate target tests, if retained, pass independently.

### TG-L05 — Security logging, retention, and alerting posture cannot be demonstrated (Low)

**Why it matters:** Safe logs exist in code, but detection and incident response depend on retention and alerts. Shared-host logs may be short-lived or fragmented.

**Evidence:** Application logging is allowlisted; public responses do not leak logs. No authenticated evidence was available for LiteSpeed access/error logs, Passenger logs, MariaDB audit/error logs, retention, clock synchronization, alert destinations, WAF events, or review cadence.

**Affected component:** Namecheap/cPanel, Passenger, MariaDB, and operational process.

**Exact remediation:** Define retained sources and alert thresholds for repeated `401/403`, invalid/mismatched/replayed webhooks, unusual `404` sensitive-path probes, `5xx`, startup transitions, database failures, and cPanel logins. Redact authorization/cookies/query tokens and restrict log access. Export/retain logs outside the shared account if business impact justifies it.

**Mapping:** OWASP A09/A10; CIS Controls 8, 15, and 16.  
**Regression/compatibility risk:** Low; storage/noise costs are the main concern.  
**Namecheap steps:** Inventory Raw Access, Errors, Metrics, ModSecurity, application, and login logs; enable notifications where available; ask support about retention.  
**Validation:** Generate one approved benign failed-auth/404/test error and confirm redacted event visibility, timestamp, retention, and alert delivery without exposing secrets.

### TG-L06 — No documented public vulnerability intake/security contact (Low)

**Why it matters:** A public site/repository needs a safe path for researchers and users to report a flaw. Without it, reports may be lost or disclosed publicly first.

**Evidence:** No `.well-known/security.txt`, repository `SECURITY.md`, or documented vulnerability-handling workflow was found.

**Affected component:** Public site, GitHub repository, and incident-response process.

**Exact remediation:** Publish a minimal RFC 9116 `/.well-known/security.txt` with monitored contact, expiry, preferred language, and policy URL; add a GitHub `SECURITY.md` describing private reporting, acknowledgement targets, scope, and disclosure expectations; define triage owner and severity/remediation SLA.

**Mapping:** CIS Control 16 vulnerability intake; OWASP application-security program guidance.  
**Regression/compatibility risk:** Very low; contact spam is possible.  
**Namecheap steps:** Upload the static file through the normal allowlisted deployment and ensure `text/plain`.  
**Validation:** URL returns `200 text/plain`, contact is monitored, expiry is calendared, and GitHub displays the policy on the Security tab.

### TG-I01 — Server product branding is exposed (Informational)

`Server: LiteSpeed`, `X-Turbo-Charged-By: LiteSpeed`, and the auto-index footer disclose the product but not an exact version. Disable the optional header/footer where tenant controls permit; do not treat banner suppression as a substitute for patching. Provider support may be required. Validate that exact version remains absent and functionality is unchanged.

### TG-I02 — Public historical activity telemetry is an intentional privacy decision (Informational)

The public API can publish Strava activity ID, start time, distance, timing, elevation, summary polyline, and start/end coordinates only for included/matched results, from the mission start onward, and retains historical display after ingestion closes. This is controlled and documented rather than an access-control bypass. Before 2026-10-09, confirm athlete consent, public purpose, coordinate precision, retention, and removal/correction process. If precision is unnecessary, reduce or delay coordinates/polyline. Validate the public schema against the approved data inventory before the operational window opens.

## OWASP application-security assessment

This is a targeted ASVS/Top 10 review, not a claim of full ASVS Level 2 certification. The latest stable OWASP ASVS is 5.0.0, and OWASP Top 10:2025 is used for risk grouping.

| OWASP Top 10:2025 area | Status | Evidence/conclusion |
|---|---|---|
| A01 Broken Access Control | Mostly pass / improvements | Admin routes are protected; public projection is narrow; no bypass found. Improve public health exposure and admin perimeter controls. |
| A02 Security Misconfiguration | Improvement required | HSTS, directory indexing, stale content, the public diagnostic, and baseline static browser headers are remediated/closed; static method ambiguity and CSP remain open. |
| A03 Software Supply Chain Failures | Fail | No CI/ruleset/automated dependency workflow; unsigned main; manual artifacts; JSONP/GTM and opaque browser bundles. npm package audit itself was clean. |
| A04 Cryptographic Failures | Pass with accepted HSTS residual risk | TLS 1.0/1.1 rejected, certificate valid, AES-256-GCM with AAD, and host-only 24-hour HSTS validated; key rotation remains open. |
| A05 Injection | Mostly pass / conditional DOM issue | Parameterized SQL, strict JSON, no request-controlled OS/file path. Sheet ticker escapes values. Optional Instagram/comment HTML construction needs redesign. |
| A06 Insecure Design | Improvement required | Strong OAuth/operational gates; webhook authenticity/abuse/dedup/concurrency and admin perimeter need explicit design controls. |
| A07 Authentication Failures | Pass with perimeter gap | Long static admin secret, safe comparison and generic `401`; no confirmed throttle/MFA/IP control. |
| A08 Software or Data Integrity Failures | Improvement required | AES-GCM and DB constraints are strong; release provenance, signed changes, expected webhook subscription, and external script trust are weak. |
| A09 Security Logging and Alerting Failures | Unable / improvement required | Secret-safe app logging exists, but retention, central review, provider/WAF logs, and alerts are unverified. |
| A10 Mishandling of Exceptional Conditions | Mostly pass | Generic errors, timeouts, body caps, redirect denial, validation, and fail-closed behavior are strong; public startup detail and background-work bounding need improvement. |

### Threat-focused conclusions

| Threat | Result |
|---|---|
| SQL injection | No vulnerable query found; placeholders and `multipleStatements:false` are consistently used. |
| SSRF | No request-controlled destination found; Strava origin/path checks and redirect denial are strong. |
| Open redirect | No untrusted redirect found; OAuth destinations are fixed. |
| Path traversal/file disclosure | No request-based filesystem path found; private config path is fixed; sensitive paths were blocked externally. |
| Insecure deserialization | JSON/config parsing is schema/allowlist constrained; no executable deserializer found. |
| OAuth CSRF/replay | Strong random, browser-bound, expiring, hashed, atomic single-use state. |
| Stored credential theft | Tokens encrypted at application layer; host/file/backup controls still need verification. |
| CORS abuse | Exact first-party origin only for public API; admin/webhook do not allow attacker origins. |
| Browser XSS | No confirmed exploit; absent CSP, active JSONP, and conditional unsafe DOM sinks create avoidable risk. |
| Brute force/abuse/DoS | Body/time/pool limits are good; admin/webhook throttling, dedup, and front-end limits are unverified. |
| Error leakage | Generic errors and safe provider handling; temporary startup endpoint discloses component readiness. |

## CIS benchmark matrix

### HTTP server objectives — nearest baseline: CIS Apache HTTP Server 2.4 v2.4.0

| ID | Objective | Owner | Status | Evidence/action |
|---|---|---|---|---|
| AH-01 | Supported/patched server version | Namecheap | UNABLE TO VERIFY | LiteSpeed exact version and patch channel not exposed; request provider evidence. |
| AH-02 | Minimize modules/features | Namecheap | PROVIDER-CONTROLLED | Shared LiteSpeed module inventory unavailable. |
| AH-03 | Least-privileged service identity/isolation | Namecheap | PROVIDER-CONTROLLED | Passenger/LiteSpeed OS identities and tenant isolation unavailable. |
| AH-04 | Secure ownership/permissions | Shared | PROVIDER-CONTROLLED | Base policy is provider-controlled; tenant private-file mode needs manual confirmation. |
| AH-05 | Restrict document/OS filesystem access | Namecheap | PROVIDER-CONTROLLED | External probes passed but server config cannot be inspected. |
| AH-06 | Deny dotfiles and sensitive paths | Application owner | PASS | `/.env`, `/.git/config`, `/strava/.env` returned `403`; manifests/config/migrations returned `404`. |
| AH-07 | Disable directory listing | Application owner | PASS | Final validation: `/assets/` and `/assets/public_html/` return `403`; no listing is exposed. |
| AH-08 | Remove default/stale/sample content | Application owner | PASS | Final validation: root and previously observed nested pre-Strava tracker URLs return `404`, including cache-busted/no-cache checks. |
| AH-09 | Disable TRACE | Shared | PASS | `TRACE /` returned `501`. |
| AH-10 | Restrict methods to business need | Shared | FAIL | Static root advertises POST; application routes themselves are correctly allowlisted. |
| AH-11 | Restrict server-status/server-info | Shared | PASS | `server-status` `403`; `server-info` `404`. |
| AH-12 | Generic error responses | Shared | PASS | No stack/path/version/SQL/secret observed. |
| AH-13 | Minimize exact version disclosure | Namecheap | PASS | Product disclosed, exact version absent. |
| AH-14 | Access/security logging configured and reviewed | Shared | UNABLE TO VERIFY | No authenticated log/retention/alert evidence. |
| AH-15 | Disable TLS 1.0/1.1; allow modern TLS | Namecheap | PASS | 1.0/1.1 rejected; 1.2/1.3 succeeded. |
| AH-16 | Valid certificate, chain, hostname | Namecheap | PASS | Chain/hostname valid; 2026-08-31 to 2027-03-17. |
| AH-17 | Weak cipher/protocol configuration | Namecheap | UNABLE TO VERIFY | Representative modern suites passed; no complete cipher scan. |
| AH-18 | Redirect HTTP to HTTPS | Shared | PASS | Representative HTTP routes redirected exactly to HTTPS. |
| AH-19 | Browser transport persistence/HSTS | Application owner | PASS | TG-M03 closed with validated host-only `max-age=86400`; shorter-duration residual risk accepted; no `includeSubDomains` or preload. |
| AH-20 | Front-end request/DoS limits | Namecheap | PROVIDER-CONTROLLED | Node limits confirmed; LiteSpeed/Passenger limits unavailable. |
| AH-21 | WAF/ModSecurity policy | Namecheap | PROVIDER-CONTROLLED | Public behavior insufficient to prove enabled/effective policy. |
| AH-22 | Override/default virtual-host hardening | Namecheap | PROVIDER-CONTROLLED | `.htaccess`/vhost/override configuration not available in repo or externally. |

HTTP subtotal: **11 PASS, 1 FAIL, 7 PROVIDER-CONTROLLED, 3 UNABLE TO VERIFY**.

### MariaDB objectives — apply v1.0.0 for 10.11 or v1.1.0 for 10.6 after version confirmation

| ID | Objective | Owner | Status | Evidence/action |
|---|---|---|---|---|
| DB-01 | Supported/patched exact version | Namecheap | UNABLE TO VERIFY | Server version not exposed; do not estimate. |
| DB-02 | Dedicated low-privilege OS service/files | Namecheap | PROVIDER-CONTROLLED | Shared-host OS layer unavailable. |
| DB-03 | Bind/network exposure/firewall | Namecheap | PROVIDER-CONTROLLED | Application likely uses cPanel-provided local host, but bind/listen rules unverified. |
| DB-04 | Remove anonymous/test/default objects | Namecheap | PROVIDER-CONTROLLED | Requires authenticated DB evidence. |
| DB-05 | Account/password/authentication policy | Namecheap | PROVIDER-CONTROLLED | Requires cPanel/MariaDB evidence. |
| DB-06 | Runtime least-privilege grants | Shared | UNABLE TO VERIFY | Docs specify DML-only after migration; actual grants unverified. |
| DB-07 | Database transport encryption/socket policy | Shared | UNABLE TO VERIFY | `mysql2` does not set `ssl`; actual local socket/TCP and provider protection unverified. |
| DB-08 | Tablespace and backup encryption | Namecheap | PROVIDER-CONTROLLED | No evidence available. |
| DB-09 | Database logging/auditing | Namecheap | PROVIDER-CONTROLLED | No evidence available. |
| DB-10 | Backup, restore, recovery testing | Shared | UNABLE TO VERIFY | No console/process evidence available. |
| DB-11 | Application secret file owner/mode/path | Application owner | UNABLE TO VERIFY | Fixed out-of-root path and `0600` documented; actual mode/owner not inspected. |
| DB-12 | Parameterized queries and safe connector settings | Application owner | PASS | `execute()` placeholders; `multipleStatements:false`. |
| DB-13 | Transaction/constraint integrity | Application owner | PASS | InnoDB, transactions, row locks, unique indexes, foreign keys, match table. |
| DB-14 | Sensitive OAuth token encryption | Application owner | PASS | AES-256-GCM with random IV and AAD. |
| DB-15 | Data minimization/public projection | Application owner | PASS | Only included matched public fields selected and validated. |
| DB-16 | Connection/resource bounds | Application owner | PASS | Pool 5, idle 5, queue 20, timeouts, bounded bodies. |

Database subtotal: **5 PASS, 0 FAIL, 6 PROVIDER-CONTROLLED, 5 UNABLE TO VERIFY**.

### Supply-chain/application lifecycle objectives — CIS Controls/CIS Software Supply Chain guidance

| ID | Objective | Owner | Status | Evidence/action |
|---|---|---|---|---|
| SC-01 | Inventory/minimize production packages | Application owner | PASS | Root has none; Strava app has one direct production package. |
| SC-02 | Lock exact dependency versions/integrity | Application owner | PASS | Lockfile v3, exact versions, registry URLs, integrity hashes. |
| SC-03 | Check known dependency vulnerabilities | Application owner | PASS | Both npm audits reported zero on 2026-09-07. |
| SC-04 | Automated test/security gates | Application owner | FAIL | No GitHub workflow; local 96 tests/checker pass only when manually run. |
| SC-05 | Protected/reviewed default branch | Application owner | FAIL | GitHub reports `main` unprotected. |
| SC-06 | Dependency alerts/update automation | Application owner | UNABLE TO VERIFY | No Dependabot config; GitHub alerts endpoint required authentication. |
| SC-07 | Signed source/release provenance | Application owner | FAIL | Latest commit reported unsigned; no signed artifact process. |
| SC-08 | Reproducible, allowlisted deployment | Application owner | FAIL | Manual uploads, generated outputs in Git, duplicate trees/stale assets in production. |
| SC-09 | Keep secrets out of source/artifacts | Application owner | PASS | Ignore rules, fixed private path, no high-confidence current/history secret found. |
| SC-10 | Govern third-party scripts/browser components | Application owner | FAIL | Active JSONP/GTM, no CSP, opaque bundled components not covered by npm audit. |

Supply-chain subtotal: **4 PASS, 5 FAIL, 0 PROVIDER-CONTROLLED, 1 UNABLE TO VERIFY**.

### Linux benchmark applicability

| ID | Objective | Status | Reason |
|---|---|---|---|
| OS-01 | Distribution-specific CIS Linux host audit | NOT APPLICABLE | Shared-host OS/distribution and tenant authority are unidentified; request provider attestation rather than inventing a benchmark/version. |

## Dependency and supply-chain review

### npm inventory

- Root package: zero production dependencies.
- `strava-app`: one direct production dependency, exact `mysql2@3.24.2`; 12 total resolved production packages in the installed tree.
- Resolved transitive packages observed: `@types/node@26.4.1`, `undici-types@8.3.0`, `aws-ssl-profiles@1.1.2`, `generate-function@2.3.1`, `is-property@1.0.2`, `iconv-lite@0.7.3`, `safer-buffer@2.1.2`, `long@5.3.2`, `lru.min@1.1.5`, `named-placeholders@1.1.6`, and `sql-escaper@1.5.1`.
- Both lockfiles use lockfile v3; package entries include exact versions, registry URLs, and integrity hashes.
- No `preinstall`, `install`, or `postinstall` script was found in the reviewed production dependency tree.
- `npm audit --omit=dev --audit-level=low` reported **0 vulnerabilities** in both roots on 2026-09-07.
- `npm run check:cpanel` passed: 19 files, Node 22, one production dependency, required routes and migration present.
- `npm test` passed **96/96** after granting temporary localhost bind permission. The initial sandbox-only `EPERM` results were environmental and disappeared unchanged.
- Establish a monthly advisory/lockfile review, apply supported Node 22 security patches promptly through cPanel, and test dependency updates in CI before release. A zero-result audit is evidence for this date, not a permanent safety statement.

### Browser and third-party components

- A bundled Leaflet version string `1.9.4` is identifiable. Other minified/hashed static bundles are not backed by a repository package manifest/SBOM and therefore were not fully vulnerability-auditable.
- Google Tag Manager/Analytics is intentionally loaded remotely and cannot be treated as immutable local code.
- Google Sheets GViz JSONP executes remote script directly. This should be replaced with a same-origin JSON trust boundary.
- Tally is linked for RSVP; it was not observed as an embedded privileged script in the representative home response.
- Instagram feed code expects a same-origin endpoint, but production returned `404` and used cached/local imagery. Keep it disabled until the renderer/contract is hardened.
- Strava provider requests are server-side, fixed-origin, time-bounded, and redirect-denying.
- Newly untracked Hapn integration files/tests appear to be active workspace development, not part of the reviewed production checkpoint; do not deploy them based on this report.

## Secrets and sensitive-data review

- No high-confidence AWS, GitHub, Stripe-style live token, PEM private key, or comparable secret was found in the current tracked tree, workspace scan, or high-confidence Git patch-history scan.
- A test fixture contains secret-like placeholder material by design; it is not a production credential.
- `.gitignore` excludes `.env`, `.env.*` except examples, private Goodwin config names, `node_modules`, temporary files, and the offline ZIP.
- The production config design places ten secrets/connection values at `/home/goodfjcw/.goodwin-strava-config.json`, outside `public_html` and the app root. Actual ownership/mode is **UNABLE TO VERIFY**.
- Secret values were not requested, printed, tested, or uploaded during this audit.
- Public GitHub code includes schema/migration/seed structure, which is not a secret and was not web-accessible on the tested production routes. Credentials and populated configuration must never join those artifacts.
- Database at-rest encryption, backup encryption, log redaction outside the app, and historic deleted/binary-object secret coverage remain unverified.

## External asset and data-flow risks

| Flow | Data leaving/entering | Main risk | Required control |
|---|---|---|---|
| Browser → GTM/Analytics | Page/analytics metadata | Privacy and remote script privilege | Consent/data inventory, minimal tags, CSP, account MFA/access review |
| Browser ↔ Google Sheets GViz | Public update query/JSONP script | Remote code execution in first-party page context | Replace JSONP with same-origin validated JSON/cache |
| Browser → Tally | User-initiated RSVP navigation | External data/controller boundary | Clear disclosure, privacy review, safe links/referrer policy |
| Passenger ↔ Strava | OAuth/token/activity data | Credential/provider/API trust | Existing fixed origins, redirect denial, timeouts, encryption; add webhook subscription/dedup controls |
| Passenger ↔ MariaDB | OAuth and race data | Shared-host credentials/storage | Least grants, local/TLS verification, backup/encryption/log controls |
| Browser ↔ optional Instagram endpoint | Media URLs/captions | Conditional DOM injection and provider privacy | Keep disabled until validated same-origin schema and DOM-safe renderer |

## Dead-code, stale-artifact, and dependency classification

Phase 1 removed only the three confirmed public stale/nested objects after the separately controlled backup and cPanel workflow. Other classifications remain prospective and are not authorization for cleanup.

| Candidate | Classification | Rationale/verification before removal |
|---|---|---|
| Production `/assets/tracker-base.pre-strava-2026-09-06.js` | **REMOVED — PHASE 1 VALIDATED** | Final exact and cache-busted public checks return `404`; private rollback was operator-retained outside `public_html`. |
| Production `/assets/public_html/` nested tree | **REMOVED — PHASE 1 VALIDATED** | Parent is not browsable (`403`); the previously inventoried nested tracker returns `404`. |
| Duplicate stale file inside nested asset tree | **REMOVED — PHASE 1 VALIDATED** | Direct nested file URL returns `404`. |
| Public detailed `health-startup` route/aliases | **REMOVED — TG-M01 VALIDATED / CLOSED** | Production legacy forms return 404; the only public replacement is schema-constant `/strava/health`. |
| Untracked `production-merge/strava-live-map-2026-09-06/` and upload material | **LIKELY SAFE TO REMOVE — VERIFY FIRST** | Historical staged deployment/validation package; confirm it is archived elsewhere and not the sole rollback source. |
| Untracked gradient benchmark HTML, `benchmarks/`, and generated gradient `dist` pages | **LIKELY SAFE TO REMOVE — VERIFY FIRST** | Benchmark/experimental output, not confirmed production core; owner may still be actively using it. |
| `.openai/hosting.json`, `dist/server/index.js`, root `api/` copies | **LIKELY SAFE TO REMOVE — VERIFY FIRST** from the Namecheap-only workflow | They support the older/alternate Sites/offline server target. Keep if that deployment target remains supported. |
| `api/instagram-feed.mjs` and `api/tracking-status.mjs` in static/Sites output | **LIKELY SAFE TO REMOVE — VERIFY FIRST** | Namecheap endpoints are inactive/404; retain only if alternate Sites or future feature ownership is explicit. |
| Tracked generated `dist/` duplication | **LIKELY SAFE TO REMOVE — VERIFY FIRST** from Git after CI migration | Useful to today's manual deployment, but creates drift. Do not remove until artifacts become reproducible and deployment docs change. |
| `004b_ggma_race_schedule_mariadb_repair.sql` | **KEEP** for now | Conditional recovery path for failed MariaDB migration; archive only after every environment's migration state is documented and converged. |
| Migrations `001`–`005` and schedule seed | **KEEP** | Required for install/recovery/audit; keep outside the public static artifact. |
| `mysql2` | **KEEP** | Sole runtime database dependency and actively imported. |
| Root ignored offline ZIP | **LIKELY SAFE TO REMOVE — VERIFY FIRST** locally | Not tracked; ensure a required offline delivery/rollback copy exists elsewhere before deleting. |
| Duplicate PNG/SVG/full/small partner and map assets | **UNCERTAIN** | Run an HTML/CSS/JS reference and visual audit before consolidation. |
| Untracked `integrations/`, Hapn doc/test, and related server changes | **UNCERTAIN / ACTIVE WORK** | Current dirty workspace indicates ongoing development; explicitly exclude from cleanup until the owner decides its release status. |
| Source Lovable instrumentation/replay metadata stripped by the build | **LIKELY SAFE TO REMOVE — VERIFY FIRST** | Not observed in production output; confirm no import/build dependency before source cleanup. |

## Prioritized remediation plan

| Priority | Action | Finding(s) | Owner | Effort | Risk reduction | Hosting notes |
|---:|---|---|---|---|---|---|
| 1 | **COMPLETED:** Disable `/assets` auto-index and remove the nested `public_html`/rollback JS after private backup | M02 | Site/cPanel owner | Small | High | Final validation passed; direct active assets remained unaffected |
| 2 | **COMPLETED:** retire detailed startup diagnostics and retain one generic monitored health endpoint | M01 | App owner | Small | Medium | Final production validation passed; legacy forms return 404 |
| 3 | **CLOSED — ACCEPTED RISK:** retain validated host-only `max-age=86400` | M03 | Site + Namecheap | Complete | Medium | One-year duration not required; `includeSubDomains`/preload intentionally excluded under current provider/service-host constraints |
| 4 | **COMPLETED:** add the four scoped baseline static browser headers without overriding Passenger | M04 | Site/cPanel owner | Complete | Medium | Final production header, browser, map, Strava, test, and package validation passed |
| 5 | **COMPLETED:** validate expected webhook subscription and add durable idempotency/concurrency/rate controls | M05 | App/DB owner | Complete | High | Production, map, focused/full tests, and package validation passed; fast ACK preserved |
| 6 | Rotate/administer the admin token; add edge throttling/alerts and optional MFA access layer/IP restriction | M06, L03 | App + Namecheap | Medium | Medium | Never block callback/webhook/public routes |
| 7 | Protect `main`; add Node 22 CI, dependency/secret checks, signed release/checksum provenance | M07 | GitHub/release owner | Medium | High | No immediate Namecheap change; improves next upload |
| 8 | Replace JSONP and unsafe DOM strings with same-origin JSON and DOM-safe construction; separately stage CSP Report-Only before any enforcement | M08 | Front-end/app owner | Medium/large | High | Coordinate with update/analytics behavior and CSP rollout |
| 9 | Split static/Passenger/Sites artifacts; enforce allowlisted manifests and remove stale workflow artifacts | M07, L04 | Release owner | Medium | Medium | Prevent wholesale `dist` upload; preserve last known-good private rollback |
| 10 | Obtain provider/manual evidence for exact versions, WAF, logs, DB grants/TLS/encryption/backups/file modes | L05 + CIS gaps | Site + Namecheap | Medium | Medium | Use cPanel screens/support ticket; do not infer missing host controls |

### Immediate next action

Phase 1 and TG-M01, TG-M03, TG-M04, and TG-M05 are complete. The next worthwhile separately authorized item is **TG-M06: finish administrator perimeter and credential-lifecycle hardening**, beginning with a controlled token-rotation exercise and evidence for Namecheap/cPanel MFA, alerts, and narrowly scoped edge protections without blocking callback, webhook, or public routes. TG-M08 CSP/JSONP/DOM work remains open and was not started. TG-M03 retains host-only `max-age=86400`; its shorter-duration residual risk is accepted, and neither `includeSubDomains` nor preload is planned under the current hosting architecture.

## Provider/manual verification checklist

Ask Namecheap or inspect cPanel without sharing secrets:

1. Exact LiteSpeed, Passenger, MariaDB, cPanel, and OS versions; patch dates/channel and tenant responsibilities.
2. Whether MariaDB is 10.11 or 10.6 so the correct CIS benchmark version is selected.
3. Actual runtime DB grants after migrations; confirm only `SELECT`, `INSERT`, `UPDATE`, and `DELETE` and a host restriction appropriate to local access.
4. Database bind/listen exposure and whether application transport is Unix socket, protected localhost TCP, or TLS; enable certificate-verifying TLS if traffic crosses an untrusted boundary.
5. Owner/group/mode for the private config, app root, logs, backups, and `public_html`; confirm the config is `0600` and excluded from backups/downloadable archives as required.
6. MariaDB tablespace, cPanel backup, and offsite backup encryption; retention; restore test date; RPO/RTO.
7. LiteSpeed request/body/concurrency/timeouts, symlink policy, auto-index defaults, method restrictions, `.htaccess` override policy, and exact-version suppression.
8. ModSecurity/WAF/rate-limit status/rule set and false-positive process; cPanel brute-force protections, MFA, login alerts, and source restrictions.
9. Access/error/Passenger/MariaDB/security log locations, retention, redaction, clock sync, export, and alerting.
10. GitHub vulnerability alerts, secret scanning, Dependabot, rulesets, account MFA, deploy-token/SSH-key inventory, and collaborator least privilege.

## Post-remediation validation plan

1. Re-run `npm test`, `npm run check:cpanel`, both production-only npm audits, and a high-confidence secret scan.
2. Verify the deployment artifact manifest/checksums before upload; confirm no config, archive, backup, source map, nested `public_html`, static `api`, migration, or seed file enters the static artifact.
3. Recheck representative static pages, redirects, `401/403/404/5xx`, public Strava routes, startup/generic health, and all security headers.
4. Confirm `/assets` and every child cannot list content while referenced assets remain `200` with correct MIME types.
5. Repeat TLS 1.0/1.1 rejection, TLS 1.2/1.3 negotiation, chain/hostname validation, and HSTS checks. Schedule certificate-expiry monitoring well before 2027-03-17.
6. Test CSP in Report-Only and then enforcement across desktop/mobile pages, intro animation, fonts, images, map, live ticker, Google/analytics decisions, RSVP links, and optional integrations.
7. Run malicious fixture tests against every sheet/Instagram/comment/route/public activity string and URL; verify DOM-safe text and protocol/host rejection.
8. Test webhook valid, wrong-subscription, wrong-owner, duplicate, replay, malformed, oversized, slow, out-of-window, and concurrent cases; confirm only one valid background fetch.
9. Test admin correct/wrong/old tokens, throttling, alerts, origin/fetch metadata, operator travel/fallback, and access proxy/IP rules. Confirm public/callback/webhook availability.
10. Review cPanel/Passenger/database/WAF logs after the smoke test and confirm no credentials, cookies, OAuth codes/state, connection-link tokens, database DSNs, or provider bodies are logged.
11. Compare production hashes with the signed/reviewed release manifest and save the evidence with the change ticket.
12. Re-run this objective matrix, recording provider screenshots/ticket responses for every current `PROVIDER-CONTROLLED` or `UNABLE TO VERIFY` item.

## References

- CIS Apache HTTP Server benchmark page (current listed Apache 2.4 benchmark version 2.4.0): https://www.cisecurity.org/benchmark/apache_http_server
- CIS MariaDB benchmark page (current listed MariaDB 10.11 version 1.0.0 and MariaDB 10.6 version 1.1.0): https://www.cisecurity.org/benchmark/mariadb
- CIS Controls v8/v8.1 overview: https://www.cisecurity.org/controls/v8
- CIS Software Supply Chain Security Guide: https://www.cisecurity.org/insights/white-papers/cis-software-supply-chain-security-guide
- OWASP ASVS (latest stable 5.0.0): https://owasp.org/www-project-application-security-verification-standard/
- OWASP Top 10:2025: https://owasp.org/Top10/2025/

## Final assessment

The reviewed application is **not presently in an emergency state**: no credential leak, SQL injection, SSRF, OAuth bypass, administrator bypass, weak TLS protocol, dependency advisory, stack-trace leak, or exposed app/database package was confirmed. Its security posture is nevertheless incomplete because browser trust boundaries, release provenance, administrator perimeter/lifecycle controls, and the provider evidence trail lag behind the application code's quality.

**Safe to remediate: YES.** Directory-index/artifact cleanup, detailed-health retirement, accepted host-only HSTS, baseline static browser headers, and TG-M05 webhook hardening are complete. Continue only with separately approved administrator-perimeter, supply-chain, and later TG-M08 browser-trust/CSP work using the regression plan above. Provider-controlled items must be evidenced or contractually accepted, not marked passed by assumption.
