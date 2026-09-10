#!/usr/bin/env node
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { isMainModule, loadRelease, parseArgs, sha256 } from "./lib.mjs";
import { productionClient } from "./ftps-client.mjs";

export async function uploadRelease({ releasePath, planPath, outputDirectory, backupDirectory, client, productionConfirmation = false }) {
  if (!productionConfirmation) throw new Error("Production upload confirmation is missing");
  const release = await loadRelease(releasePath);
  const plan = JSON.parse(await readFile(planPath, "utf8"));
  if (plan.mode !== "deploy" || plan.deploymentType !== release.deploymentType || plan.releaseType !== release.releaseType || plan.sourceCommit !== release.sourceCommit) {
    throw new Error("Deployment plan does not match release metadata or deploy mode");
  }
  if (!Array.isArray(plan.files) || plan.files.length !== release.files.length) throw new Error("Deployment plan file count does not match release");
  for (let index = 0; index < release.files.length; index += 1) {
    const file = release.files[index];
    const planned = plan.files[index];
    const oldExpectedSha256 = file.expectedRemoteSha256 ?? null;
    const expectedRemoteAbsent = file.expectedRemoteAbsent === true;
    const newExpectedSha256 = file.expectedSha256 ?? file.newSha256;
    if (
      planned.destination !== file.destination
      || planned.oldExpectedSha256 !== oldExpectedSha256
      || planned.expectedRemoteAbsent !== expectedRemoteAbsent
      || planned.newExpectedSha256 !== newExpectedSha256
      || !["new", "changed", "unchanged"].includes(planned.status)
    ) {
      throw new Error(`Plan mismatch at file ${index + 1}`);
    }
    if (oldExpectedSha256 && planned.oldObservedSha256 !== oldExpectedSha256) {
      throw new Error(`Plan does not record an approved existing remote hash for ${file.destination}`);
    }
    if (oldExpectedSha256 && (!planned.productionExists || planned.status !== (oldExpectedSha256 === newExpectedSha256 ? "unchanged" : "changed"))) {
      throw new Error(`Plan status does not match the pinned existing destination for ${file.destination}`);
    }
    if (expectedRemoteAbsent && (planned.productionExists || planned.status !== "new")) throw new Error(`Plan does not record an absent destination for ${file.destination}`);
  }
  const output = resolve(outputDirectory);
  await mkdir(output, { recursive: true });
  const temporaryRoot = resolve(process.env.DEPLOY_TEMP_ROOT || tmpdir());
  if (process.env.DEPLOY_TEMP_ROOT) {
    await mkdir(temporaryRoot, { recursive: true, mode: 0o700 });
    await chmod(temporaryRoot, 0o700);
  }
  const verificationDirectory = await mkdtemp(join(temporaryRoot, "goodwin-deploy-verify-"));
  if (!backupDirectory) throw new Error("backupDirectory is required");
  const backups = resolve(backupDirectory);
  const results = [];
  const reportPath = join(output, "deployment-results.json");
  const saveReport = async (completed = false) => {
    const report = { schemaVersion: 1, completed, updatedAt: new Date().toISOString(), sourceCommit: release.sourceCommit, files: results };
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    return report;
  };
  const observeRemoteState = async (file, index, phase) => {
    const path = join(verificationDirectory, `${String(index + 1).padStart(4, "0")}-${phase}.bin`);
    const remote = await client.download(file.destination, path, { allowMissing: true });
    return { exists: remote.exists, sha256: remote.exists ? sha256(await readFile(path)) : null };
  };
  await saveReport(false);
  try {
    // Check every destination and every local rollback backup before any file can be uploaded.
    for (let index = 0; index < release.files.length; index += 1) {
      const file = release.files[index];
      const observed = await observeRemoteState(file, index, "preflight");
      const stateMatches = file.expectedRemoteAbsent === true
        ? !observed.exists
        : observed.exists && observed.sha256 === file.expectedRemoteSha256;
      if (!stateMatches) {
        results.push({
          destination: file.destination,
          status: "failed-remote-precondition",
          oldExpectedSha256: file.expectedRemoteSha256 ?? null,
          expectedRemoteAbsent: file.expectedRemoteAbsent === true,
          oldObservedSha256: observed.sha256,
          newExpectedSha256: file.expectedSha256 ?? file.newSha256,
          newObservedSha256: null,
        });
        await saveReport(false);
        throw new Error(`Remote prior-state mismatch before upload for ${file.destination}`);
      }
      if (file.expectedRemoteSha256) {
        const backupPath = join(backups, `${String(index + 1).padStart(4, "0")}-backup.bin`);
        const backup = await readFile(backupPath).catch(() => null);
        if (!backup || sha256(backup) !== file.expectedRemoteSha256) throw new Error(`Runner-local rollback backup is missing or corrupt for ${file.destination}`);
      }
    }

    for (let index = 0; index < release.files.length; index += 1) {
      const file = release.files[index];
      const planned = plan.files[index];
      const oldExpectedSha256 = file.expectedRemoteSha256 ?? null;
      const expectedRemoteAbsent = file.expectedRemoteAbsent === true;
      const newExpectedSha256 = file.expectedSha256 ?? file.newSha256;
      let oldObservedSha256 = planned.oldObservedSha256;
      let newObservedSha256 = null;
      if (planned.status === "unchanged") {
        results.push({
          destination: file.destination,
          status: "skipped-unchanged",
          oldExpectedSha256,
          expectedRemoteAbsent,
          oldObservedSha256,
          newExpectedSha256,
          newObservedSha256: oldObservedSha256,
        });
        await saveReport(false);
        continue;
      }
      console.log(`Uploading manifest file ${index + 1}/${release.files.length}: ${file.destination}`);
      try {
        // Repeat the exact remote prior-state precondition immediately before this upload.
        const immediate = await observeRemoteState(file, index, "immediate-pre-upload");
        oldObservedSha256 = immediate.sha256;
        if (expectedRemoteAbsent ? immediate.exists : !immediate.exists || immediate.sha256 !== oldExpectedSha256) {
          throw new Error(`Remote prior state changed before upload for ${file.destination}`);
        }
        await client.upload(file.absolutePackagedPath, file.destination);
        const postUpload = await observeRemoteState(file, index, "post-upload");
        newObservedSha256 = postUpload.sha256;
        if (newObservedSha256 !== newExpectedSha256) {
          throw new Error(`Post-upload hash mismatch for ${file.destination}: expected ${newExpectedSha256}, observed ${newObservedSha256}`);
        }
        results.push({
          destination: file.destination,
          status: "uploaded-and-verified",
          oldExpectedSha256,
          expectedRemoteAbsent,
          oldObservedSha256,
          newExpectedSha256,
          newObservedSha256,
        });
        await saveReport(false);
      } catch (error) {
        results.push({
          destination: file.destination,
          status: "failed",
          oldExpectedSha256,
          expectedRemoteAbsent,
          oldObservedSha256,
          newExpectedSha256,
          newObservedSha256,
          error: error.message,
        });
        await saveReport(false);
        throw error;
      }
    }
    return saveReport(true);
  } finally {
    await rm(verificationDirectory, { recursive: true, force: true });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.release || !args.plan || !args.output || !args["backup-dir"]) throw new Error("--release, --plan, --output, and --backup-dir are required");
  const localAdapter = Boolean(args["local-production-root"]);
  const confirmed = localAdapter
    ? args["allow-local-test-adapter"] === true
    : process.env.GITHUB_ACTIONS === "true" && process.env.DEPLOYMENT_ENVIRONMENT === "production" && process.env.CONFIRM_PRODUCTION_DEPLOY === "YES";
  await uploadRelease({
    releasePath: args.release,
    planPath: args.plan,
    outputDirectory: args.output,
    backupDirectory: args["backup-dir"],
    client: productionClient(args),
    productionConfirmation: confirmed,
  });
  console.log("Every changed manifest file was uploaded separately and verified by SHA-256");
}

if (isMainModule(import.meta.url)) {
  main().catch((error) => {
    console.error(`FTPS deployment failed: ${error.message}`);
    process.exitCode = 1;
  });
}
