#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { isMainModule, loadRelease, parseArgs, sha256 } from "./lib.mjs";
import { productionClient } from "./ftps-client.mjs";

const RUNTIME_FIELDS = Object.freeze([
  "releaseGeneration",
  "pid",
  "processStartedAt",
  "processUptimeSeconds",
  "raceWindowStart",
  "raceWindowEnd",
  "raceWindowModuleVersion",
]);
const MAJOR_ACCEPTANCE_ROUTES = Object.freeze([
  "/", "/the-run/", "/live-tracking/", "/fifty-runs/", "/athletes/", "/partners/", "/updates/", "/will/",
  "/faq/", "/privacy/", "/terms/", "/participation-terms/", "/accessibility/", "/week-1/", "/week-2/", "/week-3/",
]);

function productionBaseUrl(value, allowHttpLocal = false) {
  const url = new URL(value || "https://goodwingoodge.com");
  if (url.username || url.password || url.search || url.hash) throw new Error("Production base URL may not contain credentials, query, or fragment");
  if (url.protocol !== "https:" && !(allowHttpLocal && url.protocol === "http:" && ["127.0.0.1", "localhost", "::1"].includes(url.hostname))) {
    throw new Error("Production base URL must use HTTPS");
  }
  return url;
}

async function fetchChecked(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    return await fetch(url, { redirect: "follow", ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function requiredField(payload, dottedPath) {
  let value = payload;
  for (const part of dottedPath.split(".")) {
    if (!value || typeof value !== "object" || !Object.hasOwn(value, part)) throw new Error(`Required JSON field is absent: ${dottedPath}`);
    value = value[part];
  }
}

async function verifyHttpCheck(base, check) {
  const url = new URL(check.path, base);
  if (url.origin !== base.origin) throw new Error(`HTTP check escaped production origin: ${check.path}`);
  const response = await fetchChecked(url);
  if (response.status !== check.expectedStatus) throw new Error(`${check.name} returned ${response.status}; expected ${check.expectedStatus}`);
  if (check.requiredJsonFields.length) {
    const payload = await response.json();
    for (const field of check.requiredJsonFields) requiredField(payload, field);
  } else {
    await response.body?.cancel();
  }
  console.log(`HTTP ${response.status}: ${check.name} (${check.path})`);
}

async function responseSha256(response) {
  const hash = createHash("sha256");
  for await (const chunk of response.body) hash.update(chunk);
  return hash.digest("hex");
}

async function verifyStaticFileHttp(base, file) {
  const url = new URL(file.publicPath, base);
  if (url.origin !== base.origin) throw new Error(`Static URL escaped production origin: ${file.publicPath}`);
  url.searchParams.set("deployment-verify", file.newSha256.slice(0, 16));
  const response = await fetchChecked(url, { headers: { "Cache-Control": "no-cache" } });
  if (response.status !== 200) throw new Error(`${file.publicPath} returned ${response.status}; expected 200`);
  if (file.destination !== "public_html/.htaccess") {
    const servedSha256 = await responseSha256(response);
    if (servedSha256 !== file.newSha256) throw new Error(`Public HTTP hash mismatch: ${file.publicPath}`);
    console.log(`HTTP 200 and public SHA-256 verified: ${file.publicPath}`);
  } else {
    await response.body?.cancel();
    console.log("HTTP 200 verified after protected .htaccess change: /");
  }
}

async function chromeExecutable() {
  const candidates = [
    process.env.CHROME_BIN,
    "google-chrome",
    "google-chrome-stable",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (candidate.includes("/")) {
      try { await access(candidate); return candidate; } catch { /* Continue. */ }
    } else {
      const check = spawnSync("which", [candidate], { encoding: "utf8", shell: false });
      if (check.status === 0) return check.stdout.trim();
    }
  }
  throw new Error("Chrome was not found for the required browser smoke test");
}

function imageUrlsFromDom(dom, pageUrl) {
  const values = new Set();
  for (const match of dom.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["']/gi)) {
    if (/^(?:data:|blob:)/i.test(match[1])) continue;
    const url = new URL(match[1], pageUrl);
    if (url.origin === pageUrl.origin) values.add(url.href);
  }
  return [...values].slice(0, 200);
}

async function runBrowserSmoke(base, path, viewport, chrome, releaseType) {
  const url = new URL(path, base);
  if (url.origin !== base.origin) throw new Error(`Browser route escaped production origin: ${path}`);
  const result = spawnSync(chrome, [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--enable-logging=stderr",
    "--virtual-time-budget=12000",
    `--window-size=${viewport.width},${viewport.height}`,
    "--dump-dom",
    url.href,
  ], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024, shell: false, timeout: 45_000 });
  if (result.error) throw result.error;
  if (result.status !== 0 || !/<html\b/i.test(result.stdout)) throw new Error(`Browser smoke failed for ${path} at ${viewport.width}x${viewport.height}`);
  if (/CONSOLE[^\r\n]*(?:Uncaught|\bError\b)/i.test(result.stderr)) throw new Error(`Browser console error detected for ${path} at ${viewport.width}x${viewport.height}`);
  if (releaseType !== "micro" && path === "/" && !/(?:animation-play-state:paused|\bslideshow\b|\bcarousel\b)/i.test(result.stdout)) {
    throw new Error("Home slideshow/media rail was not present after browser rendering");
  }
  if (releaseType !== "micro" && path === "/live-tracking/" && !/id=["']mission-map["']/.test(result.stdout)) {
    throw new Error("Mission America map mount was not present after browser rendering");
  }
  const images = imageUrlsFromDom(result.stdout, url);
  for (const image of images) {
    const response = await fetchChecked(image);
    if (!response.ok) throw new Error(`Broken image (${response.status}) on ${path}: ${new URL(image).pathname}`);
    await response.body?.cancel();
  }
  console.log(`Browser smoke passed: ${path} at ${viewport.width}x${viewport.height}; ${images.length} same-origin image(s) checked`);
}

function validateRuntimePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Runtime status response must be an object");
  for (const field of RUNTIME_FIELDS) {
    if (!Object.hasOwn(payload, field)) throw new Error(`Runtime status is missing approved field: ${field}`);
  }
  if (!(typeof payload.releaseGeneration === "string" || Number.isSafeInteger(payload.releaseGeneration))) throw new Error("runtime releaseGeneration is invalid");
  if (!Number.isSafeInteger(payload.pid) || payload.pid <= 0) throw new Error("runtime pid is invalid");
  if (!Number.isFinite(Date.parse(payload.processStartedAt))) throw new Error("runtime processStartedAt is invalid");
  if (typeof payload.processUptimeSeconds !== "number" || !Number.isFinite(payload.processUptimeSeconds) || payload.processUptimeSeconds < 0) throw new Error("runtime processUptimeSeconds is invalid");
  if (!Number.isFinite(Date.parse(payload.raceWindowStart)) || !Number.isFinite(Date.parse(payload.raceWindowEnd))) throw new Error("runtime race window is invalid");
  if (typeof payload.raceWindowModuleVersion !== "string" || !payload.raceWindowModuleVersion) throw new Error("runtime raceWindowModuleVersion is invalid");
  return Object.fromEntries(RUNTIME_FIELDS.map((field) => [field, payload[field]]));
}

async function verifyRuntimeStatus(base, adminToken, adminUser = "strava") {
  if (!adminToken) throw new Error("STRAVA_ADMIN_TOKEN is required for backend runtime verification");
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(adminUser)) throw new Error("STRAVA_ADMIN_USER is invalid");
  const authorization = `Basic ${Buffer.from(`${adminUser}:${adminToken}`).toString("base64")}`;
  const response = await fetchChecked(new URL("/strava/admin/runtime-status", base), { headers: { Authorization: authorization } });
  if (response.status !== 200) throw new Error(`Authenticated runtime-status returned ${response.status}; expected 200`);
  const cacheControl = response.headers.get("cache-control") || "";
  if (!/\bno-store\b/i.test(cacheControl) || !/\bprivate\b/i.test(cacheControl)) throw new Error("runtime-status must return Cache-Control: no-store, private");
  const approved = validateRuntimePayload(await response.json());
  console.log(`Runtime status passed; approved fields validated: ${Object.keys(approved).join(", ")}`);
}

export async function verifyProduction({ releasePath, client, baseUrl, skipBrowser = false, adminToken, adminUser, allowHttpLocal = false }) {
  const release = await loadRelease(releasePath);
  const base = productionBaseUrl(baseUrl, allowHttpLocal);
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "goodwin-production-verify-"));
  try {
    for (let index = 0; index < release.files.length; index += 1) {
      const file = release.files[index];
      const downloadPath = join(temporaryDirectory, `${String(index + 1).padStart(4, "0")}.bin`);
      await client.download(file.destination, downloadPath);
      if (sha256(await readFile(downloadPath)) !== file.newSha256) throw new Error(`Production hash mismatch: ${file.destination}`);
      console.log(`Production SHA-256 verified: ${file.destination}`);
      if (release.deploymentType === "static") {
        await verifyStaticFileHttp(base, file);
      }
    }
    for (const check of release.validation.apiChecks) await verifyHttpCheck(base, check);
    if (release.deploymentType === "backend") {
      await verifyRuntimeStatus(base, adminToken, adminUser);
    } else if (!skipBrowser) {
      const chrome = await chromeExecutable();
      const viewports = release.releaseType === "micro"
        ? [{ width: 1440, height: 900 }]
        : [{ width: 1440, height: 900 }, { width: 390, height: 844 }];
      const browserRoutes = release.releaseType === "major"
        ? [...new Set([...release.validation.browserRoutes, ...MAJOR_ACCEPTANCE_ROUTES])]
        : release.validation.browserRoutes;
      for (const path of browserRoutes) {
        await verifyHttpCheck(base, { name: `Browser route ${path}`, path, expectedStatus: 200, requiredJsonFields: [] });
        for (const viewport of viewports) await runBrowserSmoke(base, path, viewport, chrome, release.releaseType);
      }
    }
    return { verifiedAt: new Date().toISOString(), deploymentType: release.deploymentType, releaseType: release.releaseType, sourceCommit: release.sourceCommit };
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.release) throw new Error("--release is required");
  const result = await verifyProduction({
    releasePath: args.release,
    client: productionClient(args),
    baseUrl: args["base-url"] || process.env.PRODUCTION_BASE_URL || "https://goodwingoodge.com",
    skipBrowser: args["skip-browser"] === true,
    adminToken: process.env.STRAVA_ADMIN_TOKEN,
    adminUser: process.env.STRAVA_ADMIN_USER || "strava",
    allowHttpLocal: args["allow-http-local"] === true,
  });
  if (args.output) await writeFile(args.output, `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
  console.log("Production verification completed successfully");
}

if (isMainModule(import.meta.url)) {
  main().catch((error) => {
    console.error(`Production verification failed: ${error.message}`);
    process.exitCode = 1;
  });
}
