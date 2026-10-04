import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const root = "production-merge/hapn-api2-2026-09-08";
const runtimeFiles = [
  "goodwin-strava-api/lib/hapn-tracking-core.mjs",
  "goodwin-strava-api/lib/hapn-route.mjs",
  "goodwin-strava-api/app.js",
  "public_html/assets/strava-race-map.mjs",
  "public_html/assets/tracker-base.js",
];
const allowedFiles = new Set([...runtimeFiles, "README.md", "manifest.json", "validation-results.json"]);

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Candidate contains a symlink: ${path}`);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

const files = walk(root);
for (const file of files) {
  const name = relative(root, file);
  if (!allowedFiles.has(name)) throw new Error(`Unexpected candidate file: ${name}`);
}
for (const name of allowedFiles) {
  if (!files.some((file) => relative(root, file) === name)) throw new Error(`Missing candidate file: ${name}`);
}

const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
for (const name of runtimeFiles) {
  const digest = createHash("sha256").update(readFileSync(join(root, name))).digest("hex");
  if (manifest.files?.[name] !== digest) throw new Error(`Candidate checksum mismatch: ${name}`);
}
if (Object.keys(manifest.files || {}).length !== runtimeFiles.length) throw new Error("Manifest runtime inventory mismatch");

const publicSource = runtimeFiles
  .filter((name) => name.startsWith("public_html/"))
  .map((name) => readFileSync(join(root, name), "utf8"))
  .join("\n");
if (/HAPN_(?:CLIENT_ID|CLIENT_SECRET|DEVICE_IMEI)|auth\.usehapn\.com|api\.iotgps\.io|Authorization\s*:/i.test(publicSource)) {
  throw new Error("Public candidate contains a server-only HAPN credential or upstream reference");
}
if (/window\.missionMapTracking|\/api\/tracking-status/.test(publicSource)) {
  throw new Error("Public candidate contains the retired provider-specific mutation or endpoint path");
}
for (const contract of [
  "/strava/public/tracking-status", "createMultiProviderCoordinator", "applyMapDomainPatch",
  "appendStaticFlightLegs", "credentials: \"omit\"",
]) {
  if (!publicSource.includes(contract)) throw new Error(`Public candidate is missing contract: ${contract}`);
}

const serverSource = runtimeFiles
  .filter((name) => name.startsWith("goodwin-strava-api/"))
  .map((name) => readFileSync(join(root, name), "utf8"))
  .join("\n");
for (const contract of [
  "https://auth.usehapn.com/oauth2/token", "https://api.iotgps.io", "redirect: \"error\"",
  "HAPN_STATUS_RESPONSE_MAX_BYTES", "hapn_device_mismatch", "HAPN_RETENTION_SECONDS",
  "Cross-Origin-Resource-Policy", "method_not_allowed", "createHapnPublicRateLimiter",
]) {
  if (!serverSource.includes(contract)) throw new Error(`Server candidate is missing contract: ${contract}`);
}
if (/\b\d{14,17}\b/.test(serverSource)) throw new Error("Server candidate contains a literal device identifier");
if (/client_secret\s*[:=]\s*["'][^"'$.{][^"']+["']/i.test(serverSource)) {
  throw new Error("Server candidate contains a literal client secret");
}

console.log(`Validated HAPN API #2 candidate: ${runtimeFiles.length} runtime files`);
