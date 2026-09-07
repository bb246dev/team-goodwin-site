# Goodwin Strava API — cPanel application

This directory is the source for the isolated Node.js 22 application mounted at
`https://goodwingoodge.com/strava`. It does not contain the Namecheap-hosted static
website. Deployment, athlete authorization, activity synchronization and webhook
registration are separate, later operations.

## cPanel database setup

1. In **MySQL Databases**, create a dedicated database and user. cPanel may prefix
   both names with the account name.
2. Add the user to that database with the privileges `SELECT`, `INSERT`, `UPDATE`,
   `DELETE`, `CREATE`, `ALTER` and `INDEX`. Once the migration is installed, the
   runtime needs only `SELECT`, `INSERT`, `UPDATE` and `DELETE`.
3. In phpMyAdmin, select that database and import
   `migrations/001_strava_oauth_mysql.sql`, followed by
   `migrations/002_strava_connection_links_mysql.sql`, then
   `migrations/003_strava_race_activity_candidates_mysql.sql`, then
   `migrations/004_ggma_race_schedule_mysql.sql`, then
   `migrations/005_strava_candidate_runtime_fields_mariadb.sql`. Finally import
   `seeds/001_ggma_2026_race_schedule_mysql.sql`.
   If an earlier generated-column version of migration 004 failed with MariaDB
   error 1901, keep the schedule table and import
   `migrations/004b_ggma_race_schedule_mariadb_repair.sql` instead of retrying
   migration 004. Then import migration 005 followed by the same seed file.
   Migration 005 adds the nullable candidate activity fields required by the
   current runtime, including the public map API.
4. Confirm these InnoDB tables exist: `strava_connection`,
   `strava_oauth_states`, `strava_refresh_lock`, and
   `strava_connection_links`, plus `strava_race_activity_candidates` and
   `ggma_race_schedule` and `strava_race_activity_matches`. Confirm the schedule
   contains exactly 50 rows numbered 1 through 50.

MySQL/MariaDB is used because a Passenger application can run multiple Node
processes. The transactional shared tables keep OAuth state and rotating refresh
tokens consistent across every process.

## Private production configuration

Store production configuration outside the application root at:

```text
/home/goodfjcw/.goodwin-strava-config.json
```

Create it as a private file owned by the cPanel account and restrict it to that
account with `chmod 600`. Do not place it in `public_html`, the application root,
the deployment ZIP, logs or source control. Its exact JSON structure is:

```json
{
  "MYSQL_HOST": "your-mysql-host",
  "MYSQL_PORT": "3306",
  "MYSQL_DATABASE": "your-cpanel-database-name",
  "MYSQL_USER": "your-cpanel-database-user",
  "MYSQL_PASSWORD": "your-database-password",
  "STRAVA_CLIENT_ID": "your-strava-client-id",
  "STRAVA_CLIENT_SECRET": "your-strava-client-secret",
  "STRAVA_VERIFY_TOKEN": "your-random-webhook-verification-token",
  "STRAVA_ADMIN_TOKEN": "your-random-administrator-token",
  "STRAVA_TOKEN_ENCRYPTION_KEY": "your-base64-encoded-32-byte-key"
}
```

All values must be JSON strings. The application uses a nonempty `process.env`
value first and reads the matching private-file value only when that environment
value is missing or empty. Remove the ten application variables from cPanel's
**Environment Variables** interface after creating the private file so its wrapper
does not emit malformed shell exports. Restart the application afterward.

The configuration keys are:

- `MYSQL_HOST` — normally `localhost`; use the value cPanel shows.
- `MYSQL_PORT` — normally `3306`.
- `MYSQL_DATABASE` — exact cPanel database name, including any prefix.
- `MYSQL_USER` — exact cPanel database username, including any prefix.
- `MYSQL_PASSWORD` — password for that database user.
- `STRAVA_CLIENT_ID` — supplied by Strava.
- `STRAVA_CLIENT_SECRET` — supplied by Strava.
- `STRAVA_VERIFY_TOKEN` — an independent random verifier of at least 32 characters.
- `STRAVA_ADMIN_TOKEN` — an independent random administrator password of at least
  32 characters. The Basic Auth username is `strava`.
- `STRAVA_TOKEN_ENCRYPTION_KEY` — standard base64 for exactly 32 random bytes.
Generate the three internal values locally without saving them in the repository.
Run each command separately in a trusted terminal and place its output directly in
the matching private JSON string:

```sh
openssl rand -base64 48 | tr -d '\n'
openssl rand -base64 48 | tr -d '\n'
openssl rand -base64 32 | tr -d '\n'
```

Use the first two outputs for the verify and admin tokens in either order, and the
32-byte output only for the encryption key. Keep the encryption key in a password
manager; losing or changing it makes stored Strava credentials unreadable.

## cPanel application files

Upload the **contents** of the generated `dist/goodwin-strava-api` directory into
the configured `goodwin-strava-api` application root:

```text
passenger.cjs
app.js
package.json
package-lock.json
README.md
lib/
migrations/
seeds/
```

Do not upload `.env.example`, a populated `.env`, the private production config,
`node_modules`, tests, or static website files. `package.json` is at the
application root, so cPanel can detect it and enable **Run NPM Install**. Set the
cPanel **Application startup file** to `passenger.cjs`. After upload, run **Run NPM
Install** and restart the app. Passenger requires the CommonJS shim, which imports
the ES-module `app.js` and calls its exported startup function. Passenger supplies
the application listener port; the code does not bind to public ports 80 or 443.

## Production routes

- `GET /strava/health-startup` is a temporary, secret-free Passenger startup diagnostic.
  It reports only initialization booleans and a sanitized error category. Normal
  production routes return 503 until configuration, MySQL and Strava validation
  all succeed.
- `GET /strava/connect` requires HTTP Basic or Bearer administrator auth.
- `POST /strava/connect-link` requires administrator auth and creates one remote
  athlete link that expires after 24 hours.
- `GET /strava/connect-athlete?token=...` consumes that link and starts the same
  browser-bound OAuth state flow without exposing administrator credentials.
- `GET /strava/callback` requires browser-bound, expiring, single-use state.
- `GET /strava/status` requires administrator auth.
- `GET /strava/candidates` requires administrator auth and returns pending
  activity candidates with the schedule for review.
- `POST /strava/candidates/{activityId}/assign` requires administrator auth and
  a JSON body such as `{ "raceId": "ggma-2026-16" }`. It atomically assigns the
  activity to one unoccupied scheduled race.
- `GET /strava/public/races` is read-only and public. It returns all 50 schedule
  rows in race-number order and attaches sanitized activity summaries only for
  candidates that are both included and present in the one-to-one match table.
- `GET /strava/public/race-status` is read-only and public. It returns the
  operational-window state and completed/total race counts.
- `GET /strava/webhook` performs Strava's verification challenge.
- `POST /strava/webhook` validates and acknowledges a bounded event body.

## GGMA 2026 operational window

The server has one immutable activity-processing window:

```json
[
  {
    "id": "ggma-2026",
    "start": "2026-10-09T00:00:00-04:00",
    "end": "2026-11-01T23:59:59-05:00"
  }
]
```

The explicit offsets preserve New York's change from EDT to EST. Valid activity
webhooks received outside this inclusive window are acknowledged without starting
an activity-detail fetch. There is no post-window ingestion grace period. A
fetched activity must be evaluated separately using its actual start timestamp;
the webhook `event_time` is not an activity start time.

`strava_race_activity_candidates` keeps each in-window activity pending until it
is matched to a scheduled marathon ID and state or explicitly excluded. Public
race data must select only included, schedule-matched rows.

The operational window is the **ingest window**: the backend may fetch and store
new Strava activity details only during that interval. Public display has a
separate lifecycle. Before the window, the public API returns the complete
schedule without activity data. During the window it returns stored included
matches. After the window it continues returning those completed historical
results, while the fetch gate prevents any new Strava ingestion. Closing the
window therefore does not blank completed race results.

The schedule seed is derived only from the currently published Goodwin schedule
at `https://goodwingoodge.com/fifty-runs/`, captured on 2026-09-04. It preserves
all 50 published race numbers, dates, state names and city wording. The source
does not publish start times, timezones or race coordinates, so those database
fields remain null.

In-window activity create/update webhooks are acknowledged immediately and then
schedule a background detail fetch. The fetched activity must belong to the
connected athlete and its actual `start_date` must fall inside the operational
window. Matching considers the activity's local start date, distance, city/state
evidence, optional start/end coordinates when schedule coordinates are later
available, race order context and races already included. Date alone never
auto-confirms a match, including on two- and three-race days.

The broad candidate distance range is 38,000–47,000 meters. A recording is only
eligible for automatic matching inside the narrower 40,000–45,000 meter range
and with unique geographic support. Distances outside either range remain
pending for review; they are not automatically rejected. Database constraints
prevent one activity from being assigned to multiple races and prevent one race
from having multiple included activities. MariaDB enforces this through the
ordinary `strava_race_activity_matches` table: race ID is its primary key and
activity ID has a unique index. Application writes update the match and candidate
inside the same transaction; no generated column is used.

The public website and map remain unchanged. The public API starts from all 50
rows in `ggma_race_schedule` and joins `strava_race_activity_matches` to
`strava_race_activity_candidates` only where the candidate is `included` and its
scheduled race ID agrees with the match row. Pending and excluded candidates,
review metadata, athlete metadata and credentials are never selected. Public
requests read the database only and cannot initiate arbitrary activity lookups,
token refreshes or Strava API calls.

Review pending candidates with a password-prompted request:

```sh
curl --fail --silent --show-error --user strava https://goodwingoodge.com/strava/candidates
```

Assign one candidate by substituting the activity and race IDs:

```sh
curl --fail --silent --show-error --request POST --user strava \
  --header 'Content-Type: application/json' \
  --data '{"raceId":"ggma-2026-16"}' \
  https://goodwingoodge.com/strava/candidates/ACTIVITY_ID/assign
```

To create a remote athlete link, run this in a trusted terminal. Curl prompts for
the administrator password, so it is not placed in the command or URL:

```sh
curl --fail --silent --show-error --request POST --user strava https://goodwingoodge.com/strava/connect-link
```

The response body is the athlete URL alone. Send that exact line to the athlete.
The application stores only its SHA-256 hash. Opening the link atomically consumes it while
creating the normal ten-minute OAuth state, so a replay, duplicate request, or
request after its 24-hour expiry receives the same safe invalid-link response.

The OAuth callback URL is
`https://goodwingoodge.com/strava/callback`. Set the Strava **Authorization
Callback Domain** to `goodwingoodge.com`. Requested scopes are
`read,activity:read_all`. The webhook URL is
`https://goodwingoodge.com/strava/webhook`.

OAuth, admin, callback and webhook responses do not send CORS headers. Public
race responses allow the exact origin `https://goodwingoodge.com`, set
`Vary: Origin`, and never use a wildcard or credentialed CORS. They cache for 20
seconds during the operational window and 300 seconds outside it. Errors and all
administrator responses remain non-cacheable. The separate `/api/public/*`
internal namespace remains unavailable.
