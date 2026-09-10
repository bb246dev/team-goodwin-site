#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { isMainModule, loadRelease, parseArgs, sha256 } from "./lib.mjs";
import { productionClient } from "./ftps-client.mjs";

export async function compareProduction({ releasePath, outputDirectory, mode = "dry-run", client }) {
  if (!['dry-run', 'deploy'].includes(mode)) throw new Error("mode must be dry-run or deploy");
  const release = await loadRelease(releasePath);
  const output = resolve(outputDirectory);
  await mkdir(output, { recursive: false });
  await mkdir(join(output, "backup"), { recursive: false });
  const planFiles = [];
  const rollbackFiles = [];
  for (let index = 0; index < release.files.length; index += 1) {
    const file = release.files[index];
    const backupPath = `backup/${String(index + 1).padStart(4, "0")}-${basename(file.destination)}`;
    const absoluteBackupPath = join(output, backupPath);
    const remote = await client.download(file.destination, absoluteBackupPath, { allowMissing: true });
    let oldObservedSha256 = null;
    let oldSize = null;
    if (remote.exists) {
      const oldContent = await readFile(absoluteBackupPath);
      oldObservedSha256 = sha256(oldContent);
      oldSize = oldContent.byteLength;
    }
    const oldExpectedSha256 = file.expectedRemoteSha256 ?? null;
    const newExpectedSha256 = file.expectedSha256 ?? file.newSha256;
    if (oldExpectedSha256 && !remote.exists) {
      throw new Error(`Expected existing remote file is missing: ${file.destination}; expected ${oldExpectedSha256}`);
    }
    if (oldExpectedSha256 && oldObservedSha256 !== oldExpectedSha256) {
      throw new Error(`Existing remote hash mismatch for ${file.destination}: expected ${oldExpectedSha256}, observed ${oldObservedSha256}`);
    }
    const status = !remote.exists ? "new" : oldObservedSha256 === newExpectedSha256 ? "unchanged" : "changed";
    planFiles.push({
      source: file.source,
      destination: file.destination,
      publicPath: file.publicPath,
      status,
      productionExists: remote.exists,
      oldExpectedSha256,
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
      backupPath: remote.exists ? backupPath : null,
      oldExpectedSha256,
      oldObservedSha256,
      newExpectedSha256,
      newObservedSha256: null,
      rollbackAction: status === "unchanged" ? "none" : remote.exists ? "restore-backup" : "manual-remove-new-file",
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
  if (!args.release || !args.output) throw new Error("--release and --output are required");
  const { plan } = await compareProduction({
    releasePath: args.release,
    outputDirectory: args.output,
    mode: args.mode || "dry-run",
    client: productionClient(args),
  });
  await printPlan(plan);
}

if (isMainModule(import.meta.url)) {
  main().catch((error) => {
    console.error(`Production comparison failed: ${error.message}`);
    process.exitCode = 1;
  });
}
