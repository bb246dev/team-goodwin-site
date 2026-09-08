# TG-M05 — Strava webhook and administrator hardening

**Date:** 2026-09-07  
**Status:** PASS / CLOSED — PRODUCTION VALIDATED  
**Authoritative finding:** `docs/security/cis-owasp-audit-2026-09-07.md`, TG-M05  
**Production scope:** `https://goodwingoodge.com/strava` on Namecheap cPanel/Passenger

## Decision and scope

This change prepares the TG-M05 webhook remediation and a deliberately small
application-level part of TG-M06: database-backed failed-administrator-auth
throttling and a credential-rotation runbook. It does not rotate a credential,
alter OAuth, change the connected athlete, change race windows or matching,
change public API projections, alter the map, deploy a migration, or change
production/cPanel/DNS/headers.

The current production webhook subscription identifier is deployment input. It
is intentionally absent from source and packages. Production must store its
decimal value as the private JSON string `STRAVA_WEBHOOK_SUBSCRIPTION_ID` in
`/home/goodfjcw/.goodwin-strava-config.json`.

## Implemented design

### Expected subscription and acknowledgement

- Startup now requires `STRAVA_WEBHOOK_SUBSCRIPTION_ID` and accepts only a
  positive, canonical decimal string of at most 16 digits that also fits a
  JavaScript safe integer. Missing/malformed configuration prevents healthy
  startup. The route independently fails closed if invoked with bad config.
- Webhook POSTs compare the validated payload subscription exactly to that
  private value before owner lookup, event registration, or provider work.
- Wrong subscription, wrong connected athlete, non-activity, future-dated,
  rate-limited, or out-of-window create/update events receive the same generic
  HTTP 200 `{"accepted":true}` response and schedule no Strava fetch.
- The existing GET verification-token challenge contract is unchanged.
- A valid event performs only bounded parsing plus small database checks and a
  durable insert before the HTTP acknowledgement. Strava activity retrieval is
  always scheduled after acknowledgement. A database failure returns the
  existing generic service-unavailable response so the provider can retry.

### Durable idempotency, concurrency, and ordering

Migration `006_strava_webhook_admin_hardening_mariadb.sql` adds four ordinary
InnoDB tables without generated columns or destructive operations:

- `strava_webhook_events`: unique SHA-256 event keys, minimum numeric/type
  metadata, processing state, lease, timestamps, and expiry.
- `strava_webhook_activity_state`: one row per activity for last-applied order
  and the cross-Passenger activity lease.
- `strava_webhook_rate_state`: one shared webhook burst counter.
- `strava_admin_auth_failures`: hashed peer-address failure buckets.

The event key covers canonical validated values for subscription, owner, object
type/ID, aspect, event time, and the shallow bounded `updates` object. Raw
payloads are not retained. Event rows expire after 14 days and each accepted
registration performs a bounded cleanup of at most 100 expired rows. The
activity-state row retains the latest event key/time/rank, preventing a delayed
duplicate from reapplying even after its event row expires.

A transactional 60-second per-activity lease serializes create, update, and
delete work across Passenger processes. Existing token-refresh locking and
candidate/match transactions remain the authority for token and race-match
integrity. Ordering is `(event_time, aspect rank)` with
`delete > update > create` at an equal timestamp:

- duplicate create: acknowledged; one durable row; processed once;
- update after create: serialized and applied if newer;
- stale update: marked ignored and does not fetch or overwrite;
- delete after update: serialized, removes the match, marks an existing
  candidate excluded with fixed reason `strava_activity_deleted`, and never
  calls Strava;
- delayed duplicate: acknowledged and suppressed by the unique/latest key;
- restart during processing: bounded retries handle transient failures, and
  Passenger startup scans up to 50 queued, failed, or lease-expired records and
  re-queues them without requiring another provider delivery.

Delete is allowed outside the activity-ingestion window because it only removes
public eligibility. Create/update remain fetch-gated by the unchanged window,
and fetched-activity ownership/window checks remain intact.

### Abuse and request bounds

- Valid subscription/athlete-shaped webhook work is capped in MariaDB at 120
  events per 60-second shared window. Excess requests receive the generic 200
  acknowledgement and schedule no work.
- Administrator failures are keyed by SHA-256 of the Passenger socket peer
  address and shared in MariaDB. The first 10 failures in five minutes preserve
  the existing generic 401/Basic challenge; subsequent failures receive generic
  429 plus `Retry-After`. Correct Basic or Bearer credentials bypass the failure
  gate and clear that peer bucket, so the operator is not locked out.
- Existing one-second body deadlines remain. Webhook JSON is limited to 16 KiB,
  candidate-assignment JSON to 4 KiB, and all route query strings to 4 KiB.
  The `updates` object is shallow, at most 16 allowlisted-name fields, and only
  accepts bounded scalar values.
- Public race/status reads remain simple indexed schedule projections. No new
  public endpoint or infrastructure was added.

The 120/minute webhook ceiling is intentionally conservative for an athlete who
normally generates far fewer events. A forged burst that matches both the
subscription and athlete could consume that window and cause later legitimate
events to be acknowledged without processing. This is a bounded availability
tradeoff; safe fixed-category logs and later reconciliation provide operational
visibility. Provider/edge throttling remains separately unverified.

### Logging and credential handling

Logs use fixed categories for receipt, configuration unavailable, wrong
subscription/athlete, closed window, duplicate, queue/recovery, success,
failure, stale event, webhook rate limit, and administrator rate limit. Metadata
is limited to safe object/activity IDs, aspect, retry/event count, or route.
Provider bodies, raw payloads, Authorization, access/refresh/admin/verify tokens,
client secrets, encryption keys, and one-time connection tokens are never logged.

`STRAVA_ADMIN_TOKEN` remains a minimum-32-character private value, compared via
the existing timing-safe digest comparison, accepted only in Basic/Bearer
Authorization, never in a URL, never cached, and never exposed to the browser
application. The rotation procedure in `strava-app/README.md` requires a private
backup, password-manager-generated replacement, one Passenger restart, new/old
token validation, and restoration of only the private config on rollback. No
live rotation occurred here.

## Files in scope

Runtime/source:

- `strava-app/app.js`
- `strava-app/lib/routes.mjs`
- `strava-app/lib/mysql-store.mjs`
- `strava-app/migrations/006_strava_webhook_admin_hardening_mariadb.sql`
- `strava-app/.env.example` (placeholder key only; not packaged)
- `strava-app/README.md`

Tests/build/documentation:

- `tests/tg-m05-hardening.test.mjs`
- `tests/helpers/memory-strava-store.mjs`
- `tests/strava.test.mjs`
- `tests/strava-build.test.mjs`
- `tests/passenger-startup.test.mjs`
- `scripts/check-strava-cpanel-package.mjs`
- `docs/strava-integration.md`
- this record and the TG-M05 status paragraph in the authoritative audit
- generated `dist/goodwin-strava-api/` deployment package

No static website, map, HSTS, browser-header, DNS, database, production, or
secret-bearing file was changed.

## Deployment package and required order

The deployable artifact is the generated 20-file directory
`dist/goodwin-strava-api/` and its Desktop ZIP. Upload the complete package,
not selected runtime files, because the package checker treats it as an exact
allowlist. It contains `passenger.cjs`, `app.js`, package manifests, README,
seven `lib/` modules, migrations 001–006 plus 004b, and the existing schedule seed.
It contains no `.env`, private JSON config, tests, `node_modules`, or real
subscription/credential value.

Future manual deployment order is mandatory:

1. Create a private, checksum-verified backup of the current application package,
   private config, and database data/schema. Do not put it under `public_html`.
2. Import only `migrations/006_strava_webhook_admin_hardening_mariadb.sql` into
   the existing application database and confirm the four new InnoDB tables.
3. Add `STRAVA_WEBHOOK_SUBSCRIPTION_ID` as a quoted decimal string to the
   existing owner-only private JSON config. Do not echo it or add it to cPanel
   command history/environment UI.
4. Upload the complete verified TG-M05 package into the Passenger app root.
5. Run cPanel **Run NPM Install** if required, then restart Passenger once.
6. Validate generic health, public routes, admin auth/rate recovery, webhook GET,
   a controlled valid event/retry, race state, and the public map before closure.

The migration/config/code order matters: the new startup database check requires
the tables and the new startup contract requires the private field. An incomplete
deployment therefore fails closed with generic unavailable behavior rather than
processing unvalidated webhooks.

## Rollback

Restore the checksum-verified pre-TG-M05 application package and restart
Passenger once. Restore the prior private config if necessary. Leave the four
additive tables and extra config key dormant during an emergency rollback; do
not drop tables as part of routine rollback. Older code ignores both. Restore a
database backup only if an independently confirmed data-integrity problem
requires it, since rolling back operational event/delete state can itself lose
legitimate changes. Revalidate health, public APIs, OAuth/admin boundaries,
webhook GET, and the map.

## Local validation evidence

- Exact Node runtime: `v22.23.2`.
- Focused webhook/admin plus existing Strava route tests: 46/46 passed.
- Full Node suite: 110/110 passed, zero failures.
- cPanel package validator passed the exact 20-file allowlist, Node 22 engine,
  single production dependency, route/config contracts, and additive migration.
- Source/package parity, actual-subscription-value scan, archive metadata/secret
  exclusions, and `git diff --check` passed.
- Desktop ZIP:
  `/Users/micah/Desktop/goodwin-strava-api-tg-m05-2026-09-07.zip`
- ZIP SHA-256:
  `b6ff403cb3ba403ab75894df94da2876e42f362434efb8a468c152d8c3feed5b`
- Key packaged SHA-256 values: `app.js`
  `09c68eb0c1f4f87d6e07c68cae43e3af629138fa9710bbc5c6c1cf9440f20f33`;
  `lib/routes.mjs`
  `b407c8b964bc06cffa1518fa2e42b504f6589ecc20439b0a412093a332a4a79b`;
  `lib/mysql-store.mjs`
  `1beab1429c0e8d3171bd02bbbb57a65c00bce8c8bf8f087fcb43415eb91e0f21`;
  migration 006
  `60b2a957e195ee3cb78677d96bb534623db707747bee6cd1f14f0fb300965750`.

## Final production validation

Final read-only production validation on 2026-09-07 passed:

- Uncached `GET /strava/health` returned HTTP 200 and exactly
  `{"status":"ok"}` with `no-store`, the application CSP, `no-referrer`,
  `nosniff`, and the unchanged host-only HSTS policy. Because this build requires
  the new private subscription field during initialization and `ping()` checks
  all four migration-006 tables, healthy startup is evidence that the deployed
  configuration is well-formed and the additive schema is available.
- `GET /strava/public/races` returned HTTP 200 with exactly 50 ordered scheduled
  races; no completed activity was exposed. `GET /strava/public/race-status`
  returned inactive, window `ggma-2026`, 0 completed, and 50 total.
- Anonymous `/strava/status`, `/strava/connect`, and `/strava/candidates` each
  returned generic HTTP 401 with the expected Basic challenge and `no-store`.
  One isolated wrong credential per route also returned the same generic 401.
  The production threshold was deliberately not exercised. Existing operator
  evidence confirms the valid status path still reports William Goodge connected;
  OAuth, token refresh, connection locking, and valid-auth bypass/clear behavior
  passed the integration suite.
- A tokenless production webhook verification request returned the expected
  generic 403. The unchanged valid verification challenge flow passed retained,
  stripped, and internal-mount integration tests. The real verify token was not
  read, transmitted, logged, or reported.
- No production webhook POST was sent. Matching/wrong/missing subscription,
  wrong athlete, no-fetch mismatch, duplicates/concurrency, event ordering,
  deletes, lease expiry, restart recovery, burst ceilings, acknowledgement-before-
  fetch, malformed/oversized bodies, and safe logging were validated against the
  packaged route/store contracts and database-backed test store.
- Representative `/`, `/the-run/`, `/will/`, `/fifty-runs/`, `/live-tracking/`,
  `tracker-base.js`, and `strava-race-map.mjs` returned HTTP 200. The active asset
  hashes remained the known-good Phase 1 values: tracker
  `a6c9fea694c1bb73181ed1a9ca9801169326bd8194c576e453b2d4faf2928c54`
  and map module
  `7a750659403f256d7a5305b84f164da7a75041d362627e016c6e5457c9de9b80`.
- A fresh browser showed the lazy-load boundary: before the map entered the
  viewport it contained no rendered map layers; afterward it rendered 51 state
  paths, 50 race markers, 3 core route paths, one runner marker, and one RV
  marker. There were no console warnings/errors and no broken images. The
  five-entry static flight itinerary and its renderer remain present in the
  unchanged tracker asset and passed the established map tests/benchmark; flight
  paths were not present in the current pre-race DOM, so they were not counted as
  a TG-M05 regression. Public snapshot application and static fallback passed
  integration tests.
- Focused TG-M05/security/map suite: 103/103 passed. Full Node 22.23.2 suite:
  110/110 passed. The 20-file cPanel package validator, source/package parity,
  actual subscription-value/package fixture scans, and `git diff --check` passed.

## Closure and residual concerns

**TG-M05 is CLOSED.** No TG-M05 defect remains. Expected-subscription replacement
must still be coordinated with the private config or processing will stop safely.
Passenger peer addresses may collapse to a shared proxy address on this hosting
stack; valid credentials bypass the failed-auth gate, while provider/edge
throttling, cPanel MFA/alerts, and credential lifecycle remain separate TG-M06
concerns. Production log files were not accessed; absence of secret-capable log
arguments was established through source review, package scan, and adversarial
tests. This validation changed documentation only and did not alter production,
runtime code, cPanel, database, private config, or credentials.
