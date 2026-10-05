#!/usr/bin/env node
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createFtpsClient } from "./ftps-client.mjs";
import { isMainModule, loadRelease, parseArgs, sha256 } from "./lib.mjs";

const TRACKING_PREVIEW_RUNTIME_PATTERN = /^public_html\/tracking-preview\/assets\/(?:app|tracking-map|route-data)-[a-f0-9]{16}\.mjs$/;

function productionUrl(baseUrl, publicPath, expectedSha256) {
  const origin = new URL(baseUrl);
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.search || origin.hash) {
    throw new Error("PRODUCTION_BASE_URL must be a credential-free HTTPS origin");
  }
  const url = new URL(publicPath, origin);
  if (url.origin !== origin.origin) throw new Error(`Public path leaves the production origin: ${publicPath}`);
  if (expectedSha256) url.searchParams.set("provision", expectedSha256.slice(0, 16));
  return url;
}

export async function probePublicAsset(baseUrl, publicPath, expectedSha256) {
  const url = productionUrl(baseUrl, publicPath, expectedSha256);
  const response = await fetch(url, {
    redirect: "manual",
    headers: { "cache-control": "no-cache", pragma: "no-cache" },
  });
  if (response.status >= 300 && response.status < 400) {
    throw new Error(`Public asset probe returned an unapproved redirect for ${publicPath}`);
  }
  const body = Buffer.from(await response.arrayBuffer());
  return { status: response.status, sha256: response.status === 200 ? sha256(body) : null };
}

export function assertProvisioningRelease(release) {
  if (release.deploymentType !== "static") throw new Error("Static asset provisioning requires a static release");
  if (!release.files.length) throw new Error("Static asset provisioning requires at least one file");
  for (const file of release.files) {
    if (file.expectedRemoteAbsent !== true || file.expectedRemoteSha256 !== undefined) {
      throw new Error(`Provisioning requires expectedRemoteAbsent for ${file.destination}`);
    }
    const isGeneralAsset = file.destination.startsWith("public_html/assets/");
    const isTrackingPreviewRuntime = TRACKING_PREVIEW_RUNTIME_PATTERN.test(file.destination);
    if ((!isGeneralAsset && !isTrackingPreviewRuntime) || file.publicPath !== file.destination.slice("public_html".length)) {
      throw new Error(`Provisioning is limited to public static assets: ${file.destination}`);
    }
    if (!file.expectedSha256 || file.expectedSha256 !== file.newSha256) {
      throw new Error(`Provisioning requires an exact approved source hash for ${file.destination}`);
    }
  }
}

export async function provisionStaticAssets({
  releasePath,
  outputPath,
  mode = "dry-run",
  client,
  probe,
  productionConfirmation = false,
  temporaryRoot = tmpdir(),
}) {
  if (!['dry-run', 'deploy'].includes(mode)) throw new Error("mode must be dry-run or deploy");
  if (mode === "deploy" && !productionConfirmation) throw new Error("Production asset provisioning requires explicit confirmation");
  const release = await loadRelease(releasePath);
  assertProvisioningRelease(release);
  const results = [];
  const scratch = await mkdtemp(join(resolve(temporaryRoot), "goodwin-static-provision-"));
  try {
    for (const file of release.files) {
      const observed = await probe(file.publicPath);
      if (observed.status !== 404) {
        throw new Error(`Expected public asset to return 404 before provisioning: ${file.publicPath}; observed ${observed.status}`);
      }
      results.push({ destination: file.destination, publicPath: file.publicPath, status: "confirmed-publicly-absent", expectedSha256: file.expectedSha256 });
    }
    if (mode === "deploy") {
      for (let index = 0; index < release.files.length; index += 1) {
        const file = release.files[index];
        const immediate = await probe(file.publicPath);
        if (immediate.status !== 404) {
          throw new Error(`Public asset appeared before provisioning and will not be overwritten: ${file.publicPath}; observed ${immediate.status}`);
        }
        const packagedPath = resolve(dirname(releasePath), file.packagedPath);
        await client.upload(packagedPath, file.destination);
        const downloadedPath = join(scratch, `${String(index + 1).padStart(4, "0")}-verified.bin`);
        await client.download(file.destination, downloadedPath);
        const observedSha256 = sha256(await readFile(downloadedPath));
        if (observedSha256 !== file.expectedSha256) {
          throw new Error(`Provisioned FTPS hash mismatch for ${file.destination}`);
        }
        const publicResult = await probe(file.publicPath, file.expectedSha256);
        if (publicResult.status !== 200 || publicResult.sha256 !== file.expectedSha256) {
          throw new Error(`Provisioned public asset failed exact hash verification: ${file.publicPath}`);
        }
        results[index] = { ...results[index], status: "provisioned-and-verified", observedSha256 };
      }
    }
    const report = {
      schemaVersion: 1,
      mode,
      sourceCommit: release.sourceCommit,
      completed: true,
      files: results,
      rollback: mode === "deploy" ? "Manual removal is required for newly provisioned files; automated deletion is prohibited." : null,
    };
    await mkdir(dirname(resolve(outputPath)), { recursive: true });
    await writeFile(resolve(outputPath), `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
    return report;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.release || !args.output) throw new Error("--release and --output are required");
  const mode = args.mode || "dry-run";
  const confirmed = mode === "dry-run" || (
    process.env.GITHUB_ACTIONS === "true"
    && process.env.DEPLOYMENT_ENVIRONMENT === "production"
    && process.env.CONFIRM_PRODUCTION_PROVISION === "YES"
  );
  const baseUrl = process.env.PRODUCTION_BASE_URL || "https://goodwingoodge.com";
  const client = mode === "deploy" ? createFtpsClient(process.env, { createDirectories: true }) : null;
  const report = await provisionStaticAssets({
    releasePath: resolve(args.release),
    outputPath: resolve(args.output),
    mode,
    client,
    probe: (publicPath, expectedSha256) => probePublicAsset(baseUrl, publicPath, expectedSha256),
    productionConfirmation: confirmed,
    temporaryRoot: process.env.DEPLOY_TEMP_ROOT || tmpdir(),
  });
  console.log(`${mode === "deploy" ? "Provisioned" : "Confirmed absent"} ${report.files.length} static asset(s)`);
}

if (isMainModule(import.meta.url)) {
  main().catch((error) => {
    console.error(`Static asset provisioning failed: ${error.message}`);
    process.exitCode = 1;
  });
}
