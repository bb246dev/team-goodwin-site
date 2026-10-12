import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import { parseGarminFeed } from "../assets/releases/live-map-garmin-ii-priority-2026-10-12/tracking-preview/assets/garmin-kml-af3a85bfc4b14a78.mjs";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const baselinePath = "assets/releases/live-map-flight-itinerary-rows-04-08-2026-10-11/tracker-base.js";
const candidatePath = "assets/releases/live-map-garmin-ii-priority-2026-10-12/tracker-base.js";
const baseline = read(baselinePath);
const candidate = read(candidatePath);
const manifest = JSON.parse(read("deploy/manifests/releases/live-map-garmin-ii-priority-2026-10-12.json"));

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

function constStatement(source, name) {
  const start = source.indexOf(`const ${name} =`);
  assert.ok(start >= 0, `missing constant ${name}`);
  const end = source.indexOf(";\n", start);
  assert.ok(end > start, `unterminated constant ${name}`);
  return source.slice(start, end + 1);
}

function priorityHarness() {
  return new Function(`
    const GARMIN_FRESH_MS = 10 * 60_000;
    ${constStatement(candidate, "MISSION_SCHEDULED_FLIGHTS")}
    let missionGarminRunner = { kind: "unavailable", position: null, observedAt: null, trail: [] };
    ${namedFunction(candidate, "missionScheduledFlightAt")}
    ${namedFunction(candidate, "missionGarminLiveFreshAt")}
    ${namedFunction(candidate, "missionWillDisplayStateAt")}
    ${namedFunction(candidate, "missionMarkerVisibility")}
    return { missionGarminLiveFreshAt, missionWillDisplayStateAt, missionMarkerVisibility };
  `)();
}

const flightTime = Date.parse("2026-10-16T10:00:00Z");
const idleTime = Date.parse("2026-10-12T16:45:00Z");
const freshGarmin = {
  available: true,
  validGpsFix: true,
  deviceType: "inReach Mini 2",
  kind: "fresh",
  position: { lat: 43.492448, lng: -112.046663 },
  observedAt: "2026-10-16T09:59:00Z",
  trail: [],
};
const staleGarmin = {
  ...freshGarmin,
  kind: "stale",
  observedAt: "2026-10-16T09:40:00Z",
};

function assertOnly(visibility, expected) {
  assert.equal(Object.values(visibility).filter(Boolean).length, expected === "none" ? 0 : 1);
  assert.deepEqual(visibility, {
    runner: expected === "runner",
    plane: expected === "plane",
    rv: expected === "rv",
  });
}

test("fresh valid Garmin II wins during a scheduled flight and renders runner only", () => {
  const h = priorityHarness();
  const state = h.missionWillDisplayStateAt(flightTime, freshGarmin);
  assert.equal(h.missionGarminLiveFreshAt(flightTime, freshGarmin), true);
  assert.equal(state.source, "garmin");
  assert.equal(state.activeFlightWindow, true);
  assertOnly(h.missionMarkerVisibility(state, true), "runner");
});

test("fresh valid Garmin II hides an eligible RV when no flight is active", () => {
  const h = priorityHarness();
  const garmin = { ...freshGarmin, observedAt: "2026-10-12T16:44:00Z" };
  const state = h.missionWillDisplayStateAt(idleTime, garmin);
  assertOnly(h.missionMarkerVisibility(state, true), "runner");
});

test("stale Garmin II does not block an active scheduled-flight plane", () => {
  const h = priorityHarness();
  const state = h.missionWillDisplayStateAt(flightTime, staleGarmin);
  assert.equal(h.missionGarminLiveFreshAt(flightTime, staleGarmin), false);
  assert.equal(state.source, "schedule");
  assertOnly(h.missionMarkerVisibility(state, true), "plane");
});

test("stale, invalid, or unavailable Garmin II falls through to the existing RV gate", () => {
  const h = priorityHarness();
  const states = [
    { ...staleGarmin, observedAt: "2026-10-12T16:20:00Z" },
    { ...freshGarmin, validGpsFix: false, observedAt: "2026-10-12T16:44:00Z" },
    { ...freshGarmin, position: null, observedAt: "2026-10-12T16:44:00Z" },
    { kind: "unavailable", position: null, observedAt: null, trail: [] },
  ];
  for (const garmin of states) {
    const state = h.missionWillDisplayStateAt(idleTime, garmin);
    assertOnly(h.missionMarkerVisibility(state, true), "rv");
    assertOnly(h.missionMarkerVisibility(state, false), "none");
  }
});

test("Garmin II KML requires explicit Valid GPS Fix true and retains device metadata", () => {
  const point = (gpsField) => `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><TimeStamp><when>2026-10-12T16:45:00Z</when></TimeStamp><ExtendedData><Data name="Device Type"><value>inReach Mini 2</value></Data>${gpsField}</ExtendedData><Point><coordinates>-112.046663,43.492448,1445.01</coordinates></Point></Placemark></Document></kml>`;
  const valid = parseGarminFeed(point('<Data name="Valid GPS Fix"><value>True</value></Data>'), { nowMs: idleTime });
  assert.equal(valid.available, true);
  assert.equal(valid.validGpsFix, true);
  assert.equal(valid.deviceType, "inReach Mini 2");
  assert.deepEqual(valid.position, { lat: 43.492448, lng: -112.046663 });
  for (const gpsField of ['', '<Data name="Valid GPS Fix"><value>False</value></Data>']) {
    assert.deepEqual(parseGarminFeed(point(gpsField), { nowMs: idleTime }), { available: false, trail: [] });
  }
});

test("production rendering consumes one priority decision for runner, plane, and RV", () => {
  const render = namedFunction(candidate, "renderMissionMap");
  assert.match(render, /const markerVisibility = missionMarkerVisibility\(willDisplay, rvAllowed\)/);
  assert.match(render, /const showRvMarker = markerVisibility\.rv/);
  assert.match(render, /if \(markerVisibility\.plane\) appendFlightMarker/);
  assert.match(render, /const runnerPoint = markerVisibility\.runner/);
  assert.doesNotMatch(render, /const showRvMarker = rvMapVisible\(\)/);
});

test("flight itinerary, RV gates, polling, styling, and layout remain byte-identical", () => {
  for (const name of [
    "missionScheduledFlightAt", "missionPostFlightPlacementAt", "missionMarkerVisibility",
    "appendStaticFlightLegs", "scheduledFlightMarkerLeg", "appendFlightMarker",
    "createMissionGarminPoller", "rvMapVisible", "validMissionRvFix",
    "setMissionHapnLocation", "appendImageMarker", "startingMapViewBox", "initLiveMapLayoutFix",
  ]) assert.equal(sha256(namedFunction(candidate, name)), sha256(namedFunction(baseline, name)), name);
  for (const name of [
    "GARMIN_FRESH_MS", "GARMIN_MIN_REFRESH_MS", "MISSION_SCHEDULED_FLIGHTS",
    "MISSION_CLOCK_AIRPORT_STOPS", "RV_MAP_VISIBLE_FROM", "mapEntityAssets",
  ]) assert.equal(sha256(constStatement(candidate, name)), sha256(constStatement(baseline, name)), name);
});

test("production routes cache-bust only the new tracker and manifest pins the immutable Garmin module", () => {
  const oldTag = '<script defer src="/assets/tracker-base.js?v=20261011flight-itinerary-rows-04-08"></script>';
  const newTag = '<script defer src="/assets/tracker-base.js?v=20261012garmin-ii-priority"></script>';
  const baselineHome = read("flight-itinerary-rows-04-08-release-2026-10-11-index.html");
  const baselineLive = read("flight-itinerary-rows-04-08-release-2026-10-11-live-tracking.html");
  const candidateHome = read("garmin-ii-priority-release-2026-10-12-index.html");
  const candidateLive = read("garmin-ii-priority-release-2026-10-12-live-tracking.html");
  assert.equal(candidateHome, baselineHome.replace(oldTag, newTag));
  assert.equal(candidateLive, baselineLive.replace(oldTag, newTag));
  assert.match(candidate, /GARMIN_KML_MODULE_URL = "\/tracking-preview\/assets\/garmin-kml-af3a85bfc4b14a78\.mjs"/);
  assert.deepEqual(manifest.files.map(({ destination, expectedRemoteAbsent }) => ({ destination, expectedRemoteAbsent }))[0], {
    destination: "public_html/tracking-preview/assets/garmin-kml-af3a85bfc4b14a78.mjs",
    expectedRemoteAbsent: true,
  });
});
