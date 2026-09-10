# GitHub to Namecheap production workflow

## Scope and safety boundary

This document describes Stage 1: manually dispatched, manifest-driven GitHub Actions workflows for the Team Goodwin site on Namecheap/cPanel/LiteSpeed. Stage 1 does not deploy on push, automate cPanel, change DNS, modify Passenger configuration, create credentials, or infer a server destination from a repository path.

The live layout remains:

- Static document root: `/home/goodfjcw/public_html`
- Passenger application root: `/home/goodfjcw/goodwin-node-test`
- Public Passenger mount: `/strava`
- Passenger startup file: `passenger.cjs`

All workflows share the `production-deployment` concurrency group with `cancel-in-progress: false`. Static uploads, backend uploads, and backend verification therefore cannot overlap.

## Architecture

There are three manually dispatched workflows:

1. `.github/workflows/deploy-static-production.yml` validates, plans, and optionally uploads only manifest-listed static files. Deploy mode immediately performs static HTTP, browser, API, and production-hash checks.
2. `.github/workflows/deploy-backend-production.yml` validates, plans, and optionally uploads only manifest-listed backend files. It verifies each upload by downloading and hashing it, then stops at the manual Passenger restart gate.
3. `.github/workflows/verify-backend-production.yml` runs only after the operator completes the cPanel Stop → Start procedure. It re-creates the release metadata from the exact deployed commit and manifest, verifies production hashes and public APIs, and performs authenticated runtime-generation verification.

Each deploy workflow has two trust zones:

- The validation job has only repository read access. It checks out the selected commit, installs locked dependencies with Node 22, validates the manifest, scans deployment sources for secrets, runs `git diff --check`, executes the selected release profile, and creates an immutable release candidate artifact.
- The production job uses the protected `production` GitHub Environment. It downloads that exact candidate, reads current files over FTPS, creates backups/rollback data, and either ends as a dry run or uploads exact files in deploy mode.

No job performs a directory sync, mirror, deletion pass, generic `dist` upload, or source-path-to-server-path transformation.

## Versioned manifest format

Manifests use `schemaVersion: 1`, live under `deploy/manifests/`, and contain only recognized fields. Unknown fields fail validation. A manifest has this shape:

```json
{
  "schemaVersion": 1,
  "deploymentType": "static",
  "releaseType": "micro",
  "description": "One reviewed change",
  "protectedPathsApproved": [],
  "files": [
    {
      "source": "dist/the-run.html",
      "destination": "public_html/the-run.html",
      "publicPath": "/the-run/",
      "expectedSha256": "optional-approved-new-source-lowercase-64-character-sha256",
      "expectedRemoteSha256": "optional-expected-existing-remote-lowercase-64-character-sha256"
    }
  ],
  "validation": {
    "targetedTests": ["tests/footer.test.mjs"],
    "browserRoutes": ["/the-run/"],
    "apiChecks": []
  }
}
```

`source` and `destination` are independent and both must be explicit. `expectedSha256` is the approved hash of the **new/source** content; validation compares it with the repository source and packaged release. `expectedRemoteSha256` is the separately approved hash of the **existing remote destination** before any upload. These fields are not interchangeable. Both are mandatory for protected destinations. They remain optional for ordinary destinations, but either field is enforced whenever supplied. Static entries also require an exact `publicPath` so clean-route and asset checks do not depend on guesswork. A backend entry omits `publicPath`.

For a protected `.htaccess` release based on the inspected production file, the file entry begins like this (the all-zero new/source value is deliberately invalid for real content and must be replaced after reviewing the new source):

```json
{
  "source": "deploy/static/reviewed.htaccess",
  "destination": "public_html/.htaccess",
  "publicPath": "/",
  "expectedSha256": "0000000000000000000000000000000000000000000000000000000000000000",
  "expectedRemoteSha256": "e60b5f3b1f4677e2f9d5bbd82c17a4001f3a19303c0af26ae432be7112535713"
}
```

Never copy one hash into the other merely to satisfy validation. The standard static example likewise contains an all-zero remote placeholder so it fails safely against a real server until an independently observed and approved current remote hash replaces it.

The release-level input must equal `releaseType`. The workflow will not silently upgrade or downgrade it. Example manifests are accepted in dry-run mode but deliberately rejected in deploy mode; copy an approved real release to `deploy/manifests/releases/` first.

### Root clean routes

Production clean routes map to root-level HTML files:

```text
/                 -> public_html/index.html
/the-run/         -> public_html/the-run.html
/live-tracking/   -> public_html/live-tracking.html
```

The validator enforces this mapping. It never maps `/the-run/` to `the-run/index.html`. Deploying the whole `dist` directory is prohibited because `dist` contains both root HTML files and directory-index copies, as well as files that do not all belong in the public document root.

## Destination allowlists and protected paths

Static destinations are limited to:

- `public_html/*.html` (one root-level filename, not a nested route directory)
- `public_html/assets/**`
- `public_html/data/**`
- the exact protected exception `public_html/.htaccess`

Static sources must come from an explicitly deployable source family matching the destination type: root or `dist` root HTML, `assets`/`dist/assets`, or `data`/`dist/data`. A generic directory is never accepted.

Backend destinations are limited to `goodwin-node-test/**`, and sources are limited to `strava-app/**` or `dist/goodwin-strava-api/**`. Every backend destination must still be enumerated. Node modules and credential files are rejected.

The following static files require an exact matching value in `protectedPathsApproved`:

- `public_html/assets/tracker-base.js`
- `public_html/assets/strava-race-map.mjs`
- `public_html/.htaccess`

The map asset can be a Micro release only when its exact destination is explicitly approved. `.htaccess` is a protected infrastructure file and should be treated as Major operational work. Every protected entry also requires both `expectedSha256` for the approved new source and `expectedRemoteSha256` for the approved current remote file; omission fails closed.

Backend architecture, startup, dependency, migration, authentication, security, and configuration paths are protected and require both an exact `protectedPathsApproved` entry and a Major release. This includes `passenger.cjs`, `app.js`, `package.json`, `package-lock.json`, `migrations/**`, configuration paths, and auth/security modules. `.env`, credential, secret, and private-key destinations are never allowed.

All paths reject absolute paths, `..`, backslashes, wildcard characters, shell metacharacters, control characters, non-normalized paths, duplicates, symlinks, missing sources, and unknown destination roots.

## Release policy

| Level | Intended scope | Pre-deploy validation | Production validation |
|---|---|---|---|
| Micro | Copy, image, link, narrow CSS, isolated frontend asset | Deployment-tooling tests plus manifest-targeted tests | Exact FTPS hashes, affected URL checks, one representative desktop Chrome smoke test |
| Standard | Layout, navigation/footer, responsive behavior, map frontend, coordinated timing | Micro checks plus full representative tests, site/cPanel builds, and release-size comparison against production | Micro checks plus desktop/mobile browser passes, same-origin broken-image and console-error checks, and manifest API checks for map/Strava/HAPN as applicable |
| Major | New APIs, architecture, Passenger, auth/security, database/migrations, infrastructure | Standard checks plus root/backend dependency audits and cPanel package validation | All manifest routes/APIs, both viewports, exact hashes, and the separate authenticated runtime check after restart |

Always choose the lowest level that truthfully covers the change. Standard and Major plans record old/new byte counts and deltas for each file as a transfer-size benchmark. Feature-specific performance benchmarks should also be included as targeted repository tests when a change affects runtime performance.

## Dry-run procedure

Dry run is the default and is the first mode to test after these files are reviewed, committed, and pushed later.

1. Open the appropriate workflow in GitHub Actions and choose **Run workflow**.
2. Select the exact branch/tag commit containing the approved manifest.
3. Choose the matching release level.
4. Leave mode as `dry-run`.
5. Enter the repository-relative manifest path.
6. Approve the `production` Environment gate if required. The dry run needs protected FTPS credentials to read current production files, but it never uploads.
7. Review the job summary and download the `*-production-plan-*` artifact.

The dry run validates and tests locally, calculates new/source hashes, downloads every current destination into the Actions artifact, records expected and observed old hashes, reports new/changed/unchanged files and byte deltas, and writes `rollback-manifest.json`. A supplied remote precondition must match the downloaded file; a missing or mismatched protected destination fails before upload is possible. It invokes no upload operation and makes no production change.

## Real static deployment procedure

1. Copy the dry-run manifest from `deploy/manifests/examples/` to a reviewed file under `deploy/manifests/releases/`. For each protected file, replace placeholders with an approved new/source `expectedSha256` and an independently approved existing remote `expectedRemoteSha256`.
2. Review a fresh dry-run artifact and confirm every source, destination, public URL, old expected/observed hash, new expected hash, and protected approval.
3. Re-run **Deploy static production** against the same approved commit and manifest with mode `deploy`.
4. Approve the protected `production` Environment deployment.
5. Confirm the workflow completes per-file upload verification and HTTP/browser/API validation.
6. Retain the plan artifact until the release is accepted.

The deliberate `workflow_dispatch`, non-example manifest, exact checked-out commit, release/input match, and GitHub Environment protection form the deploy confirmation boundary. There is no push trigger.

## Backend upload and manual Passenger restart gate

Run the backend workflow in dry-run mode first and review its artifact. In deploy mode it uploads and hash-verifies backend files but does not attempt a cPanel restart or claim the new code is active.

After a successful backend upload, the workflow emits:

> ACTION REQUIRED: Open cPanel → Setup Node.js App → Stop goodwingoodge.com/strava → wait for Stopped → Start → wait for Started.

Then run **Verify backend production** with:

- the full 40-character commit SHA used by the upload;
- the identical backend manifest path; and
- the identical release level.

The verification workflow checks out that immutable commit and compares its packaged file hashes with production before checking runtime behavior.

`restart.txt`, FTP overwrite of `restart.txt`, and cPanel **Restart** alone are prohibited because they do not guarantee that Passenger reloads modules. Browser automation against cPanel is also out of scope. Supported cPanel/Namecheap restart automation can be considered only after an authenticated vendor API is explicitly proven.

## FTPS transfer and 451 mitigation

The repository-owned Node scripts invoke native `curl` in explicit FTPS mode (`ssl-reqd`, TLS 1.2 minimum). Credentials are written only to a permission-restricted temporary curl configuration, are never placed in YAML or command arguments, and are deleted after each call.

Transfers are sequential and per-file. Before any upload, deploy mode re-downloads every destination with an `expectedRemoteSha256` and fails the entire upload phase if any hash differs. It repeats that check immediately before each affected upload to narrow the time-of-check/time-of-use window. Each changed file is then uploaded separately, downloaded to a temporary non-artifact path, and checked against the approved new/source SHA-256 before the next file begins. Curl uses bounded retries and `singlecwd`; this small-batch behavior mitigates the Namecheap FTPS 451 behavior seen during larger transfers. There is no delete, mirror, or directory-sync operation.

The URL scheme inside the curl implementation is `ftp://` because curl uses that scheme for explicit FTPS negotiation; `ssl-reqd` makes an unencrypted session a hard failure. Plain FTP is never permitted.

## Backup and rollback

Before any upload, every manifest destination is downloaded when it exists. The production plan artifact contains:

- `backup/` with the previous files;
- `deployment-plan.json` with source, destination, status, old expected/observed SHA-256, new expected SHA-256, sizes, and deltas;
- `rollback-manifest.json` with the required action for every destination; and
- deploy-mode upload/verification results with old expected, old observed, new expected, and new observed SHA-256 values when applicable.

Existing files have rollback action `restore-backup`. Files newly introduced by a release have `manual-remove-new-file`; Stage 1 deliberately does not automate remote deletions. Unchanged files are neither uploaded nor restored.

Rollback is a new, reviewed deployment operation: create a manifest whose sources are the downloaded backup files in a secure temporary operator checkout, verify their recorded SHA-256 values, and upload only those exact destinations. Do not commit production backup artifacts to Git. Removing a newly created file is a manual, separately authorized cPanel/FTPS action because delete synchronization is prohibited.

## Runtime-status verification

After the manual Passenger Stop → Start, the backend verification workflow sends an authenticated request to `/strava/admin/runtime-status`. It constructs the existing Basic authorization header in memory from `STRAVA_ADMIN_USER` (default `strava`) and the masked `STRAVA_ADMIN_TOKEN` Environment secret. It never prints the token, authorization header, or raw response body.

The endpoint must return HTTP 200 and `Cache-Control` containing both `no-store` and `private`. The verifier reads and validates only these approved fields:

- `releaseGeneration`
- `pid`
- `processStartedAt`
- `processUptimeSeconds`
- `raceWindowStart`
- `raceWindowEnd`
- `raceWindowModuleVersion`

Only the approved field names are written to logs; credential/header values are never logged.

## GitHub Environment and credentials

Create a GitHub Environment named `production`. Configure required reviewers and prevent self-review/bypass where the repository plan supports those protections. Store these as Environment secrets, not repository files or workflow literals:

- `NAMECHEAP_FTPS_HOST`
- `NAMECHEAP_FTPS_USERNAME`
- `NAMECHEAP_FTPS_PASSWORD`
- `NAMECHEAP_FTPS_PORT`
- `STRAVA_ADMIN_TOKEN`

Recommended account policy: use a dedicated FTPS account scoped to the smallest cPanel tree that can read/back up and write the two approved roots. Stage 1 needs read and write access; a future separate read-only credential can reduce dry-run privilege further.

Optional non-secret Environment variables:

- `NAMECHEAP_FTPS_BASE_PATH`: account-relative prefix only when the FTPS login root is not already the directory containing `public_html` and `goodwin-node-test`; leave empty otherwise.
- `PRODUCTION_BASE_URL`: defaults to `https://goodwingoodge.com`.
- `STRAVA_ADMIN_USER`: defaults to `strava`.

Do not put host credentials, tokens, cPanel filesystem absolutes, or server-private data into a manifest or YAML file.

All workflows declare only:

```yaml
permissions:
  contents: read
```

They use only official GitHub actions (`checkout`, `setup-node`, `upload-artifact`, and `download-artifact`), each pinned to a full commit SHA. No marketplace deployment action receives production credentials.

## Local validation

These commands require no production credentials and do not contact production:

```bash
npm ci
npm --prefix strava-app ci
npm run test:deploy
node scripts/deploy/validate-manifest.mjs --manifest deploy/manifests/examples/micro-static.json --type static --release micro --mode dry-run
node scripts/deploy/validate-manifest.mjs --manifest deploy/manifests/examples/standard-static.json --type static --release standard --mode dry-run
node scripts/deploy/validate-manifest.mjs --manifest deploy/manifests/examples/backend.json --type backend --release standard --mode dry-run
npm test
npm audit --audit-level=high
npm --prefix strava-app audit --audit-level=high
git diff --check
```

The tooling tests use a temporary local production adapter. Production commands cannot select that adapter unless the explicit test-only flag is also present, and real uploads additionally require the GitHub Actions, `production` Environment, and confirmation guards.

## Future stages (not implemented)

- Stage 2: pushes to `main` may build a deployment candidate, but production use still requires approval.
- Stage 3: validated Micro releases may become eligible for automatic deployment only after `main` passes all required checks.

Neither stage is enabled. Stage 1 contains only `workflow_dispatch` triggers.
