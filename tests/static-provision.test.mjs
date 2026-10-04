import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { createLocalProductionClient } from "../scripts/deploy/ftps-client.mjs";
import { sha256 } from "../scripts/deploy/lib.mjs";
import { provisionStaticAssets } from "../scripts/deploy/provision-static-assets.mjs";

test("static provisioning creates only approved absent assets and verifies exact bytes", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "goodwin-provision-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const releaseRoot = join(root, "release");
  const remoteRoot = join(root, "remote");
  await mkdir(join(releaseRoot, "files"), { recursive: true });
  const content = Buffer.from("approved-logo-bytes");
  const hash = "0d0473f38104699c87d78f163d1fe80ab9845160d9060a25668b2da5a68f9c4a";
  const inventory = Buffer.from(`${JSON.stringify({ schemaVersion: 1, sources: { "dist/assets/partners/logo.png": { sha256: hash, size: content.length } } }, null, 2)}\n`);
  await writeFile(join(releaseRoot, "files", "0001-logo.png"), content);
  await writeFile(join(releaseRoot, "validated-output-inventory.json"), inventory);
  await writeFile(join(releaseRoot, "release.json"), `${JSON.stringify({
    schemaVersion: 1,
    deploymentType: "static",
    releaseType: "micro",
    description: "test",
    protectedPathsApproved: [],
    validation: { targetedTests: ["tests/footer.test.mjs"], browserRoutes: ["/"], apiChecks: [] },
    createdAt: "2026-10-04T00:00:00.000Z",
    sourceCommit: "a".repeat(40),
    validatedOutputInventorySha256: sha256(inventory),
    sourceValidation: [{ source: "dist/assets/partners/logo.png", status: "approved-binary-asset", sha256: hash, size: content.length }],
    files: [{
      source: "dist/assets/partners/logo.png",
      destination: "public_html/assets/partners/logo.png",
      publicPath: "/assets/partners/logo.png",
      contentType: "binary-asset",
      expectedSha256: hash,
      expectedRemoteAbsent: true,
      newSha256: hash,
      size: content.length,
      packagedPath: "files/0001-logo.png",
    }],
  }, null, 2)}\n`);
  let publicContent = null;
  const report = await provisionStaticAssets({
    releasePath: join(releaseRoot, "release.json"),
    outputPath: join(root, "report.json"),
    mode: "deploy",
    client: {
      ...createLocalProductionClient(remoteRoot, true),
      async upload(localPath, destination) {
        const client = createLocalProductionClient(remoteRoot, true);
        await client.upload(localPath, destination);
        publicContent = await readFile(localPath);
      },
    },
    probe: async (_publicPath, expectedSha256) => publicContent
      ? { status: 200, sha256: expectedSha256 }
      : { status: 404, sha256: null },
    productionConfirmation: true,
    temporaryRoot: root,
  });
  assert.equal(report.completed, true);
  assert.equal(report.files[0].status, "provisioned-and-verified");
  assert.deepEqual(await readFile(join(remoteRoot, "public_html/assets/partners/logo.png")), content);
});

test("static provisioning fails closed when an asset appears before upload", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "goodwin-provision-race-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const releaseRoot = join(root, "release");
  await mkdir(join(releaseRoot, "files"), { recursive: true });
  const content = Buffer.from("approved-logo-bytes");
  const hash = "0d0473f38104699c87d78f163d1fe80ab9845160d9060a25668b2da5a68f9c4a";
  const inventory = Buffer.from(`${JSON.stringify({ schemaVersion: 1, sources: { "dist/assets/partners/logo.png": { sha256: hash, size: content.length } } }, null, 2)}\n`);
  await writeFile(join(releaseRoot, "files", "0001-logo.png"), content);
  await writeFile(join(releaseRoot, "validated-output-inventory.json"), inventory);
  await writeFile(join(releaseRoot, "release.json"), `${JSON.stringify({
    schemaVersion: 1,
    deploymentType: "static",
    releaseType: "micro",
    description: "test",
    protectedPathsApproved: [],
    validation: { targetedTests: ["tests/footer.test.mjs"], browserRoutes: ["/"], apiChecks: [] },
    createdAt: "2026-10-04T00:00:00.000Z",
    sourceCommit: "a".repeat(40),
    validatedOutputInventorySha256: sha256(inventory),
    sourceValidation: [{ source: "dist/assets/partners/logo.png", status: "approved-binary-asset", sha256: hash, size: content.length }],
    files: [{ source: "dist/assets/partners/logo.png", destination: "public_html/assets/partners/logo.png", publicPath: "/assets/partners/logo.png", contentType: "binary-asset", expectedSha256: hash, expectedRemoteAbsent: true, newSha256: hash, size: content.length, packagedPath: "files/0001-logo.png" }],
  }, null, 2)}\n`);
  let probes = 0;
  let uploaded = false;
  await assert.rejects(() => provisionStaticAssets({
    releasePath: join(releaseRoot, "release.json"),
    outputPath: join(root, "report.json"),
    mode: "deploy",
    client: { upload: async () => { uploaded = true; }, download: async () => ({ exists: true }) },
    probe: async () => (++probes === 1 ? { status: 404, sha256: null } : { status: 200, sha256: hash }),
    productionConfirmation: true,
    temporaryRoot: root,
  }), /appeared before provisioning/);
  assert.equal(uploaded, false);
});
