#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createFtpsClient } from "../../scripts/deploy/ftps-client.mjs";

const projectDir = dirname(fileURLToPath(import.meta.url));
const distRoot = join(projectDir, "dist");
const archivePrefix = "/portfolio/mission-america-2026/";
const destinationPrefix = "public_html/portfolio/mission-america-2026/";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) throw new Error(`Unexpected argument: ${value}`);
    const key = value.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) args[key] = true;
    else { args[key] = next; index += 1; }
  }
  return args;
}

function publicUrl(baseUrl, relativePath = "") {
  const origin = new URL(baseUrl);
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.search || origin.hash) {
    throw new Error("PRODUCTION_BASE_URL must be a credential-free HTTPS origin");
  }
  const url = new URL(`${archivePrefix}${relativePath}`, origin);
  if (url.origin !== origin.origin || !url.pathname.startsWith(archivePrefix)) throw new Error("Archive URL escaped its boundary");
  return url;
}

async function request(baseUrl, relativePath, cacheBust = "") {
  const url = publicUrl(baseUrl, relativePath);
  if (cacheBust) url.searchParams.set("archive", cacheBust.slice(0, 16));
  return fetch(url, { redirect: "manual", headers: { "cache-control": "no-cache", pragma: "no-cache" } });
}

async function mapLimit(values, limit, operation) {
  const results = new Array(values.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (next < values.length) {
      const index = next;
      next += 1;
      results[index] = await operation(values[index], index);
    }
  }));
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = args.mode || "dry-run";
  if (!new Set(["dry-run", "deploy"]).has(mode)) throw new Error("--mode must be dry-run or deploy");
  const baseUrl = process.env.PRODUCTION_BASE_URL || "https://goodwingoodge.com";
  const inventory = JSON.parse(await readFile(join(distRoot, "deployment-inventory.json"), "utf8"));
  if (inventory.archivePrefix !== archivePrefix || inventory.productionCommit !== "6b2949dfcf3e3b70957d6e5fbb61f8d0ae81abb5") {
    throw new Error("Unexpected archive inventory identity");
  }
  const inventoryBytes = await readFile(join(distRoot, "deployment-inventory.json"));
  const files = [
    ...inventory.files,
    { path: "deployment-inventory.json", sha256: sha256(inventoryBytes), bytes: inventoryBytes.length },
  ];
  for (const file of files) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._+@()/ -]*$/.test(file.path) && file.path !== ".htaccess") {
      throw new Error(`Unsafe archive path: ${file.path}`);
    }
    if (file.path.includes("..") || file.path.startsWith("/")) throw new Error(`Archive path escaped its boundary: ${file.path}`);
  }

  const rootProbe = await request(baseUrl);
  if (rootProbe.status !== 404) throw new Error(`Archive root must be absent before provisioning; observed HTTP ${rootProbe.status}`);
  const publicFiles = files.filter((file) => file.path !== ".htaccess");
  await mapLimit(publicFiles, 10, async (file) => {
    const response = await request(baseUrl, file.path);
    if (response.status !== 404) throw new Error(`Archive file must be absent before provisioning: ${file.path}; observed HTTP ${response.status}`);
  });

  const report = {
    schemaVersion: 1,
    mode,
    archivePrefix,
    destinationPrefix,
    sourceCommit: process.env.GITHUB_SHA || null,
    verifiedProductionCommit: inventory.productionCommit,
    startedAt: new Date().toISOString(),
    files: files.map((file) => ({ ...file, status: "confirmed-absent" })),
  };

  if (mode === "deploy") {
    if (process.env.GITHUB_ACTIONS !== "true" || process.env.DEPLOYMENT_ENVIRONMENT !== "production"
      || process.env.CONFIRM_PORTFOLIO_ARCHIVE_DEPLOY !== "YES") {
      throw new Error("Portfolio deployment requires the protected production GitHub Actions environment");
    }
    const client = createFtpsClient(process.env, { createDirectories: true });
    const ordered = [...files].sort((a, b) => (a.path === ".htaccess" ? -1 : b.path === ".htaccess" ? 1 : a.path.localeCompare(b.path)));
    for (const file of ordered) {
      await client.upload(join(distRoot, file.path), `${destinationPrefix}${file.path}`);
      report.files.find((item) => item.path === file.path).status = "uploaded";
    }

    await mapLimit(publicFiles, 6, async (file) => {
      const response = await request(baseUrl, file.path, file.sha256);
      if (response.status !== 200) throw new Error(`Published archive file returned HTTP ${response.status}: ${file.path}`);
      const observed = sha256(Buffer.from(await response.arrayBuffer()));
      if (observed !== file.sha256) throw new Error(`Published archive hash mismatch: ${file.path}`);
      report.files.find((item) => item.path === file.path).status = "published-and-verified";
    });
    const publishedRoot = await request(baseUrl, "", files.find((file) => file.path === "index.html")?.sha256);
    if (publishedRoot.status !== 200) throw new Error(`Published archive root returned HTTP ${publishedRoot.status}`);
    const robots = publishedRoot.headers.get("x-robots-tag") || "";
    if (!robots.includes("noindex")) throw new Error("Published archive root lacks X-Robots-Tag noindex");
    const html = await publishedRoot.text();
    if (!html.includes('name="robots" content="noindex, nofollow, noarchive"')) throw new Error("Published archive root lacks noindex metadata");
    report.rootStatus = publishedRoot.status;
    report.rootRobotsHeader = robots;
  }

  report.completedAt = new Date().toISOString();
  report.completed = true;
  const output = resolve(args.output || join(projectDir, "deployment-report.json"));
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  console.log(`${mode === "deploy" ? "Published and verified" : "Confirmed absent"} ${files.length} archive files at ${archivePrefix}`);
}

main().catch((error) => {
  console.error(`Portfolio archive deployment failed: ${error.message}`);
  process.exitCode = 1;
});
