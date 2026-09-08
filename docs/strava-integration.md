# Strava backend architecture

Prepared for the Namecheap/cPanel production application on 2026-09-03. This
work does not deploy code, authorize an athlete, register a webhook, fetch an
activity, or alter the public website or live map.

## Production layout

- The existing public website remains at `https://goodwingoodge.com` on
  Namecheap/cPanel.
- The Strava backend is a separate Node.js 22 Passenger application. Its cPanel
  application root is `goodwin-strava-api` and its mount URL is
  `https://goodwingoodge.com/strava`.
- The source and deployment instructions are in `strava-app/`.
- The isolated upload artifact is generated at `dist/goodwin-strava-api/`.
- Persistent state and encrypted tokens live in a dedicated cPanel
  MySQL/MariaDB database. The schema uses InnoDB transactions.

The Worker, Wrangler and D1 architecture has been removed. The Node app has one
production dependency: `mysql2`, which provides a Promise API, connection pools
and prepared statements without native bindings.

## Routes and access boundary

| Method | URL | Access |
| --- | --- | --- |
| GET | `https://goodwingoodge.com/strava/health` | Public generic health (`ok` or `unavailable` only) |
| GET | `https://goodwingoodge.com/strava/connect` | HTTP Basic or Bearer administrator token |
| POST | `https://goodwingoodge.com/strava/connect-link` | HTTP Basic or Bearer administrator token |
| GET | `https://goodwingoodge.com/strava/connect-athlete?token=...` | Single-use remote athlete link |
| GET | `https://goodwingoodge.com/strava/callback` | Browser-bound OAuth state |
| GET | `https://goodwingoodge.com/strava/status` | HTTP Basic or Bearer administrator token |
| GET | `https://goodwingoodge.com/strava/candidates` | HTTP Basic or Bearer administrator token |
| POST | `https://goodwingoodge.com/strava/candidates/{activityId}/assign` | HTTP Basic or Bearer administrator token |
| GET | `https://goodwingoodge.com/strava/public/races` | Public read-only stored schedule/results |
| GET | `https://goodwingoodge.com/strava/public/race-status` | Public read-only race-window summary |
| GET | `https://goodwingoodge.com/strava/webhook` | Strava verification token |
| POST | `https://goodwingoodge.com/strava/webhook` | Bounded, subscription/athlete-validated, durably deduplicated event acknowledgement |

The app accepts both the full paths above and mount-stripped paths from
Passenger. It constructs security-sensitive URLs from the fixed production
origin instead of trusting forwarded host headers.

The callback is `https://goodwingoodge.com/strava/callback`. Set Strava's
**Authorization Callback Domain** to `goodwingoodge.com`. The authorization
request asks for `read,activity:read_all`. The webhook URL is
`https://goodwingoodge.com/strava/webhook`.

OAuth, admin and webhook routes never send CORS headers. The public map reads
only `/strava/public/races` and `/strava/public/race-status`; both return stored,
sanitized schedule/result data and cannot initiate Strava API calls. The website
and API share `https://goodwingoodge.com`, so the browser request is same-origin
and needs no CORS permission.

## Storage and security

`strava-app/migrations/001_strava_oauth_mysql.sql` creates:

- `strava_connection` for one athlete identity, scopes, expiry, and encrypted
  access/refresh token pair.
- `strava_oauth_states` for hashed, browser-bound, expiring, single-use state.
- `strava_refresh_lock` for a database-wide refresh lease shared by Passenger
  processes.

Migration `002_strava_connection_links_mysql.sql` adds hashed, single-use remote
athlete connection links. Migration `003_strava_race_activity_candidates_mysql.sql`
adds candidate activity records with nullable scheduled-marathon and state
matches plus an explicit pending/included/excluded classification.

Migration `004_ggma_race_schedule_mysql.sql` creates the authoritative
`ggma_race_schedule` table and adds geographic evidence, review metadata and a
one-to-one `strava_race_activity_matches` table. Race ID is the primary key and
activity ID is unique, avoiding MariaDB-incompatible conditional generated
columns. Import
`seeds/001_ggma_2026_race_schedule_mysql.sql` immediately afterward. The seed
contains exactly the 50 races published at
https://goodwingoodge.com/fifty-runs/, in published order, as captured on
2026-09-04. No start times, timezones, coordinates or route details are inferred.
For a production database where the earlier migration 004 failed with MariaDB
error 1901, keep `ggma_race_schedule`, import
`004b_ggma_race_schedule_mariadb_repair.sql`, then import
`005_strava_candidate_runtime_fields_mariadb.sql`, and then import the unchanged
seed.

Migration `006_strava_webhook_admin_hardening_mariadb.sql` adds only durable
TG-M05 coordination state: idempotent webhook events, per-activity leases/order,
a shared webhook burst counter, and hashed administrator-authentication failure
buckets. It is MariaDB-compatible and contains no generated columns or
destructive changes to existing application data.

## Activity-processing window

The only configured operational window is `ggma-2026`, from
`2026-10-09T00:00:00-04:00` through `2026-11-01T23:59:59-05:00`, inclusive.
The offsets are intentional because New York changes from EDT to EST on November
1. Valid webhook POSTs are acknowledged outside the window, but they cannot begin
a Strava activity-detail fetch or ingestion. There is no post-window grace
period. After an in-window fetch, activity eligibility is determined from the
activity's actual start timestamp rather than webhook `event_time`. Candidate
activities require an explicit marathon/state match and included classification
before they may contribute to future public race data.

Candidate matching uses the activity's local start date only to identify
possible schedule rows. Date alone is insufficient. A unique automatic match
also needs a 40,000–45,000 meter recording and matching city/state evidence, or
coordinates within 80 km when schedule coordinates are available. The wider
38,000–47,000 meter range marks plausible marathon recordings; anything
uncertain remains pending rather than being rejected. Included races and race
order context inform the result without treating local timestamp order as proof
on multi-race days.

Pending candidates are available only through administrator-protected
`GET /strava/candidates`. An administrator can assign one through
`POST /strava/candidates/{activityId}/assign` with a JSON `raceId`. Database
constraints allow only one included activity per race and one race reference per
activity. Public reads start from all schedule rows and attach activity data
only for included, matched candidates.

Tokens use AES-256-GCM with the athlete ID as authenticated context. A refresh
holder writes the rotated pair only while it owns an unexpired database lease.
Writes for a different athlete are rejected. Provider errors and webhook body
fields are not logged or returned.

Webhook POST processing also requires the privately configured expected
subscription ID and the connected athlete ID before enqueueing. A SHA-256 event
key gives 14-day durable deduplication, a shared 60-second activity lease
serializes Passenger workers, and stored event time/aspect precedence prevents
stale updates from overwriting newer state. Deletes remove the activity's public
match without a provider fetch. Passenger startup recovers up to 50 queued,
failed, or lease-expired event records. A shared 120-events-per-minute burst ceiling
bounds valid-looking webhook work. Administrator authentication failures are
counted by hashed Passenger peer address: 10 failures per five minutes receive
the normal 401 response, then generic 429 responses until recovery; valid
credentials are never locked out.

Required cPanel variables are `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`,
`MYSQL_USER`, `MYSQL_PASSWORD`, `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`,
`STRAVA_VERIFY_TOKEN`, `STRAVA_WEBHOOK_SUBSCRIPTION_ID`, `STRAVA_ADMIN_TOKEN`, and
`STRAVA_TOKEN_ENCRYPTION_KEY`. The preferred production source is the private
JSON file `/home/goodfjcw/.goodwin-strava-config.json`, outside the application
root and `public_html`. Values never belong in source, logs or an uploaded
environment file. Exact setup and local generation commands are in
`strava-app/README.md`.

## Manual deployment sequence

1. Create the cPanel database and database user, grant the privileges described
   in `strava-app/README.md`, and import the MySQL migrations and schedule seed
   in phpMyAdmin.
2. Add the private JSON configuration file described above and remove the ten
   matching values from cPanel's Environment Variables interface.
3. Build and test locally with `npm run build`, `npm test`, and
   `npm run check:cpanel`.
4. Upload only the contents of `dist/goodwin-strava-api/` to the configured
   application root. Use cPanel's **Run NPM Install**, then restart the app.
5. Verify `/strava/health`, confirm `/strava/health-startup` returns 404, and
   check protected routes and the webhook verification GET without starting
   OAuth.
6. Configure Strava, authorize the intended athlete, and register the webhook
   only in separately approved later steps.
