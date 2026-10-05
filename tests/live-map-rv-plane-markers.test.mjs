import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const baseline = read("assets/releases/race-times-both-maps-2026-10-04/tracker-base.js");
const candidatePath = "assets/releases/live-map-rv-plane-markers-2026-10-05/tracker-base.js";
const candidate = read(candidatePath);
const manifest = JSON.parse(read("deploy/manifests/releases/live-map-rv-plane-markers-2026-10-05.json"));

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
  assert.ok(open >= 0, `missing body for ${name}`);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`unterminated function ${name}`);
}

function constArray(source, name) {
  const start = source.indexOf(`const ${name} = [`);
  assert.ok(start >= 0, `missing array ${name}`);
  const open = source.indexOf("[", start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "[") depth += 1;
    if (source[index] === "]") depth -= 1;
    if (depth === 0) return source.slice(open, index + 1);
  }
  throw new Error(`unterminated array ${name}`);
}

function evaluateFunction(source, name, setup = "") {
  const context = {};
  vm.runInNewContext(`${setup}\n${namedFunction(source, name)}\nthis.result = ${name};`, context);
  return context.result;
}

function stopRecord(source, city) {
  const match = source.match(new RegExp(`\\{ n: \\d+, state: "[^"]+", abbr: "[A-Z]{2}", city: "${city}"[^}]+\\}`));
  assert.ok(match, `missing ${city} stop`);
  return match[0];
}

test("RV marker is hidden before the gate and allowed at and after it", () => {
  assert.match(candidate, /const RV_MAP_VISIBLE_FROM = Date\.parse\("2026-10-11T06:00:00-07:00"\)/);
  const rvMapVisible = evaluateFunction(
    candidate,
    "rvMapVisible",
    'const RV_MAP_VISIBLE_FROM = Date.parse("2026-10-11T06:00:00-07:00");',
  );
  assert.equal(rvMapVisible(Date.parse("2026-10-11T05:59:59.999-07:00")), false);
  assert.equal(rvMapVisible(Date.parse("2026-10-11T06:00:00-07:00")), true);
  assert.equal(rvMapVisible(Date.parse("2026-10-11T06:00:00.001-07:00")), true);
  assert.match(candidate, /const displayedRvPosition = showRvMarker \? staticPlacements\.rv\?\.position \|\| missionHapnRv\.position : null/);
  assert.match(candidate, /const rvMarker = showRvMarker \? appendImageMarker\(svg, svgNS, rvSvgPoint, mapEntityAssets\.rv, "rv"\) : null/);
  assert.match(candidate, /scheduleMissionRvReveal\(\)/);
});

test("plane marker is limited to an active in-transit scheduled flight", () => {
  const itinerary = constArray(candidate, "flightItinerary");
  const scheduledFlightMarkerLeg = evaluateFunction(
    candidate,
    "scheduledFlightMarkerLeg",
    `const flightItinerary = ${itinerary};`,
  );
  assert.equal(scheduledFlightMarkerLeg(), null);
  assert.equal(scheduledFlightMarkerLeg({ active: false, status: "IN TRANSIT", fromStop: 1, toStop: 2 }), null);
  assert.equal(scheduledFlightMarkerLeg({ active: true, status: "GROUND", fromStop: 1, toStop: 2 }), null);
  assert.equal(scheduledFlightMarkerLeg({ active: true, status: "ARRIVED", fromStop: 1, toStop: 2 }), null);
  assert.equal(scheduledFlightMarkerLeg({ active: true, status: "IN TRANSIT", fromStop: 8, toStop: 9 }), null);
  const activeLeg = scheduledFlightMarkerLeg({ active: true, status: "IN TRANSIT", fromStop: 1, toStop: 2 });
  assert.equal(activeLeg.from, "HNL");
  assert.equal(activeLeg.to, "ANC");
  assert.doesNotMatch(namedFunction(candidate, "appendStaticFlightLegs"), /map-flight-plane/);
  assert.match(namedFunction(candidate, "appendFlightMarker"), /map-flight-plane/);
  assert.match(candidate, /appendFlightMarker\(flightLayer, svgNS, trackingData\.flight, centroids\)/);
});

test("flight paths and the map legend remain unchanged", () => {
  const projected = (source) => vm.runInNewContext(constArray(source, "flightItinerary"))
    .map(({ date, from, to, time, airline }) => ({ date, from, to, time, airline }));
  assert.equal(JSON.stringify(projected(candidate)), JSON.stringify(projected(baseline)));
  assert.equal(
    sha256(namedFunction(candidate, "updateTrackingMapKeyTerminology")),
    sha256(namedFunction(baseline, "updateTrackingMapKeyTerminology")),
  );
  assert.match(namedFunction(candidate, "appendStaticFlightLegs"), /flightPath\.setAttribute\("class", "map-route flight"\)/);
  assert.doesNotMatch(candidate, /tracking-map-key[^\n]+(?:hidden|display\s*=\s*"none")/);
});

test("the three visible scheduled race times remain in labels, titles, and cards", () => {
  assert.equal(
    sha256(namedFunction(candidate, "formatRaceStopSchedule")),
    sha256(namedFunction(baseline, "formatRaceStopSchedule")),
  );
  const formatRaceStopSchedule = evaluateFunction(candidate, "formatRaceStopSchedule");
  for (const [city, date, scheduledStart, timezone, expected] of [
    ["Los Angeles", "Oct 20", "2026-10-20T22:45:00-07:00", "America/Los_Angeles", "Oct 20 · 10:45PM"],
    ["Portsmouth", "Oct 31", "2026-10-31T05:00:00-04:00", "America/New_York", "Oct 31 · 5:00AM"],
    ["Kittery", "Oct 31", "2026-10-31T12:00:00-04:00", "America/New_York", "Oct 31 · 12:00PM"],
  ]) {
    const record = stopRecord(candidate, city);
    assert.match(record, new RegExp(`scheduledStart: "${scheduledStart}"`), city);
    assert.match(record, new RegExp(`timezone: "${timezone.replace("/", "\\/")}"`), city);
    assert.equal(formatRaceStopSchedule({ date, scheduledStart, timezone }), expected, city);
  }
  assert.match(candidate, /stopCardDate\.textContent = stopSchedule/);
  assert.match(candidate, /circle\.setAttribute\("aria-label", `\$\{stop\.n\}\. \$\{stop\.city\}, \$\{stop\.state\}, \$\{stopSchedule\}/);
  assert.match(candidate, /title\.textContent = `\$\{stop\.n\}\. \$\{stop\.city\}, \$\{stop\.state\} \| \$\{stopSchedule\}/);
});

test("the new manifest is a one-file main-map release pinned to the live baseline", () => {
  assert.deepEqual(manifest.protectedPathsApproved, ["public_html/assets/tracker-base.js"]);
  assert.deepEqual(manifest.files, [{
    source: candidatePath,
    destination: "public_html/assets/tracker-base.js",
    publicPath: "/assets/tracker-base.js",
    expectedSha256: sha256(candidate),
    expectedRemoteSha256: "48845fa6e0837133219be387145f7934754ece44b34c2fa122aa05044e141fdb",
  }]);
  assert.deepEqual(manifest.validation.browserRoutes, [
    "/", "/live-tracking.html", "/live-tracking/",
  ]);
  const serialized = JSON.stringify(manifest);
  assert.doesNotMatch(serialized, /tracking-preview|client-preview|footer|sponsor|partners|\.css|\.png|\.svg|\.htaccess|frame-ancestors|flightaware|hapn/i);
  assert.doesNotMatch(serialized, /c1926c43c01dee1c16054f972e2e9843ecf111644321a9592c2a2fdd810b6e30/);
});
