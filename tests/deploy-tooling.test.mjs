import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { buildRelease } from "../scripts/deploy/build-release.mjs";
import { compareProduction } from "../scripts/deploy/compare-production.mjs";
import { createLocalProductionClient } from "../scripts/deploy/ftps-client.mjs";
import { uploadRelease } from "../scripts/deploy/ftps-upload.mjs";
import { sha256, validateManifestObject, validationCommandsForRelease } from "../scripts/deploy/lib.mjs";
import { secretFindings } from "../scripts/deploy/scan-secrets.mjs";

const PROTECTED_SOURCE_CONTENT = "export const map = true;\n";
const PROTECTED_REMOTE_CONTENT = "old protected map\n";

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
    files: [{ source: "assets/site.css", destination: "public_html/assets/site.css", publicPath: "/assets/site.css" }],
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

test("protected files fail closed when the expected existing remote hash is omitted", async (t) => {
  const root = await fixture(t);
  const manifest = protectedManifest({ expectedRemoteSha256: undefined });
  await assert.rejects(validateManifestObject(manifest, { root }), /requires an expected existing remote expectedRemoteSha256/);
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
    files: [{ source: "assets/missing.css", destination: "public_html/assets/missing.css", publicPath: "/assets/missing.css" }],
  }), { root }), /existing regular file/);
});

test("secret detection catches definite credentials but permits explicit examples", () => {
  assert.deepEqual(secretFindings("const admin_token = 'real-production-value-1234567890';"), ["credential assignment"]);
  assert.deepEqual(secretFindings("const admin_token = 'test-only-placeholder-token';"), []);
});

async function preparedRelease(t) {
  const root = await fixture(t);
  const manifestPath = await writeManifest(root, validManifest());
  const releaseDirectory = join(root, "release");
  const release = await buildRelease({ manifestPath, outputDirectory: releaseDirectory, root, expectedType: "static", expectedRelease: "micro" });
  const productionRoot = join(root, "production");
  await mkdir(join(productionRoot, "public_html", "assets"), { recursive: true });
  await writeFile(join(productionRoot, "public_html", "assets", "site.css"), "old css\n");
  return { root, release, releaseDirectory, productionRoot };
}

async function preparedProtectedRelease(t, manifest = protectedManifest()) {
  const root = await fixture(t);
  const manifestPath = await writeManifest(root, manifest);
  const releaseDirectory = join(root, "release");
  const release = await buildRelease({ manifestPath, outputDirectory: releaseDirectory, root, expectedType: "static", expectedRelease: "micro" });
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
    releasePath: join(prepared.releaseDirectory, "release.json"), outputDirectory, mode: "dry-run", client,
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
    client: createLocalProductionClient(prepared.productionRoot, true),
  });
  assert.equal(plan.files[0].destination, "public_html/assets/site.css");
  assert.equal(plan.files[0].oldExpectedSha256, null);
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
    client: createLocalProductionClient(prepared.productionRoot, true),
  });
  assert.equal(rollback.files[0].rollbackAction, "restore-backup");
  assert.equal(rollback.files[0].oldExpectedSha256, null);
  assert.match(rollback.files[0].oldObservedSha256, /^[a-f0-9]{64}$/);
  assert.equal(rollback.files[0].newExpectedSha256, prepared.release.files[0].newSha256);
  assert.equal(rollback.files[0].newObservedSha256, null);
  assert.equal(await readFile(join(outputDirectory, rollback.files[0].backupPath), "utf8"), "old css\n");
});

test("matching expected remote hash is accepted and recorded distinctly", async (t) => {
  const prepared = await preparedProtectedRelease(t);
  const outputDirectory = join(prepared.root, "plan-protected-match");
  const { plan } = await compareProduction({
    releasePath: join(prepared.releaseDirectory, "release.json"), outputDirectory, mode: "deploy",
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
    client: createLocalProductionClient(prepared.productionRoot, true),
  });
  assert.equal(rollback.files[0].oldExpectedSha256, sha256(PROTECTED_REMOTE_CONTENT));
  assert.equal(rollback.files[0].oldObservedSha256, sha256(PROTECTED_REMOTE_CONTENT));
  assert.equal(await readFile(join(outputDirectory, rollback.files[0].backupPath), "utf8"), PROTECTED_REMOTE_CONTENT);
});

test("local test adapter exercises per-file deployment and hash verification", async (t) => {
  const prepared = await preparedRelease(t);
  const client = createLocalProductionClient(prepared.productionRoot, true);
  const planDirectory = join(prepared.root, "plan-upload");
  await compareProduction({ releasePath: join(prepared.releaseDirectory, "release.json"), outputDirectory: planDirectory, mode: "deploy", client });
  const report = await uploadRelease({
    releasePath: join(prepared.releaseDirectory, "release.json"),
    planPath: join(planDirectory, "deployment-plan.json"),
    outputDirectory: join(prepared.root, "upload-results"),
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
  await compareProduction({
    releasePath: join(prepared.releaseDirectory, "release.json"), outputDirectory: planDirectory, mode: "deploy", client: baseClient,
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
    client: racingClient,
    productionConfirmation: true,
  }), /Existing remote hash changed before upload/);
  assert.equal(uploads, 0);
});

test("protected upload verifies the new hash and records all expected and observed hashes", async (t) => {
  const prepared = await preparedProtectedRelease(t);
  const client = createLocalProductionClient(prepared.productionRoot, true);
  const planDirectory = join(prepared.root, "plan-protected-upload");
  await compareProduction({
    releasePath: join(prepared.releaseDirectory, "release.json"), outputDirectory: planDirectory, mode: "deploy", client,
  });
  const report = await uploadRelease({
    releasePath: join(prepared.releaseDirectory, "release.json"),
    planPath: join(planDirectory, "deployment-plan.json"),
    outputDirectory: join(prepared.root, "protected-upload-results"),
    client,
    productionConfirmation: true,
  });
  assert.equal(report.completed, true);
  assert.deepEqual(report.files[0], {
    destination: "public_html/assets/strava-race-map.mjs",
    status: "uploaded-and-verified",
    oldExpectedSha256: sha256(PROTECTED_REMOTE_CONTENT),
    oldObservedSha256: sha256(PROTECTED_REMOTE_CONTENT),
    newExpectedSha256: sha256(PROTECTED_SOURCE_CONTENT),
    newObservedSha256: sha256(PROTECTED_SOURCE_CONTENT),
  });
  assert.equal(await readFile(join(prepared.productionRoot, "public_html", "assets", "strava-race-map.mjs"), "utf8"), PROTECTED_SOURCE_CONTENT);
  assert.equal(await readFile(join(planDirectory, "backup", "0001-strava-race-map.mjs"), "utf8"), PROTECTED_REMOTE_CONTENT);
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
