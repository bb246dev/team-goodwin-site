import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { buildRelease } from "../scripts/deploy/build-release.mjs";
import { compareProduction } from "../scripts/deploy/compare-production.mjs";
import { createLocalProductionClient, rejectAmbiguousFtpsAbsence } from "../scripts/deploy/ftps-client.mjs";
import { rollbackCompletedRelease, uploadRelease } from "../scripts/deploy/ftps-upload.mjs";
import { resolveManifestInput, sha256, validateManifestObject, validationCommandsForRelease } from "../scripts/deploy/lib.mjs";
import { scanManifestSources, secretFindings } from "../scripts/deploy/scan-secrets.mjs";
import { sameOriginRedirect, validateRuntimePayload } from "../scripts/deploy/verify-production.mjs";
import { createValidatedWorkspace } from "../scripts/deploy/run-validation.mjs";

const PROTECTED_SOURCE_CONTENT = "export const map = true;\n";
const PROTECTED_REMOTE_CONTENT = "old protected map\n";
const TEST_COMMIT = "1".repeat(40);
const TEST_RUNTIME_GENERATION = "2".repeat(64);

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "goodwin-deploy-test-"));
  await mkdir(join(root, "assets"));
  await mkdir(join(root, "tests"));
  await writeFile(join(root, "assets", "site.css"), "body { color: #fff; }\n");
  await writeFile(join(root, "assets", "strava-race-map.mjs"), PROTECTED_SOURCE_CONTENT);
  await writeFile(join(root, "tests", "site.test.mjs"), "// fixture\n");
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(root, { recursive: true, force: true });
  });
  return root;
}

function validManifest(overrides = {}) {
  return {
    schemaVersion: 1,
    deploymentType: "static",
    releaseType: "micro",
    description: "Test manifest",
    protectedPathsApproved: [],
    files: [{ source: "assets/site.css", destination: "public_html/assets/site.css", publicPath: "/assets/site.css", expectedRemoteAbsent: true }],
    validation: { targetedTests: ["tests/site.test.mjs"], browserRoutes: ["/"], apiChecks: [] },
    ...overrides,
  };
}

function protectedManifest(fileOverrides = {}, manifestOverrides = {}) {
  const destination = "public_html/assets/strava-race-map.mjs";
  return validManifest({
    protectedPathsApproved: [destination],
    files: [{
      source: "assets/strava-race-map.mjs",
      destination,
      publicPath: "/assets/strava-race-map.mjs",
      expectedSha256: sha256(PROTECTED_SOURCE_CONTENT),
      expectedRemoteSha256: sha256(PROTECTED_REMOTE_CONTENT),
      ...fileOverrides,
    }],
    ...manifestOverrides,
  });
}

async function writeManifest(root, manifest) {
  const path = join(root, `manifest-${Math.random().toString(16).slice(2)}.json`);
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
  return path;
}

async function buildTestRelease(root, manifestPath, releaseDirectory, expectedType = "static", expectedRelease = "micro", expectedReleaseGeneration) {
  const manifest = await validateManifestObject(JSON.parse(await readFile(manifestPath, "utf8")), { root, expectedType, expectedRelease });
  const inventoryPath = join(root, `inventory-${Math.random().toString(16).slice(2)}.json`);
  await writeFile(inventoryPath, `${JSON.stringify({
    schemaVersion: 1,
    allowedBuildOutputLocations: ["dist"],
    changedFiles: [],
    outputFiles: {},
    sources: Object.fromEntries(manifest.files.map((file) => [file.source, { sha256: file.newSha256, size: file.size }])),
  }, null, 2)}\n`);
  return buildRelease({ manifestPath, outputDirectory: releaseDirectory, root, expectedType, expectedRelease, releaseCommit: TEST_COMMIT, expectedReleaseGeneration, validatedInventoryPath: inventoryPath });
}

test("valid manifest is accepted and hashes its source", async (t) => {
  const root = await fixture(t);
  const manifest = await validateManifestObject(validManifest(), { root });
  assert.equal(manifest.files[0].newSha256, sha256("body { color: #fff; }\n"));
  assert.equal(manifest.files[0].size, 22);
});

test("invalid destination outside the allowlist fails closed", async (t) => {
  const root = await fixture(t);
  const manifest = validManifest({
    files: [{ source: "assets/site.css", destination: "public_html/private/config.php", publicPath: "/private/config.php" }],
  });
  await assert.rejects(validateManifestObject(manifest, { root }), /outside the allowlist/);
});

test("source and destination traversal attempts are rejected", async (t) => {
  const root = await fixture(t);
  await assert.rejects(validateManifestObject(validManifest({
    files: [{ source: "../site.css", destination: "public_html/assets/site.css", publicPath: "/assets/site.css" }],
  }), { root }), /(?:forbidden characters|safe path)/);
  await assert.rejects(validateManifestObject(validManifest({
    files: [{ source: "assets/site.css", destination: "public_html/assets/../site.css", publicPath: "/assets/site.css" }],
  }), { root }), /(?:forbidden characters|safe path)/);
});

test("protected files require an exact manifest approval", async (t) => {
  const root = await fixture(t);
  const protectedFile = {
    source: "assets/strava-race-map.mjs",
    destination: "public_html/assets/strava-race-map.mjs",
    publicPath: "/assets/strava-race-map.mjs",
  };
  await assert.rejects(validateManifestObject(validManifest({ files: [protectedFile] }), { root }), /Protected destination/);
  const accepted = await validateManifestObject(validManifest({
    protectedPathsApproved: [protectedFile.destination],
    files: [{
      ...protectedFile,
      expectedSha256: sha256(PROTECTED_SOURCE_CONTENT),
      expectedRemoteSha256: sha256(PROTECTED_REMOTE_CONTENT),
    }],
  }), { root });
  assert.deepEqual(accepted.protectedPathsApproved, [protectedFile.destination]);
});

test("every file requires exactly one prior state and rejects both", async (t) => {
  const root = await fixture(t);
  const manifest = protectedManifest({ expectedRemoteSha256: undefined });
  await assert.rejects(validateManifestObject(manifest, { root }), /exactly one prior state/);
  await assert.rejects(validateManifestObject(protectedManifest({ expectedRemoteAbsent: true }), { root }), /exactly one prior state/);
});

test("approved new/source hash must match the local source", async (t) => {
  const root = await fixture(t);
  const manifest = protectedManifest({ expectedSha256: "0".repeat(64) });
  await assert.rejects(validateManifestObject(manifest, { root }), /Approved new\/source hash does not match expectedSha256/);
});

test("duplicate destinations are rejected", async (t) => {
  const root = await fixture(t);
  const file = validManifest().files[0];
  await assert.rejects(validateManifestObject(validManifest({ files: [file, { ...file }] }), { root }), /Duplicate destination/);
});

test("missing source is rejected", async (t) => {
  const root = await fixture(t);
  await assert.rejects(validateManifestObject(validManifest({
    files: [{ source: "assets/missing.css", destination: "public_html/assets/missing.css", publicPath: "/assets/missing.css", expectedRemoteAbsent: true }],
  }), { root }), /existing regular file/);
});

test("secret detection catches definite credentials but permits explicit examples", () => {
  assert.deepEqual(secretFindings("const admin_token = 'real-production-value-1234567890';"), ["credential assignment"]);
  assert.deepEqual(secretFindings("const admin_token = 'test-only-placeholder-token';"), []);
  for (const source of [
    "HAPN_API_KEY = 'prod-hapn-value-1234567890'",
    "SESSION_SECRET = 'prod-session-value-1234567890'",
    "token = 'prod-token-value-1234567890'",
    "{\"api_key\":\"prod-abcdefghijklmnopqrstuv\"}",
    "API_KEY=prod-abcdefghijklmnopqrstuv",
    "const SESSION_SECRET = `prod-abcdefghijklmnopqrstuv`;",
    "API_KEY='prod-latest-secret-real-value-123456'",
    "API_KEY='contest-production-abcdefghijklmnop'",
  ]) assert.deepEqual(secretFindings(source), ["credential assignment"]);
  assert.deepEqual(secretFindings("Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456"), ["authorization credential"]);
  assert.deepEqual(secretFindings("{\"Authorization\":\"Bearer abcdefghijklmnopqrstuvwxyz123456\"}"), ["authorization credential"]);
  assert.deepEqual(secretFindings('const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";'), []);
  assert.deepEqual(secretFindings("const password = requiredSecret(env, 'DATABASE_PASSWORD'); const token = randomSecret();"), []);
});

test("FTPS never infers absence from a failed download or directory listing", () => {
  assert.throws(() => rejectAmbiguousFtpsAbsence("public_html/.htaccess"), /cannot prove destination absence unambiguously/);
});

test("redirect validation permits only the requested production origin", () => {
  assert.equal(sameOriginRedirect("https://goodwingoodge.com/start", "/next").href, "https://goodwingoodge.com/next");
  assert.throws(() => sameOriginRedirect("https://goodwingoodge.com/start", "https://example.com/"), /escaped production origin/);
});

test("all backend files are protected Major releases with an approved runtime generation", async (t) => {
  const root = await fixture(t);
  await mkdir(join(root, "strava-app", "lib"), { recursive: true });
  await writeFile(join(root, "strava-app", "lib", "routes.mjs"), "export const routes = [];\n");
  const file = {
    source: "strava-app/lib/routes.mjs",
    destination: "goodwin-node-test/lib/routes.mjs",
    expectedSha256: sha256("export const routes = [];\n"),
    expectedRemoteAbsent: true,
  };
  const base = validManifest({
    deploymentType: "backend", releaseType: "major", previousReleaseGeneration: "1".repeat(64),
    protectedPathsApproved: [file.destination], files: [file],
    validation: { targetedTests: ["tests/site.test.mjs"], browserRoutes: [], apiChecks: [{ name: "Health", path: "/strava/health", expectedStatus: 200, requiredJsonFields: [] }] },
  });
  assert.equal((await validateManifestObject(base, { root })).files.length, 1);
  const manifestPath = await writeManifest(root, base);
  const release = await buildTestRelease(root, manifestPath, join(root, "backend-release"), "backend", "major", TEST_RUNTIME_GENERATION);
  assert.equal(release.sourceCommit, TEST_COMMIT);
  assert.equal(release.expectedReleaseGeneration, TEST_RUNTIME_GENERATION);
  await assert.rejects(validateManifestObject({ ...base, releaseType: "micro" }, { root }), /Every backend deployment requires a major release/);
  assert.equal(release.previousReleaseGeneration, "1".repeat(64));
  const productionRoot = join(root, "backend-production");
  await mkdir(productionRoot);
  let checkedBaseline = null;
  await compareProduction({
    releasePath: join(root, "backend-release", "release.json"), outputDirectory: join(root, "backend-plan"), backupDirectory: join(root, "backend-backups"),
    client: createLocalProductionClient(productionRoot, true), runtimeBaselineVerifier: async (expected) => { checkedBaseline = expected; },
  });
  assert.equal(checkedBaseline, "1".repeat(64));
  await assert.rejects(compareProduction({
    releasePath: join(root, "backend-release", "release.json"), outputDirectory: join(root, "backend-plan-no-baseline"), backupDirectory: join(root, "backend-backups-no-baseline"),
    client: createLocalProductionClient(productionRoot, true),
  }), /requires authenticated runtime baseline verification/);
  await assert.rejects(validateManifestObject({ ...base, previousReleaseGeneration: undefined }, { root }), /previousReleaseGeneration/);
  await assert.rejects(validateManifestObject({ ...base, protectedPathsApproved: [] }, { root }), /Protected destination/);
});

test(".htaccess is protected and cannot use a Micro release", async (t) => {
  const root = await fixture(t);
  await mkdir(join(root, "deploy", "static"), { recursive: true });
  await writeFile(join(root, "deploy", "static", "reviewed.htaccess"), "RewriteEngine On\n");
  const manifest = validManifest({
    protectedPathsApproved: ["public_html/.htaccess"],
    files: [{ source: "deploy/static/reviewed.htaccess", destination: "public_html/.htaccess", publicPath: "/", expectedSha256: sha256("RewriteEngine On\n"), expectedRemoteAbsent: true }],
  });
  await assert.rejects(validateManifestObject(manifest, { root }), /requires a major release/);
});

async function preparedRelease(t) {
  const root = await fixture(t);
  const manifestPath = await writeManifest(root, validManifest({
    files: [{
      source: "assets/site.css",
      destination: "public_html/assets/site.css",
      publicPath: "/assets/site.css",
      expectedRemoteSha256: sha256("old css\n"),
    }],
  }));
  const releaseDirectory = join(root, "release");
  const release = await buildTestRelease(root, manifestPath, releaseDirectory);
  const productionRoot = join(root, "production");
  await mkdir(join(productionRoot, "public_html", "assets"), { recursive: true });
  await writeFile(join(productionRoot, "public_html", "assets", "site.css"), "old css\n");
  return { root, release, releaseDirectory, productionRoot };
}

async function preparedProtectedRelease(t, manifest = protectedManifest()) {
  const root = await fixture(t);
  const manifestPath = await writeManifest(root, manifest);
  const releaseDirectory = join(root, "release");
  const release = await buildTestRelease(root, manifestPath, releaseDirectory);
  const productionRoot = join(root, "production");
  await mkdir(join(productionRoot, "public_html", "assets"), { recursive: true });
  await writeFile(join(productionRoot, "public_html", "assets", "strava-race-map.mjs"), PROTECTED_REMOTE_CONTENT);
  return { root, release, releaseDirectory, productionRoot };
}

test("dry-run compares production and uploads nothing", async (t) => {
  const prepared = await preparedRelease(t);
  const client = createLocalProductionClient(prepared.productionRoot, true);
  const outputDirectory = join(prepared.root, "plan-dry");
  const { plan } = await compareProduction({
    releasePath: join(prepared.releaseDirectory, "release.json"), outputDirectory, backupDirectory: join(prepared.root, "backups-dry"), mode: "dry-run", client,
  });
  assert.equal(plan.mode, "dry-run");
  assert.equal(plan.summary.changed, 1);
  assert.equal(await readFile(join(prepared.productionRoot, "public_html", "assets", "site.css"), "utf8"), "old css\n");
});

test("deployment plan records hashes, destinations, and size comparison", async (t) => {
  const prepared = await preparedRelease(t);
  const outputDirectory = join(prepared.root, "plan-details");
  const { plan } = await compareProduction({
    releasePath: join(prepared.releaseDirectory, "release.json"), outputDirectory, mode: "deploy",
    backupDirectory: join(prepared.root, "backups-details"),
    client: createLocalProductionClient(prepared.productionRoot, true),
  });
  assert.equal(plan.files[0].destination, "public_html/assets/site.css");
  assert.equal(plan.files[0].oldExpectedSha256, sha256("old css\n"));
  assert.match(plan.files[0].oldObservedSha256, /^[a-f0-9]{64}$/);
  assert.equal(plan.files[0].newExpectedSha256, prepared.release.files[0].newSha256);
  assert.equal(plan.files[0].newObservedSha256, null);
  assert.equal(typeof plan.files[0].sizeDelta, "number");
});

test("rollback manifest preserves existing file and both hashes", async (t) => {
  const prepared = await preparedRelease(t);
  const outputDirectory = join(prepared.root, "plan-rollback");
  const { rollback } = await compareProduction({
    releasePath: join(prepared.releaseDirectory, "release.json"), outputDirectory, mode: "dry-run",
    backupDirectory: join(prepared.root, "backups-rollback"),
    client: createLocalProductionClient(prepared.productionRoot, true),
  });
  assert.equal(rollback.files[0].rollbackAction, "restore-runner-local-backup-during-this-job");
  assert.equal(rollback.files[0].oldExpectedSha256, sha256("old css\n"));
  assert.match(rollback.files[0].oldObservedSha256, /^[a-f0-9]{64}$/);
  assert.equal(rollback.files[0].newExpectedSha256, prepared.release.files[0].newSha256);
  assert.equal(rollback.files[0].newObservedSha256, null);
  assert.equal(await readFile(join(prepared.root, "backups-rollback", rollback.files[0].backupId), "utf8"), "old css\n");
});

test("matching expected remote hash is accepted and recorded distinctly", async (t) => {
  const prepared = await preparedProtectedRelease(t);
  const outputDirectory = join(prepared.root, "plan-protected-match");
  const { plan } = await compareProduction({
    releasePath: join(prepared.releaseDirectory, "release.json"), outputDirectory, mode: "deploy",
    backupDirectory: join(prepared.root, "backups-protected-match"),
    client: createLocalProductionClient(prepared.productionRoot, true),
  });
  assert.equal(plan.files[0].oldExpectedSha256, sha256(PROTECTED_REMOTE_CONTENT));
  assert.equal(plan.files[0].oldObservedSha256, sha256(PROTECTED_REMOTE_CONTENT));
  assert.equal(plan.files[0].newExpectedSha256, sha256(PROTECTED_SOURCE_CONTENT));
  assert.equal(plan.files[0].newObservedSha256, null);
});

test("mismatched expected remote hash aborts comparison before upload", async (t) => {
  const prepared = await preparedProtectedRelease(t, protectedManifest({ expectedRemoteSha256: sha256("different remote\n") }));
  const original = await readFile(join(prepared.productionRoot, "public_html", "assets", "strava-race-map.mjs"), "utf8");
  await assert.rejects(compareProduction({
    releasePath: join(prepared.releaseDirectory, "release.json"),
    outputDirectory: join(prepared.root, "plan-protected-mismatch"),
    backupDirectory: join(prepared.root, "backups-protected-mismatch"),
    mode: "deploy",
    client: createLocalProductionClient(prepared.productionRoot, true),
  }), /Existing remote hash mismatch/);
  assert.equal(await readFile(join(prepared.productionRoot, "public_html", "assets", "strava-race-map.mjs"), "utf8"), original);
});

test("rollback backup preserves the exact protected remote original", async (t) => {
  const prepared = await preparedProtectedRelease(t);
  const outputDirectory = join(prepared.root, "plan-protected-backup");
  const { rollback } = await compareProduction({
    releasePath: join(prepared.releaseDirectory, "release.json"), outputDirectory, mode: "dry-run",
    backupDirectory: join(prepared.root, "backups-protected"),
    client: createLocalProductionClient(prepared.productionRoot, true),
  });
  assert.equal(rollback.files[0].oldExpectedSha256, sha256(PROTECTED_REMOTE_CONTENT));
  assert.equal(rollback.files[0].oldObservedSha256, sha256(PROTECTED_REMOTE_CONTENT));
  assert.equal(await readFile(join(prepared.root, "backups-protected", rollback.files[0].backupId), "utf8"), PROTECTED_REMOTE_CONTENT);
});

test("local test adapter exercises per-file deployment and hash verification", async (t) => {
  const prepared = await preparedRelease(t);
  const client = createLocalProductionClient(prepared.productionRoot, true);
  const planDirectory = join(prepared.root, "plan-upload");
  const backupDirectory = join(prepared.root, "backups-upload");
  await compareProduction({ releasePath: join(prepared.releaseDirectory, "release.json"), outputDirectory: planDirectory, backupDirectory, mode: "deploy", client });
  const report = await uploadRelease({
    releasePath: join(prepared.releaseDirectory, "release.json"),
    planPath: join(planDirectory, "deployment-plan.json"),
    outputDirectory: join(prepared.root, "upload-results"),
    backupDirectory,
    client,
    productionConfirmation: true,
  });
  assert.equal(report.files[0].status, "uploaded-and-verified");
  assert.equal(report.files[0].newExpectedSha256, sha256("body { color: #fff; }\n"));
  assert.equal(report.files[0].newObservedSha256, sha256("body { color: #fff; }\n"));
  assert.equal(await readFile(join(prepared.productionRoot, "public_html", "assets", "site.css"), "utf8"), "body { color: #fff; }\n");
  assert.deepEqual((await readdir(join(prepared.root, "upload-results"))).sort(), ["deployment-results.json"]);
});

test("remote file changing after preflight aborts before the upload call", async (t) => {
  const prepared = await preparedProtectedRelease(t);
  const baseClient = createLocalProductionClient(prepared.productionRoot, true);
  const planDirectory = join(prepared.root, "plan-race");
  const backupDirectory = join(prepared.root, "backups-race");
  await compareProduction({
    releasePath: join(prepared.releaseDirectory, "release.json"), outputDirectory: planDirectory, backupDirectory, mode: "deploy", client: baseClient,
  });
  let downloads = 0;
  let uploads = 0;
  const racingClient = {
    async download(...args) {
      downloads += 1;
      if (downloads === 2) {
        await writeFile(join(prepared.productionRoot, "public_html", "assets", "strava-race-map.mjs"), "remote changed during deployment\n");
      }
      return baseClient.download(...args);
    },
    async upload(...args) {
      uploads += 1;
      return baseClient.upload(...args);
    },
  };
  await assert.rejects(uploadRelease({
    releasePath: join(prepared.releaseDirectory, "release.json"),
    planPath: join(planDirectory, "deployment-plan.json"),
    outputDirectory: join(prepared.root, "upload-race-results"),
    backupDirectory,
    client: racingClient,
    productionConfirmation: true,
  }), /Remote prior state changed before upload/);
  assert.equal(uploads, 0);
});

test("protected upload verifies the new hash and records all expected and observed hashes", async (t) => {
  const prepared = await preparedProtectedRelease(t);
  const client = createLocalProductionClient(prepared.productionRoot, true);
  const planDirectory = join(prepared.root, "plan-protected-upload");
  const backupDirectory = join(prepared.root, "backups-protected-upload");
  await compareProduction({
    releasePath: join(prepared.releaseDirectory, "release.json"), outputDirectory: planDirectory, backupDirectory, mode: "deploy", client,
  });
  const report = await uploadRelease({
    releasePath: join(prepared.releaseDirectory, "release.json"),
    planPath: join(planDirectory, "deployment-plan.json"),
    outputDirectory: join(prepared.root, "protected-upload-results"),
    backupDirectory,
    client,
    productionConfirmation: true,
  });
  assert.equal(report.completed, true);
  assert.deepEqual(report.files[0], {
    destination: "public_html/assets/strava-race-map.mjs",
    status: "uploaded-and-verified",
    oldExpectedSha256: sha256(PROTECTED_REMOTE_CONTENT),
    expectedRemoteAbsent: false,
    oldObservedSha256: sha256(PROTECTED_REMOTE_CONTENT),
    newExpectedSha256: sha256(PROTECTED_SOURCE_CONTENT),
    newObservedSha256: sha256(PROTECTED_SOURCE_CONTENT),
  });
  assert.equal(await readFile(join(prepared.productionRoot, "public_html", "assets", "strava-race-map.mjs"), "utf8"), PROTECTED_SOURCE_CONTENT);
  assert.equal(await readFile(join(backupDirectory, "0001-backup.bin"), "utf8"), PROTECTED_REMOTE_CONTENT);
  assert.deepEqual((await readdir(join(prepared.root, "protected-upload-results"))).sort(), ["deployment-results.json"]);
});

test("Micro, Standard, and Major select progressively stronger validation", () => {
  assert.deepEqual(validationCommandsForRelease("micro"), ["deployment-tooling-tests", "targeted-tests"]);
  assert.ok(validationCommandsForRelease("standard").includes("representative-regression"));
  assert.ok(validationCommandsForRelease("standard").includes("responsive-browser-and-api-verification"));
  assert.ok(validationCommandsForRelease("major").includes("dependency-security-audit"));
  assert.ok(validationCommandsForRelease("major").includes("full-production-acceptance"));
});

test("production workflows remain manual-only, serialized, least-privilege, and SHA-pinned", async () => {
  const workflowUrls = [
    new URL("../.github/workflows/deploy-static-production.yml", import.meta.url),
    new URL("../.github/workflows/deploy-backend-production.yml", import.meta.url),
    new URL("../.github/workflows/verify-backend-production.yml", import.meta.url),
  ];
  for (const url of workflowUrls) {
    const workflow = await readFile(url, "utf8");
    assert.match(workflow, /^  workflow_dispatch:/m);
    assert.doesNotMatch(workflow, /^  (?:push|pull_request):/m);
    assert.match(workflow, /permissions:\n  contents: read/);
    assert.match(workflow, /group: production-deployment\n  cancel-in-progress: false/);
    for (const match of workflow.matchAll(/uses:\s*([^\s]+)/g)) {
      assert.match(match[1], /^actions\/[a-z-]+@[a-f0-9]{40}$/, `unpinned or non-official action: ${match[1]}`);
    }
  }
  for (const url of workflowUrls.slice(0, 2)) {
    const workflow = await readFile(url, "utf8");
    assert.match(workflow, /default: dry-run/);
    assert.match(workflow, /environment: production/);
  }
});

test("expected-absent destination that appears before upload aborts without upload", async (t) => {
  const root = await fixture(t);
  const manifestPath = await writeManifest(root, validManifest());
  const releaseDirectory = join(root, "release-absent");
  await buildTestRelease(root, manifestPath, releaseDirectory);
  const productionRoot = join(root, "production-absent");
  await mkdir(join(productionRoot, "public_html", "assets"), { recursive: true });
  const client = createLocalProductionClient(productionRoot, true);
  const planDirectory = join(root, "plan-absent");
  const backupDirectory = join(root, "backups-absent");
  await compareProduction({ releasePath: join(releaseDirectory, "release.json"), outputDirectory: planDirectory, backupDirectory, mode: "deploy", client });
  await writeFile(join(productionRoot, "public_html", "assets", "site.css"), "created concurrently\n");
  let uploads = 0;
  const observingClient = { download: client.download, async upload(...args) { uploads += 1; return client.upload(...args); } };
  await assert.rejects(uploadRelease({
    releasePath: join(releaseDirectory, "release.json"), planPath: join(planDirectory, "deployment-plan.json"),
    outputDirectory: join(root, "results-absent"), backupDirectory, client: observingClient, productionConfirmation: true,
  }), /Remote prior-state mismatch before upload/);
  assert.equal(uploads, 0);
  assert.equal(await readFile(join(productionRoot, "public_html", "assets", "site.css"), "utf8"), "created concurrently\n");
});

test("raw backups remain permission-restricted and outside artifact metadata", async (t) => {
  const prepared = await preparedRelease(t);
  const outputDirectory = join(prepared.root, "metadata-only");
  const backupDirectory = join(prepared.root, "runner-local-backups");
  await compareProduction({
    releasePath: join(prepared.releaseDirectory, "release.json"), outputDirectory, backupDirectory, mode: "dry-run",
    client: createLocalProductionClient(prepared.productionRoot, true),
  });
  assert.deepEqual((await readdir(outputDirectory)).sort(), ["deployment-plan.json", "rollback-manifest.json"]);
  assert.equal((await stat(backupDirectory)).mode & 0o777, 0o700);
  assert.equal((await stat(join(backupDirectory, "0001-backup.bin"))).mode & 0o777, 0o600);
  assert.doesNotMatch(await readFile(join(outputDirectory, "rollback-manifest.json"), "utf8"), /old css/);
});

test("secret scanner handles large text and scans rather than skips NUL-containing text", async (t) => {
  const root = await fixture(t);
  await writeFile(join(root, "assets", "large.css"), `/* safe */\n${"a".repeat(5_500_000)}`);
  const large = await validateManifestObject(validManifest({ files: [{
    source: "assets/large.css", destination: "public_html/assets/large.css", publicPath: "/assets/large.css", expectedRemoteAbsent: true,
  }] }), { root });
  assert.equal((await scanManifestSources(large))[0].status, "scanned-text");
  await writeFile(join(root, "assets", "nul.css"), Buffer.from("a\0const admin_token = 'real-production-value-1234567890';"));
  const nul = await validateManifestObject(validManifest({ files: [{
    source: "assets/nul.css", destination: "public_html/assets/nul.css", publicPath: "/assets/nul.css", expectedRemoteAbsent: true,
  }] }), { root });
  await assert.rejects(scanManifestSources(nul), /credential assignment/);
});

test("only explicitly classified, hash-pinned safe binary assets are accepted", async (t) => {
  const root = await fixture(t);
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.from("safe-image")]);
  await writeFile(join(root, "assets", "safe.png"), png);
  const approved = await validateManifestObject(validManifest({ files: [{
    source: "assets/safe.png", destination: "public_html/assets/safe.png", publicPath: "/assets/safe.png",
    contentType: "binary-asset", expectedSha256: sha256(png), expectedRemoteAbsent: true,
  }] }), { root });
  assert.equal((await scanManifestSources(approved))[0].status, "approved-binary-asset");

  for (const [name, content, classification, message] of [
    ["disguised.png", Buffer.from("MZ executable"), "binary-asset", /signature/],
    ["archive.zip", Buffer.from("PK\\x03\\x04archive"), "binary-asset", /type is not permitted/],
    ["unclassified.png", png, undefined, /require explicit contentType binary-asset/],
  ]) {
    await writeFile(join(root, "assets", name), content);
    const candidate = await validateManifestObject(validManifest({ files: [{
      source: `assets/${name}`, destination: `public_html/assets/${name}`, publicPath: `/assets/${name}`,
      ...(classification ? { contentType: classification, expectedSha256: sha256(content) } : {}), expectedRemoteAbsent: true,
    }] }), { root });
    await assert.rejects(scanManifestSources(candidate), message);
  }
});

function runtimePayload(releaseGeneration = TEST_RUNTIME_GENERATION) {
  return {
    releaseGeneration,
    pid: 123,
    processStartedAt: "2026-09-10T12:00:00.000Z",
    processUptimeSeconds: 10,
    raceWindowStart: "2026-09-10T12:00:00.000Z",
    raceWindowEnd: "2026-09-11T12:00:00.000Z",
    raceWindowModuleVersion: "1",
  };
}

test("runtime generation requires an exact approved SHA-256 independent of the Git commit", () => {
  const previous = "1".repeat(64);
  assert.equal(validateRuntimePayload(runtimePayload(), TEST_RUNTIME_GENERATION, previous).releaseGeneration, TEST_RUNTIME_GENERATION);
  assert.throws(() => validateRuntimePayload(runtimePayload("3".repeat(64)), TEST_RUNTIME_GENERATION, previous), /stale/);
  const missing = runtimePayload(); delete missing.releaseGeneration;
  assert.throws(() => validateRuntimePayload(missing, TEST_RUNTIME_GENERATION, previous), /missing approved field/);
  assert.throws(() => validateRuntimePayload(runtimePayload("malformed"), TEST_RUNTIME_GENERATION, previous), /invalid/);
  assert.throws(() => validateRuntimePayload(runtimePayload(), TEST_RUNTIME_GENERATION, TEST_RUNTIME_GENERATION), /must differ/);
});

test("release metadata uses explicit commit and ignores reserved GITHUB_SHA", async (t) => {
  const root = await fixture(t);
  const manifestPath = await writeManifest(root, validManifest());
  const previous = process.env.GITHUB_SHA;
  process.env.GITHUB_SHA = "f".repeat(40);
  try {
    const release = await buildTestRelease(root, manifestPath, join(root, "explicit-release"));
    assert.equal(release.sourceCommit, TEST_COMMIT);
  } finally {
    if (previous === undefined) delete process.env.GITHUB_SHA; else process.env.GITHUB_SHA = previous;
  }
});

test("isolated build accepts sixteen tracked-output changes plus new output and records hashes", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "goodwin-build-regression-"));
  t.after(async () => { const { rm } = await import("node:fs/promises"); await rm(root, { recursive: true, force: true }); });
  await mkdir(join(root, "dist"));
  await mkdir(join(root, "tests"));
  await mkdir(join(root, "deploy", "manifests"), { recursive: true });
  for (let index = 0; index < 16; index += 1) await writeFile(join(root, "dist", `tracked-${index}.html`), `before-${index}\n`);
  await writeFile(join(root, "tests", "site.test.mjs"), "// fixture\n");
  await writeFile(join(root, "build.mjs"), `import { writeFileSync } from "node:fs";\nfor (let i=0;i<16;i++) writeFileSync(\`dist/tracked-\${i}.html\`, \`after-\${i}\\n\`);\nwriteFileSync("dist/new-output.css", "new\\n");\n`);
  await writeFile(join(root, "package.json"), JSON.stringify({ scripts: { build: "node build.mjs" } }));
  const manifest = validManifest({
    releaseType: "standard",
    files: [{ source: "dist/tracked-0.html", destination: "public_html/tracked-0.html", publicPath: "/tracked-0/", expectedRemoteAbsent: true }],
    validation: {
      targetedTests: ["tests/site.test.mjs"], browserRoutes: ["/", "/live-tracking/"],
      apiChecks: ["/strava/health", "/strava/public/race-status", "/strava/public/tracking-status"].map((path, index) => ({ name: `API check ${index + 1}`, path, expectedStatus: 200, requiredJsonFields: [] })),
    },
  });
  const manifestPath = join(root, "deploy", "manifests", "regression.json");
  await writeFile(manifestPath, JSON.stringify(manifest));
  const workspace = `${root}-workspace`;
  const inventoryPath = join(root, "inventory.json");
  const result = await createValidatedWorkspace({ root, workspace, inventoryPath, manifestPath, releaseType: "standard" });
  assert.equal(result.changedFiles.length, 17);
  assert.equal(result.changedFiles.filter((path) => /^dist\/tracked-/.test(path)).length, 16);
  assert.match(result.outputFiles["dist/tracked-0.html"].sha256, /^[a-f0-9]{64}$/);
  await writeFile(join(root, "build.mjs"), `import { writeFileSync } from "node:fs";\nwriteFileSync("dist/tracked-0.html", "changed\\n");\nwriteFileSync("unexpected.txt", "outside output\\n");\n`);
  await assert.rejects(createValidatedWorkspace({
    root, workspace: `${root}-forbidden-workspace`, inventoryPath: join(root, "forbidden-inventory.json"), manifestPath, releaseType: "standard",
  }), /outside allowed output locations.*unexpected\.txt/);
  const { rm } = await import("node:fs/promises");
  await rm(workspace, { recursive: true, force: true });
  await rm(`${root}-forbidden-workspace`, { recursive: true, force: true });
});

test("corrupt runner-local rollback backup aborts before upload", async (t) => {
  const prepared = await preparedRelease(t);
  const client = createLocalProductionClient(prepared.productionRoot, true);
  const planDirectory = join(prepared.root, "plan-corrupt-backup");
  const backupDirectory = join(prepared.root, "backups-corrupt");
  await compareProduction({ releasePath: join(prepared.releaseDirectory, "release.json"), outputDirectory: planDirectory, backupDirectory, mode: "deploy", client });
  await writeFile(join(backupDirectory, "0001-backup.bin"), "corrupt\n");
  let uploads = 0;
  await assert.rejects(uploadRelease({
    releasePath: join(prepared.releaseDirectory, "release.json"), planPath: join(planDirectory, "deployment-plan.json"),
    outputDirectory: join(prepared.root, "results-corrupt"), backupDirectory,
    client: { download: client.download, async upload(...args) { uploads += 1; return client.upload(...args); } }, productionConfirmation: true,
  }), /rollback backup is missing or corrupt/);
  assert.equal(uploads, 0);
});

test("an unverified upload outcome is never overwritten automatically", async (t) => {
  const prepared = await preparedRelease(t);
  const local = createLocalProductionClient(prepared.productionRoot, true);
  const planDirectory = join(prepared.root, "plan-auto-rollback");
  const backupDirectory = join(prepared.root, "backups-auto-rollback");
  await compareProduction({ releasePath: join(prepared.releaseDirectory, "release.json"), outputDirectory: planDirectory, backupDirectory, mode: "deploy", client: local });
  let uploads = 0;
  const client = {
    download: local.download,
    async upload(source, destination) {
      uploads += 1;
      await local.upload(source, destination);
      if (uploads === 1) await writeFile(join(prepared.productionRoot, destination), "corrupt post-upload bytes\n");
    },
  };
  await assert.rejects(uploadRelease({
    releasePath: join(prepared.releaseDirectory, "release.json"), planPath: join(planDirectory, "deployment-plan.json"),
    outputDirectory: join(prepared.root, "results-auto-rollback"), backupDirectory, client, productionConfirmation: true,
  }), /Post-upload hash mismatch/);
  assert.equal(uploads, 1);
  assert.equal(await readFile(join(prepared.productionRoot, "public_html", "assets", "site.css"), "utf8"), "corrupt post-upload bytes\n");
  const report = JSON.parse(await readFile(join(prepared.root, "results-auto-rollback", "deployment-results.json"), "utf8"));
  assert.deepEqual(report.rollback, [{
    destination: "public_html/assets/site.css", status: "manual-recovery-required", reason: "upload outcome was not verified; automatic restore would risk overwriting a concurrent change",
  }]);
});

test("later upload failure restores only earlier verified files whose remote hash is unchanged", async (t) => {
  const root = await fixture(t);
  await writeFile(join(root, "assets", "other.css"), "new other css\n");
  const manifestPath = await writeManifest(root, validManifest({ files: [
    { source: "assets/site.css", destination: "public_html/assets/site.css", publicPath: "/assets/site.css", expectedRemoteSha256: sha256("old css\n") },
    { source: "assets/other.css", destination: "public_html/assets/other.css", publicPath: "/assets/other.css", expectedRemoteSha256: sha256("old other css\n") },
  ] }));
  const releaseDirectory = join(root, "partial-release");
  await buildTestRelease(root, manifestPath, releaseDirectory);
  const productionRoot = join(root, "partial-production");
  await mkdir(join(productionRoot, "public_html", "assets"), { recursive: true });
  await writeFile(join(productionRoot, "public_html", "assets", "site.css"), "old css\n");
  await writeFile(join(productionRoot, "public_html", "assets", "other.css"), "old other css\n");
  const local = createLocalProductionClient(productionRoot, true);
  const planDirectory = join(root, "partial-plan");
  const backupDirectory = join(root, "partial-backups");
  await compareProduction({ releasePath: join(releaseDirectory, "release.json"), outputDirectory: planDirectory, backupDirectory, mode: "deploy", client: local });
  let uploads = 0;
  await assert.rejects(uploadRelease({
    releasePath: join(releaseDirectory, "release.json"), planPath: join(planDirectory, "deployment-plan.json"), outputDirectory: join(root, "partial-results"), backupDirectory,
    client: { download: local.download, async upload(...args) { uploads += 1; if (uploads === 2) throw new Error("simulated upload failure"); return local.upload(...args); } }, productionConfirmation: true,
  }), /simulated upload failure/);
  assert.equal(uploads, 3);
  assert.equal(await readFile(join(productionRoot, "public_html", "assets", "site.css"), "utf8"), "old css\n");
  assert.equal(await readFile(join(productionRoot, "public_html", "assets", "other.css"), "utf8"), "old other css\n");
});

test("functional verification failure can restore completed static uploads", async (t) => {
  const prepared = await preparedRelease(t);
  const client = createLocalProductionClient(prepared.productionRoot, true);
  const planDirectory = join(prepared.root, "functional-plan");
  const backupDirectory = join(prepared.root, "functional-backups");
  const resultsDirectory = join(prepared.root, "functional-results");
  await compareProduction({ releasePath: join(prepared.releaseDirectory, "release.json"), outputDirectory: planDirectory, backupDirectory, mode: "deploy", client });
  await uploadRelease({ releasePath: join(prepared.releaseDirectory, "release.json"), planPath: join(planDirectory, "deployment-plan.json"), outputDirectory: resultsDirectory, backupDirectory, client, productionConfirmation: true });
  const report = await rollbackCompletedRelease({
    releasePath: join(prepared.releaseDirectory, "release.json"), resultsPath: join(resultsDirectory, "deployment-results.json"), outputPath: join(resultsDirectory, "functional-rollback.json"), backupDirectory, client, productionConfirmation: true,
  });
  assert.equal(report.completed, true);
  assert.equal(await readFile(join(prepared.productionRoot, "public_html", "assets", "site.css"), "utf8"), "old css\n");
});

test("workflow guards, secret scope, cleanup, and artifact allowlists remain fail closed", async () => {
  const workflowUrls = [
    new URL("../.github/workflows/deploy-static-production.yml", import.meta.url),
    new URL("../.github/workflows/deploy-backend-production.yml", import.meta.url),
    new URL("../.github/workflows/verify-backend-production.yml", import.meta.url),
  ];
  for (const url of workflowUrls) {
    const workflow = await readFile(url, "utf8");
    assert.match(workflow, /PRODUCTION_DEPLOYMENTS_ENABLED: \$\{\{ vars\.PRODUCTION_DEPLOYMENTS_ENABLED \}\}[\s\S]{0,120}test "\$PRODUCTION_DEPLOYMENTS_ENABLED" = "true"/);
    assert.doesNotMatch(workflow, /\n    env:\n(?:      .*\n)*      NAMECHEAP_FTPS_PASSWORD:/);
    assert.doesNotMatch(workflow, /GITHUB_SHA:\s*\$\{\{ inputs\.deployed_commit/);
    for (const step of workflow.split(/\n      - name:/).slice(1)) {
      if (/\n        uses:/.test(step)) assert.doesNotMatch(step.split(/\n      - name:/)[0], /\$\{\{ secrets\./);
    }
  }
  for (const url of workflowUrls.slice(0, 2)) {
    const workflow = await readFile(url, "utf8");
    assert.match(workflow, /if: inputs\.mode == 'deploy'[\s\S]{0,800}ftps-upload\.mjs/);
    assert.match(workflow, /Delete runner-local backups and credential temporary files[\s\S]{0,160}if: always\(\)/);
    assert.doesNotMatch(workflow, /^\s+deployment-plan\/$/m);
    assert.doesNotMatch(workflow, /^\s+.*backup.*\/$/m);
  }
  const staticWorkflow = await readFile(workflowUrls[0], "utf8");
  assert.match(staticWorkflow, /steps\.static_verification\.outcome == 'failure'[\s\S]{0,1200}--rollback-results/);
  const backendWorkflow = await readFile(workflowUrls[1], "utf8");
  assert.match(backendWorkflow, /Upload changed manifest files[\s\S]{0,700}STRAVA_ADMIN_TOKEN:[\s\S]{0,700}ftps-upload\.mjs/);
});

test("example manifests, including all-zero remote placeholders, cannot enter deploy mode", async () => {
  await assert.rejects(
    resolveManifestInput("deploy/manifests/examples/standard-static.json", process.cwd(), "deploy"),
    /Example manifests are dry-run only/,
  );
  const copiedExample = JSON.parse(await readFile(new URL("../deploy/manifests/examples/standard-static.json", import.meta.url), "utf8"));
  await assert.rejects(validateManifestObject(copiedExample, { requireSources: false, mode: "deploy" }), /Example-only manifests cannot enter deploy mode/);
});
