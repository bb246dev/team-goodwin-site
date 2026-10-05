import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { ROUTE_STOPS } from "../tracking-preview/source/route-data.mjs";
import { raceStopTooltip } from "../tracking-preview/source/tracking-map.mjs";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const mainCandidate = read("assets/releases/race-times-both-maps-2026-10-04/tracker-base.js");
const previewRoot = "assets/releases/race-times-both-maps-2026-10-04/tracking-preview/";
const previewManifest = JSON.parse(read(`${previewRoot}asset-manifest.json`));
const deployManifest = JSON.parse(read("deploy/manifests/releases/race-times-both-maps-2026-10-04.json"));
const provisionManifest = JSON.parse(read("deploy/manifests/releases/race-times-both-maps-assets-provision-2026-10-04.json"));

function namedFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing function ${name}`);
  let parameterDepth = 0;
  let sawParameters = false;
  let open = -1;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === "(") { parameterDepth += 1; sawParameters = true; }
    else if (source[index] === ")") parameterDepth -= 1;
    else if (source[index] === "{" && sawParameters && parameterDepth === 0) { open = index; break; }
  }
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`unterminated function ${name}`);
}

function evaluateFunction(source, name) {
  const context = {};
  vm.runInNewContext(`${namedFunction(source, name)}\nthis.result = ${name};`, context);
  return context.result;
}

function stopRecord(source, city) {
  const match = source.match(new RegExp(`\\{ n: \\d+, state: "[^"]+", abbr: "[A-Z]{2}", city: "${city}"[^}]+\\}`));
  assert.ok(match, `missing ${city} stop`);
  return match[0];
}

test("the main map renders the three approved compact local times", () => {
  const formatRaceStopSchedule = evaluateFunction(mainCandidate, "formatRaceStopSchedule");
  for (const [city, scheduledStart, timezone, expected] of [
    ["Los Angeles", "2026-10-20T22:45:00-07:00", "America/Los_Angeles", "Oct 20 · 10:45PM"],
    ["Portsmouth", "2026-10-31T05:00:00-04:00", "America/New_York", "Oct 31 · 5:00AM"],
    ["Kittery", "2026-10-31T12:00:00-04:00", "America/New_York", "Oct 31 · 12:00PM"],
  ]) {
    const record = stopRecord(mainCandidate, city);
    assert.match(record, new RegExp(`scheduledStart: "${scheduledStart}"`), city);
    assert.match(record, new RegExp(`timezone: "${timezone.replace("/", "\\/")}"`), city);
    assert.equal(formatRaceStopSchedule({ date: expected.slice(0, 6), scheduledStart, timezone }), expected, city);
  }
  assert.match(mainCandidate, /stopCardDate\.textContent = stopSchedule/);
  assert.match(mainCandidate, /circle\.setAttribute\("aria-label", `\$\{stop\.n\}\. \$\{stop\.city\}, \$\{stop\.state\}, \$\{stopSchedule\}/);
});

test("the preview and iframe embed share the same app and exact tooltip labels", () => {
  for (const [city, expected] of [
    ["Los Angeles", "26. Los Angeles, California · Oct 21 · 10:45PM"],
    ["Portsmouth", "48. Portsmouth, New Hampshire · Oct 31 · 5:00AM"],
    ["Kittery", "49. Kittery, Maine · Oct 31 · 12:00PM"],
  ]) {
    const stop = ROUTE_STOPS.find((entry) => entry.city === city);
    assert.equal(raceStopTooltip(stop), expected, city);
  }
  const app = previewManifest.generatedFiles.find(({ path }) => path.startsWith("assets/app-"));
  const index = read(`${previewRoot}index.html`);
  const embed = read(`${previewRoot}embed/index.html`);
  assert.match(index, new RegExp(`src="${app.url}"`));
  assert.match(embed, new RegExp(`src="${app.url}"`));
  assert.doesNotMatch(embed, /site-footer|tracker-nav|googletagmanager/);
});

test("the corrected two-phase manifests are map-only and pin every live precondition", () => {
  assert.equal(deployManifest.files.length, 4);
  assert.equal(provisionManifest.files.length, 3);
  assert.deepEqual(deployManifest.protectedPathsApproved, ["public_html/assets/tracker-base.js"]);
  assert.deepEqual(provisionManifest.protectedPathsApproved, []);
  assert.deepEqual(deployManifest.validation.browserRoutes, [
    "/", "/live-tracking.html", "/tracking-preview/", "/tracking-preview/embed/",
  ]);
  for (const file of [...deployManifest.files, ...provisionManifest.files]) {
    assert.equal(sha256(read(file.source)), file.expectedSha256, file.source);
    assert.doesNotMatch(file.destination, /footer|sponsor|partners|\.css$|\.png$|\.svg$|\.htaccess$|strava|hapn|flightaware/i);
  }
  assert.deepEqual(deployManifest.files.map(({ destination }) => destination), [
    "public_html/assets/tracker-base.js",
    "public_html/tracking-preview/index.html",
    "public_html/tracking-preview/embed/index.html",
    "public_html/tracking-preview/asset-manifest.json",
  ]);
  assert.deepEqual(provisionManifest.files.map(({ destination }) => destination), [
    "public_html/tracking-preview/assets/app-4411ec9de981b376.mjs",
    "public_html/tracking-preview/assets/tracking-map-a383bdc843e41141.mjs",
    "public_html/tracking-preview/assets/route-data-64cfb1be0b0d345b.mjs",
  ]);
});
