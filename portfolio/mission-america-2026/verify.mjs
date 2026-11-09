#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = dirname(fileURLToPath(import.meta.url));
const root = join(projectDir, "dist");
const prefix = "/portfolio/mission-america-2026/";
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

function localTarget(url) {
  const clean = url.split(/[?#]/)[0];
  if (!clean.startsWith(prefix)) return null;
  const relative = decodeURIComponent(clean.slice(prefix.length));
  if (!relative || relative.endsWith("/")) return join(root, relative, "index.html");
  const exact = join(root, relative);
  if (existsSync(exact)) return exact;
  return join(root, relative, "index.html");
}

assert(existsSync(join(root, "index.html")), "archive index is missing");
assert(existsSync(join(root, ".htaccess")), "archive .htaccess is missing");
const htmlFiles = walk(root).filter((file) => file.endsWith(".html"));
assert(htmlFiles.length >= 17, "expected archive pages are missing");

for (const file of htmlFiles) {
  const html = readFileSync(file, "utf8");
  assert(html.includes('name="robots" content="noindex, nofollow, noarchive"'), `${file} lacks noindex metadata`);
  assert(html.includes(`<base href="${prefix}">`), `${file} lacks archive base`);
  assert(!/<form\b/i.test(html), `${file} still contains a form`);
  assert(!/googletagmanager|gtag\(/i.test(html), `${file} still contains production analytics`);
  assert(!/serviceWorker|navigator\.serviceWorker/i.test(html), `${file} registers a service worker`);
  assert(!/(?:href|src|poster)=["']\/(?!portfolio\/mission-america-2026\/)/i.test(html), `${file} contains a root-relative escape`);
  for (const match of html.matchAll(/(?:href|src|poster)=["']([^"']+)["']/gi)) {
    const value = match[1];
    const target = localTarget(value);
    if (target) assert(existsSync(target), `${file} references missing ${value}`);
    if (value.startsWith("/") && !value.startsWith(prefix)) failures.push(`${file} escapes archive: ${value}`);
  }
}

const tracker = readFileSync(join(root, "assets/tracker-base.js"), "utf8");
const raceMap = readFileSync(join(root, "assets/strava-race-map.mjs"), "utf8");
assert(!tracker.includes("/strava/public/"), "tracker still calls the production race API");
assert(!tracker.includes("tracking-preview/garmin"), "tracker still calls Garmin production polling");
assert(!tracker.includes("docs.google.com/spreadsheets"), "tracker still calls the live updates sheet");
assert(!raceMap.includes('= "/strava/public/'), "race map still calls production APIs");
assert(tracker.includes(`${prefix}data/race-status.json`) || raceMap.includes(`${prefix}data/race-status.json`), "recorded race status is not wired to the map");

const races = JSON.parse(readFileSync(join(root, "data/races.json"), "utf8"));
const status = JSON.parse(readFileSync(join(root, "data/race-status.json"), "utf8"));
assert(races.races?.length === 50, "race snapshot must contain exactly 50 public records");
assert(races.races.filter((race) => race.status === "completed").length === 27, "race snapshot completion count changed");
assert(status.completedRaces === 27 && status.totalRaces === 50 && status.active === false, "race status snapshot is inconsistent");

const inventory = JSON.parse(readFileSync(join(root, "deployment-inventory.json"), "utf8"));
for (const item of inventory.files) {
  const file = resolve(root, item.path);
  assert(existsSync(file), `inventory file is missing: ${item.path}`);
  if (existsSync(file)) assert(sha256(readFileSync(file)) === item.sha256, `inventory hash mismatch: ${item.path}`);
}

if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Verified Mission America portfolio archive: ${htmlFiles.length} HTML routes, ${inventory.files.length} files, 27 recorded races`);
}
