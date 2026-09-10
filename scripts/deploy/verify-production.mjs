#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
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

export function sameOriginRedirect(currentUrl, location) {
  if (!location) throw new Error("HTTP redirect omitted Location");
  const current = new URL(currentUrl);
  const next = new URL(location, current);
  if (next.origin !== current.origin) throw new Error(`HTTP redirect escaped production origin: ${next.origin}`);
  return next;
}

async function fetchChecked(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    let current = new URL(url);
    for (let redirects = 0; redirects <= 10; redirects += 1) {
      const response = await fetch(current, { ...options, redirect: "manual", signal: controller.signal });
      if (![301, 302, 303, 307, 308].includes(response.status)) return response;
      await response.body?.cancel();
      if (redirects === 10) throw new Error("HTTP redirect limit exceeded");
      current = sameOriginRedirect(current, response.headers.get("location"));
    }
    throw new Error("HTTP redirect limit exceeded");
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

export function validateRuntimePayload(payload, expectedReleaseGeneration, previousReleaseGeneration) {
  if (!/^[a-f0-9]{64}$/.test(expectedReleaseGeneration || "")) throw new Error("Expected release generation must be the approved lowercase runtime SHA-256");
  if (!/^[a-f0-9]{64}$/.test(previousReleaseGeneration || "")) throw new Error("Previous release generation must be the approved lowercase pre-deployment runtime SHA-256");
  if (expectedReleaseGeneration === previousReleaseGeneration) throw new Error("Expected runtime generation must differ from the previous generation");
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Runtime status response must be an object");
  for (const field of RUNTIME_FIELDS) {
    if (!Object.hasOwn(payload, field)) throw new Error(`Runtime status is missing approved field: ${field}`);
  }
  if (typeof payload.releaseGeneration !== "string" || !/^[a-f0-9]{64}$/.test(payload.releaseGeneration)) throw new Error("runtime releaseGeneration is invalid");
  if (payload.releaseGeneration !== expectedReleaseGeneration) {
    throw new Error(`Runtime release generation is stale: expected ${expectedReleaseGeneration}, observed ${payload.releaseGeneration}`);
  }
  if (!Number.isSafeInteger(payload.pid) || payload.pid <= 0) throw new Error("runtime pid is invalid");
  if (!Number.isFinite(Date.parse(payload.processStartedAt))) throw new Error("runtime processStartedAt is invalid");
  if (typeof payload.processUptimeSeconds !== "number" || !Number.isFinite(payload.processUptimeSeconds) || payload.processUptimeSeconds < 0) throw new Error("runtime processUptimeSeconds is invalid");
  if (!Number.isFinite(Date.parse(payload.raceWindowStart)) || !Number.isFinite(Date.parse(payload.raceWindowEnd))) throw new Error("runtime race window is invalid");
  if (typeof payload.raceWindowModuleVersion !== "string" || !payload.raceWindowModuleVersion) throw new Error("runtime raceWindowModuleVersion is invalid");
  return Object.fromEntries(RUNTIME_FIELDS.map((field) => [field, payload[field]]));
}

async function verifyRuntimeStatus(base, adminToken, expectedReleaseGeneration, previousReleaseGeneration, adminUser = "strava") {
  if (!adminToken) throw new Error("STRAVA_ADMIN_TOKEN is required for backend runtime verification");
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(adminUser)) throw new Error("STRAVA_ADMIN_USER is invalid");
  const authorization = `Basic ${Buffer.from(`${adminUser}:${adminToken}`).toString("base64")}`;
  const response = await fetchChecked(new URL("/strava/admin/runtime-status", base), { headers: { Authorization: authorization } });
  if (response.status !== 200) throw new Error(`Authenticated runtime-status returned ${response.status}; expected 200`);
  const cacheControl = response.headers.get("cache-control") || "";
  if (!/\bno-store\b/i.test(cacheControl) || !/\bprivate\b/i.test(cacheControl)) throw new Error("runtime-status must return Cache-Control: no-store, private");
  const approved = validateRuntimePayload(await response.json(), expectedReleaseGeneration, previousReleaseGeneration);
  console.log(`Runtime generation matched expected release ${expectedReleaseGeneration}; approved fields validated: ${Object.keys(approved).join(", ")}`);
  return { previousReleaseGeneration, expectedReleaseGeneration, observedReleaseGeneration: approved.releaseGeneration };
}

export async function verifyRuntimeBaseline(baseUrl, adminToken, expectedPreviousGeneration, adminUser = "strava", allowHttpLocal = false) {
  if (!adminToken) throw new Error("STRAVA_ADMIN_TOKEN is required for backend runtime baseline verification");
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(adminUser)) throw new Error("STRAVA_ADMIN_USER is invalid");
  if (!/^[a-f0-9]{64}$/.test(expectedPreviousGeneration || "")) throw new Error("previousReleaseGeneration must be a lowercase SHA-256");
  const base = productionBaseUrl(baseUrl, allowHttpLocal);
  const authorization = `Basic ${Buffer.from(`${adminUser}:${adminToken}`).toString("base64")}`;
  const response = await fetchChecked(new URL("/strava/admin/runtime-status", base), { headers: { Authorization: authorization } });
  if (response.status !== 200) throw new Error(`Authenticated runtime baseline returned ${response.status}; expected 200`);
  const cacheControl = response.headers.get("cache-control") || "";
  if (!/\bno-store\b/i.test(cacheControl) || !/\bprivate\b/i.test(cacheControl)) throw new Error("runtime-status must return Cache-Control: no-store, private");
  const payload = await response.json();
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || typeof payload.releaseGeneration !== "string" || !/^[a-f0-9]{64}$/.test(payload.releaseGeneration)) {
    throw new Error("runtime baseline releaseGeneration is missing or invalid");
  }
  if (payload.releaseGeneration !== expectedPreviousGeneration) throw new Error("Runtime baseline does not match manifest previousReleaseGeneration");
  console.log(`Runtime baseline matched approved previous generation ${expectedPreviousGeneration}`);
  return { previousReleaseGeneration: expectedPreviousGeneration, observedReleaseGeneration: payload.releaseGeneration };
}

export async function verifyProduction({ releasePath, client, baseUrl, skipBrowser = false, adminToken, adminUser, expectedReleaseGeneration, allowHttpLocal = false }) {
  const release = await loadRelease(releasePath);
  const base = productionBaseUrl(baseUrl, allowHttpLocal);
  const temporaryRoot = resolve(process.env.DEPLOY_TEMP_ROOT || tmpdir());
  if (process.env.DEPLOY_TEMP_ROOT) {
    await mkdir(temporaryRoot, { recursive: true, mode: 0o700 });
    await chmod(temporaryRoot, 0o700);
  }
  const temporaryDirectory = await mkdtemp(join(temporaryRoot, "goodwin-production-verify-"));
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
    let runtimeGeneration = null;
    if (release.deploymentType === "backend") {
      if (!release.expectedReleaseGeneration || expectedReleaseGeneration !== release.expectedReleaseGeneration) {
        throw new Error("Expected runtime generation must be explicitly supplied and exactly match release metadata");
      }
      runtimeGeneration = await verifyRuntimeStatus(base, adminToken, expectedReleaseGeneration, release.previousReleaseGeneration, adminUser);
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
    return { verifiedAt: new Date().toISOString(), deploymentType: release.deploymentType, releaseType: release.releaseType, sourceCommit: release.sourceCommit, runtimeGeneration };
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
    expectedReleaseGeneration: args["expected-release-generation"],
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
