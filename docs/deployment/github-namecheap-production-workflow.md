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
- The production job references the `production` GitHub Environment and also requires the repository readiness variable `PRODUCTION_DEPLOYMENTS_ENABLED` to equal exactly `true`. It downloads that exact candidate, reads current files over FTPS, keeps permission-restricted rollback backups only in runner-local temporary storage, and either ends as a dry run or uploads exact files in deploy mode. The Environment reference is not itself proof that required reviewers have been configured.

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
      "contentType": "text",
      "expectedSha256": "optional-approved-new-source-lowercase-64-character-sha256",
      "expectedRemoteSha256": "required-hash-when-the-destination-currently-exists"
    }
  ],
  "validation": {
    "targetedTests": ["tests/footer.test.mjs"],
    "browserRoutes": ["/the-run/"],
    "apiChecks": []
  }
}
```

`source` and `destination` are independent and both must be explicit. `expectedSha256` is the approved hash of the **new/source** content; validation compares it with the validated workspace source and packaged release. `expectedRemoteSha256` is the separately approved hash of an **existing remote destination** before any upload. These fields are not interchangeable.

Backend manifests additionally require `expectedReleaseGeneration`, the exact 64-character lowercase SHA-256 that the existing `/strava/admin/runtime-status` endpoint must report after the manual Passenger restart. It is a runtime-content generation, not the 40-character Git `sourceCommit`; both values are retained separately in release metadata.

Every file, ordinary or protected, must declare exactly one mutually exclusive prior state:

- `expectedRemoteSha256`: the destination must exist and have this exact SHA-256; or
- `expectedRemoteAbsent: true`: the destination must not exist.

Omitting both, supplying both, or setting `expectedRemoteAbsent` to anything other than `true` fails closed. Every destination is checked during the all-file preflight and again immediately before its upload. For an expected-absent FTPS destination, a failed download is not treated as absence: the parent directory must be listed successfully and the exact filename must be absent. A permission error, unreadable listed file, or ambiguous listing fails closed. A newly appearing file is never overwritten.

`contentType` may be `text` or `binary-asset`. Text is the default and is streamed through the fail-closed secret scanner regardless of size; NUL bytes do not cause a text source to be skipped. A binary asset must be explicitly classified, use a strict approved image/font extension and matching file signature, and supply `expectedSha256`. Executables, archives, databases, ambiguous binary data, and invalid UTF-8 text are rejected. Static entries also require an exact `publicPath`; backend entries omit it.

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

Never copy one hash into the other merely to satisfy validation. The standard static example contains an all-zero remote placeholder for its protected map entry, so it fails safely against a real server until an independently observed and approved current remote hash replaces it. Example entries marked `expectedRemoteAbsent` likewise fail if the destination exists, and example manifests cannot enter deploy mode.

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

The map asset can be a Micro release only when its exact destination is explicitly approved. `.htaccess` is a protected infrastructure file and is required to use a Major release. Every protected entry also requires `expectedSha256` for the approved new source plus exactly one approved prior-state declaration (`expectedRemoteSha256` for an existing file or `expectedRemoteAbsent: true` for a genuinely new path); omission fails closed.

Every backend file is treated as protected because filename-based classification cannot reliably distinguish application logic from architecture, authentication, configuration, or data behavior. Every backend manifest therefore requires a Major release, an exact `protectedPathsApproved` entry and approved new/source hash for each destination, and an exact approved runtime-generation SHA-256. `.env`, credential, secret, and private-key destinations are never allowed.

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
6. Confirm repository setup is complete and `PRODUCTION_DEPLOYMENTS_ENABLED` is exactly `true`.
7. Approve the `production` Environment gate if required. The dry run needs protected FTPS credentials to read current production files, but it never uploads.
8. Review the job summary and download the non-sensitive `*-production-plan-*` artifact.

The dry run validates and tests locally, calculates new/source hashes, downloads every current destination only into permission-restricted runner-local temporary storage, records expected and observed old hashes, reports new/changed/unchanged files and byte deltas, and writes a metadata-only `rollback-manifest.json`. Raw remote content never enters an Actions artifact. Every declared remote precondition must match; a missing, unexpected, or mismatched destination fails before upload is possible. Dry run invokes no upload operation and makes no production change.

## Real static deployment procedure

1. Copy the dry-run manifest from `deploy/manifests/examples/` to a reviewed file under `deploy/manifests/releases/`. Replace every example prior state with either an independently approved existing remote `expectedRemoteSha256` or `expectedRemoteAbsent: true`. For each protected file, also supply an approved new/source `expectedSha256`.
2. Review a fresh dry-run artifact and confirm every source, destination, public URL, old expected/observed hash, new expected hash, and protected approval.
3. Re-run **Deploy static production** against the same approved commit and manifest with mode `deploy`.
4. Approve the protected `production` Environment deployment.
5. Confirm the workflow completes per-file upload verification and HTTP/browser/API validation.
6. Retain the plan artifact until the release is accepted.

The deliberate `workflow_dispatch`, readiness-variable guard, non-example manifest, exact checked-out commit, release/input match, and separately configured GitHub Environment protection form the deploy confirmation boundary. There is no push trigger.

## Backend upload and manual Passenger restart gate

Run the backend workflow in dry-run mode first and review its artifact. In deploy mode it uploads and hash-verifies backend files but does not attempt a cPanel restart or claim the new code is active.

After a successful backend upload, the workflow emits:

> ACTION REQUIRED: Open cPanel → Setup Node.js App → Stop goodwingoodge.com/strava → wait for Stopped → Start → wait for Started.

Then run **Verify backend production** with:

- the full 40-character commit SHA used by the upload;
- the identical backend manifest path; and
- the identical release level.

The verification workflow checks out that immutable commit, reconstructs its release from an isolated validated workspace, compares its packaged file hashes with production, and then requires the runtime `releaseGeneration` to equal the separate 64-character `expectedReleaseGeneration` pinned in the manifest. A missing, malformed, stale, or commit-shaped 40-character generation fails.

`restart.txt`, FTP overwrite of `restart.txt`, and cPanel **Restart** alone are prohibited because they do not guarantee that Passenger reloads modules. Browser automation against cPanel is also out of scope. Supported cPanel/Namecheap restart automation can be considered only after an authenticated vendor API is explicitly proven.

## FTPS transfer and 451 mitigation

The repository-owned Node scripts invoke native `curl` in explicit FTPS mode (`ssl-reqd`, TLS 1.2 minimum). Credentials are written only to a permission-restricted temporary curl configuration, are never placed in YAML or command arguments, and are deleted after each call.

Transfers are sequential and per-file. Before any upload, deploy mode re-downloads every destination and verifies its exact declared prior state, including absence. It repeats that check immediately before each affected upload. Existing destinations also require an intact runner-local rollback backup matching the expected remote hash. Each changed file is uploaded separately, downloaded to a temporary non-artifact path, and checked against the approved new/source SHA-256 before the next file begins. Curl uses bounded retries and `singlecwd`; this small-batch behavior mitigates the Namecheap FTPS 451 behavior seen during larger transfers. There is no delete, mirror, recursive copy, or directory-sync operation.

The URL scheme inside the curl implementation is `ftp://` because curl uses that scheme for explicit FTPS negotiation; `ssl-reqd` makes an unencrypted session a hard failure. Plain FTP is never permitted.

## Backup and rollback

Before any upload, every manifest destination is observed. Existing files are downloaded to a mode-`0700` runner-local directory, and individual backups are mode `0600`. The production plan artifact contains only:

- `deployment-plan.json` with source, destination, status, old expected/observed SHA-256, new expected SHA-256, sizes, and deltas;
- `rollback-manifest.json` with the required action for every destination; and
- deploy-mode upload/verification results with old expected, old observed, new expected, and new observed SHA-256 values when applicable.

No raw downloaded production content is uploaded as an artifact. Existing files have a runner-local restore instruction available only during that workflow job. Files newly introduced by a release have a manual-removal instruction; Stage 1 deliberately has no remote deletion operation. Unchanged files are neither uploaded nor restored.

Stage 1 does not provide persistent raw backups after runner teardown. The runner-local backups preserve enough exact content and hashes for an explicitly authorized rollback implementation during the same job, but this workflow does not automatically perform rollback. When the job finishes, an `always()` cleanup step deletes backups and FTPS credential temporary directories. Removing a newly created file remains a manual, separately authorized cPanel/FTPS action because automated deletion is prohibited.

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

The expected and observed release generations are recorded in the non-sensitive verification result. HTTP verification follows redirects manually and rejects any redirect that leaves the configured production origin. Only approved field names and generation hashes are written to logs; credential/header values and raw response bodies are never logged.

## GitHub Environment and credentials

The workflow reference `environment: production` does not prove that approval protection exists. Production remains fail-closed through a separate repository variable: credentialed production jobs proceed only when `PRODUCTION_DEPLOYMENTS_ENABLED` equals exactly `true`; a missing, empty, differently cased, or otherwise incorrect value fails the first job step.

Configure production in this exact order:

1. Merge the independently reviewed tooling.
2. Create the GitHub Environment named `production`.
3. Configure required reviewers and prevent self-review or bypass where the repository plan supports those protections.
4. Add environment-scoped secrets.
5. Independently verify the Environment protections without accessing production.
6. Only then create the repository variable `PRODUCTION_DEPLOYMENTS_ENABLED` with the exact value `true`.

The readiness variable is a fail-closed commissioning switch; it does not replace required reviewers. Store these as Environment secrets, not repository files or workflow literals:

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

Production secrets are scoped only to the comparison, upload, or verification step that needs them. Checkout, dependency installation, validation, build, artifact, readiness-guard, and cleanup steps do not receive FTPS or authenticated-health-check credentials.

Do not put host credentials, tokens, cPanel filesystem absolutes, or server-private data into a manifest or YAML file.

All workflows declare only:

```yaml
permissions:
  contents: read
```

They use only official GitHub actions (`checkout`, `setup-node`, `upload-artifact`, and `download-artifact`), each pinned to a full commit SHA. No action step receives production credentials; only repository-owned Node command steps receive the minimum secrets they need.

## Isolated build validation

Standard and Major validation copy the selected checkout into a fresh runner-temporary workspace and run the site/cPanel build there. A complete before/after inventory detects both modified existing outputs and newly generated files. Changes are permitted only under the explicit `dist/` build-output location; any creation, modification, or deletion elsewhere fails validation. The original checkout must remain completely clean, including untracked files.

The validated workspace records the complete `dist/` output inventory plus the hash and size of every manifest source. Release construction reads sources from that same workspace, verifies them against the inventory, scans every packaged source without skips, and embeds the inventory hash and metadata file in the immutable candidate. It therefore cannot silently package stale committed `dist` content.

## Residual limitations

- FTPS does not provide an atomic compare-and-swap primitive. There is a narrow unavoidable interval between the immediate prior-state verification and the subsequent upload. Post-upload hashing detects a wrong result but cannot make the operation atomic.
- Secret scanning is deterministic and scans every byte of every candidate source, but it uses credential signatures and assignment/header patterns rather than an external secret-validity service. Reviewers must still inspect release content; unknown secret formats remain a residual risk.
- Lexical allowlists and URL-segment encoding prevent client-side traversal, but cannot prove whether the remote server resolves an allowed destination through a server-side symlink.
- Credential files and backups are removed in `finally` blocks and workflow `always()` cleanup steps. Abrupt host termination can prevent cleanup; GitHub-hosted runners are ephemeral, but this is not a substitute for persistent cleanup guarantees.
- Raw rollback backups are deliberately not persisted in artifacts. Once the runner job ends, Stage 1 has only metadata and hashes, not the prior contents.
- For an `expectedRemoteAbsent` upload, Stage 1 has no automated delete operation. Rolling back that newly created destination requires a separately authorized manual removal.

## Local validation

These commands require no production credentials and do not contact production:

```bash
npm ci
npm --prefix strava-app ci
npm run test:deploy
node scripts/deploy/validate-manifest.mjs --manifest deploy/manifests/examples/micro-static.json --type static --release micro --mode dry-run
node scripts/deploy/validate-manifest.mjs --manifest deploy/manifests/examples/standard-static.json --type static --release standard --mode dry-run
node scripts/deploy/validate-manifest.mjs --manifest deploy/manifests/examples/backend.json --type backend --release major --mode dry-run
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
