#!/usr/bin/env node
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { isMainModule, loadRelease, parseArgs, sha256 } from "./lib.mjs";
import { productionClient } from "./ftps-client.mjs";
import { verifyRuntimeBaseline } from "./verify-production.mjs";

export async function compareProduction({ releasePath, outputDirectory, backupDirectory, mode = "dry-run", client, runtimeBaselineVerifier }) {
  if (!['dry-run', 'deploy'].includes(mode)) throw new Error("mode must be dry-run or deploy");
  const release = await loadRelease(releasePath);
  if (release.deploymentType === "backend") {
    if (typeof runtimeBaselineVerifier !== "function") throw new Error("Backend comparison requires authenticated runtime baseline verification");
    await runtimeBaselineVerifier(release.previousReleaseGeneration);
  }
  const output = resolve(outputDirectory);
  if (!backupDirectory) throw new Error("backupDirectory is required and must remain runner-local");
  const backups = resolve(backupDirectory);
  if (backups === output || backups.startsWith(`${output}/`)) throw new Error("Runner-local backups must be outside the artifact metadata directory");
  await mkdir(output, { recursive: false });
  await mkdir(backups, { recursive: false, mode: 0o700 });
  await chmod(backups, 0o700);
  const planFiles = [];
  const rollbackFiles = [];
  for (let index = 0; index < release.files.length; index += 1) {
    const file = release.files[index];
    const backupId = `${String(index + 1).padStart(4, "0")}-backup.bin`;
    const absoluteBackupPath = join(backups, backupId);
    const remote = await client.download(file.destination, absoluteBackupPath, { allowMissing: true });
    let oldObservedSha256 = null;
    let oldSize = null;
    if (remote.exists) {
      const oldContent = await readFile(absoluteBackupPath);
      oldObservedSha256 = sha256(oldContent);
      oldSize = oldContent.byteLength;
      await chmod(absoluteBackupPath, 0o600);
    }
    const oldExpectedSha256 = file.expectedRemoteSha256 ?? null;
    const expectedRemoteAbsent = file.expectedRemoteAbsent === true;
    const newExpectedSha256 = file.expectedSha256 ?? file.newSha256;
    if (oldExpectedSha256 && !remote.exists) {
      throw new Error(`Expected existing remote file is missing: ${file.destination}; expected ${oldExpectedSha256}`);
    }
    if (oldExpectedSha256 && oldObservedSha256 !== oldExpectedSha256) {
      throw new Error(`Existing remote hash mismatch for ${file.destination}: expected ${oldExpectedSha256}, observed ${oldObservedSha256}`);
    }
    if (expectedRemoteAbsent && remote.exists) {
      throw new Error(`Expected remote destination to be absent but it exists: ${file.destination}; observed ${oldObservedSha256}`);
    }
    const status = !remote.exists ? "new" : oldObservedSha256 === newExpectedSha256 ? "unchanged" : "changed";
    planFiles.push({
      source: file.source,
      destination: file.destination,
      publicPath: file.publicPath,
      status,
      productionExists: remote.exists,
      oldExpectedSha256,
      expectedRemoteAbsent,
      oldObservedSha256,
      newExpectedSha256,
      newObservedSha256: null,
      oldSize,
      newSize: file.size,
      sizeDelta: oldSize === null ? file.size : file.size - oldSize,
    });
    rollbackFiles.push({
      destination: file.destination,
      changed: status !== "unchanged",
      productionExisted: remote.exists,
      backupAvailableRunnerLocal: remote.exists,
      backupId: remote.exists ? backupId : null,
      oldExpectedSha256,
      expectedRemoteAbsent,
      oldObservedSha256,
      newExpectedSha256,
      newObservedSha256: null,
      rollbackAction: status === "unchanged" ? "none" : remote.exists ? "restore-runner-local-backup-during-this-job" : "manual-remove-new-file-no-automated-delete",
    });
  }
  const summary = {
    total: planFiles.length,
    changed: planFiles.filter((file) => file.status === "changed").length,
    new: planFiles.filter((file) => file.status === "new").length,
    unchanged: planFiles.filter((file) => file.status === "unchanged").length,
  };
  const plan = {
    schemaVersion: 1,
    mode,
    deploymentType: release.deploymentType,
    releaseType: release.releaseType,
    sourceCommit: release.sourceCommit,
    generatedAt: new Date().toISOString(),
    summary,
    files: planFiles,
  };
  const rollback = {
    schemaVersion: 1,
    deploymentType: release.deploymentType,
    releaseType: release.releaseType,
    sourceCommit: release.sourceCommit,
    createdAt: plan.generatedAt,
    files: rollbackFiles,
  };
  await writeFile(join(output, "deployment-plan.json"), `${JSON.stringify(plan, null, 2)}\n`, { flag: "wx" });
  await writeFile(join(output, "rollback-manifest.json"), `${JSON.stringify(rollback, null, 2)}\n`, { flag: "wx" });
  return { plan, rollback };
}

function printPlan(plan) {
  console.log(`${plan.mode.toUpperCase()} PLAN: ${plan.summary.changed} changed, ${plan.summary.new} new, ${plan.summary.unchanged} unchanged`);
  for (const file of plan.files) {
    console.log(`${file.status.padEnd(9)} ${file.destination} ${file.oldObservedSha256 || "missing"} -> ${file.newExpectedSha256}`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = [
      `## ${plan.deploymentType} ${plan.mode} plan`,
      "",
      `Release level: **${plan.releaseType}**`,
      "",
      `Files: ${plan.summary.total}; changed: ${plan.summary.changed}; new: ${plan.summary.new}; unchanged: ${plan.summary.unchanged}.`,
      "",
      "| Status | Destination | Old SHA-256 | New SHA-256 |",
      "|---|---|---|---|",
      ...plan.files.map((file) => `| ${file.status} | \`${file.destination}\` | \`${file.oldObservedSha256 || "missing"}\` | \`${file.newExpectedSha256}\` |`),
      "",
    ];
    return writeFile(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`, { flag: "a" });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.release || !args.output || !args["backup-dir"]) throw new Error("--release, --output, and --backup-dir are required");
  const { plan } = await compareProduction({
    releasePath: args.release,
    outputDirectory: args.output,
    backupDirectory: args["backup-dir"],
    mode: args.mode || "dry-run",
    client: productionClient(args),
    runtimeBaselineVerifier: (expected) => verifyRuntimeBaseline(
      process.env.PRODUCTION_BASE_URL || "https://goodwingoodge.com",
      process.env.STRAVA_ADMIN_TOKEN,
      expected,
      process.env.STRAVA_ADMIN_USER || "strava",
      args["allow-http-local"] === true,
    ),
  });
  await printPlan(plan);
}

if (isMainModule(import.meta.url)) {
  main().catch((error) => {
    console.error(`Production comparison failed: ${error.message}`);
    process.exitCode = 1;
  });
}
