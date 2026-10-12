import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import { GARMIN_REQUEST_TIMEOUT_MS } from "../assets/releases/live-map-garmin-ii-priority-2026-10-12/tracking-preview/assets/garmin-kml-af3a85bfc4b14a78.mjs";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const baselinePath = "assets/releases/live-map-garmin-ii-priority-2026-10-12/tracker-base.js";
const candidatePath = "assets/releases/live-map-garmin-startup-gate-2026-10-12/tracker-base.js";
const baseline = read(baselinePath);
const candidate = read(candidatePath);
const manifest = JSON.parse(read("deploy/manifests/releases/live-map-garmin-startup-gate-2026-10-12.json"));

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
    let missionGarminRunner = { kind: "connecting", position: null, observedAt: null, trail: [] };
    ${namedFunction(candidate, "missionScheduledFlightAt")}
    ${namedFunction(candidate, "missionGarminLiveFreshAt")}
    ${namedFunction(candidate, "missionWillDisplayStateAt")}
    ${namedFunction(candidate, "missionMarkerVisibility")}
    return { missionWillDisplayStateAt, missionMarkerVisibility };
  `)();
}

const flightTime = Date.parse("2026-10-16T10:00:00Z");
const idleTime = Date.parse("2026-10-12T17:10:00Z");
const freshGarmin = {
  available: true,
  validGpsFix: true,
  deviceType: "inReach Mini 2",
  kind: "fresh",
  position: { lat: 43.50733, lng: -112.050225 },
  observedAt: "2026-10-12T17:09:00Z",
  trail: [],
};
const unavailableGarmin = {
  kind: "unavailable",
  connection: "unavailable",
  position: null,
  observedAt: null,
  trail: [],
};

function assertOnly(visibility, expected) {
  assert.equal(Object.values(visibility).filter(Boolean).length, expected === "none" ? 0 : 1);
  assert.deepEqual(visibility, {
    runner: expected === "runner",
    plane: expected === "plane",
    rv: expected === "rv",
  });
}

test("initial Garmin connecting state renders no RV, plane, or runner fallback", () => {
  const h = priorityHarness();
  const connecting = { kind: "connecting", position: null, observedAt: null, trail: [] };
  for (const now of [idleTime, flightTime]) {
    const state = h.missionWillDisplayStateAt(now, connecting);
    assert.equal(state.kind, "connecting");
    assertOnly(h.missionMarkerVisibility(state, true), "none");
  }
});

test("fresh Garmin II on the first response renders the Garmin runner only", () => {
  const h = priorityHarness();
  const state = h.missionWillDisplayStateAt(idleTime, freshGarmin);
  assert.equal(state.kind, "fresh");
  assert.equal(state.source, "garmin");
  assertOnly(h.missionMarkerVisibility(state, true), "runner");
});

test("Garmin timeout or unavailability falls back to the active scheduled flight", () => {
  const h = priorityHarness();
  const state = h.missionWillDisplayStateAt(flightTime, unavailableGarmin);
  assert.equal(state.kind, "flight");
  assertOnly(h.missionMarkerVisibility(state, true), "plane");
});

test("Garmin timeout or unavailability falls back to RV when no flight is active", () => {
  const h = priorityHarness();
  const state = h.missionWillDisplayStateAt(idleTime, unavailableGarmin);
  assert.equal(state.kind, "unavailable");
  assertOnly(h.missionMarkerVisibility(state, true), "rv");
  assertOnly(h.missionMarkerVisibility(state, false), "none");
});

test("fresh Garmin II hides both plane and RV and every resolved state has at most one icon", () => {
  const h = priorityHarness();
  const freshDuringFlight = {
    ...freshGarmin,
    observedAt: "2026-10-16T09:59:00Z",
  };
  const states = [
    [h.missionWillDisplayStateAt(flightTime, freshDuringFlight), true, "runner"],
    [h.missionWillDisplayStateAt(flightTime, unavailableGarmin), true, "plane"],
    [h.missionWillDisplayStateAt(idleTime, unavailableGarmin), true, "rv"],
    [h.missionWillDisplayStateAt(idleTime, unavailableGarmin), false, "none"],
  ];
  for (const [state, rvAllowed, expected] of states) {
    assertOnly(h.missionMarkerVisibility(state, rvAllowed), expected);
  }
});

test("startup gate uses the existing Garmin request timeout and resolution callbacks", () => {
  assert.equal(GARMIN_REQUEST_TIMEOUT_MS, 8_000);
  assert.match(candidate, /let missionGarminRunner = \{ kind: "connecting"/);
  const load = namedFunction(candidate, "loadMissionMap");
  assert.match(load, /load: \(\) => garminModule\.loadGarminRunnerLocation\(\)/);
  assert.match(load, /onData: \(result\) => setMissionGarminLocation\(result, "connected"\)/);
  assert.match(load, /onFailure: \(\) => setMissionGarminLocation\(null, "unavailable"\)/);
  assert.match(namedFunction(candidate, "setMissionGarminLocation"), /renderMissionMap\(missionMapTopology, true\)/);
});

test("only startup selection changes; feeds, schedules, polling, styling, and layout remain unchanged", () => {
  for (const name of [
    "missionScheduledFlightAt", "missionPostFlightPlacementAt", "missionGarminLiveFreshAt",
    "validMissionGarminFix", "setMissionGarminLocation", "createMissionGarminPoller",
    "appendStaticFlightLegs", "scheduledFlightMarkerLeg", "appendFlightMarker",
    "rvMapVisible", "validMissionRvFix", "setMissionHapnLocation", "appendImageMarker",
    "startingMapViewBox", "initLiveMapLayoutFix", "loadMissionMap",
  ]) assert.equal(sha256(namedFunction(candidate, name)), sha256(namedFunction(baseline, name)), name);
  for (const name of [
    "GARMIN_FRESH_MS", "GARMIN_MIN_REFRESH_MS", "GARMIN_KML_MODULE_URL",
    "MISSION_SCHEDULED_FLIGHTS", "MISSION_CLOCK_AIRPORT_STOPS", "RV_MAP_VISIBLE_FROM", "mapEntityAssets",
  ]) assert.equal(sha256(constStatement(candidate, name)), sha256(constStatement(baseline, name)), name);
});

test("live production pages change only the tracker cache key", () => {
  const oldTag = '<script defer src="/assets/tracker-base.js?v=20261012garmin-ii-priority"></script>';
  const newTag = '<script defer src="/assets/tracker-base.js?v=20261012garmin-startup-gate"></script>';
  const baselineHome = read("garmin-ii-priority-release-2026-10-12-index.html");
  const baselineLive = read("garmin-ii-priority-release-2026-10-12-live-tracking.html");
  const candidateHome = read("garmin-startup-gate-release-2026-10-12-index.html");
  const candidateLive = read("garmin-startup-gate-release-2026-10-12-live-tracking.html");
  assert.equal(candidateHome, baselineHome.replace(oldTag, newTag));
  assert.equal(candidateLive, baselineLive.replace(oldTag, newTag));
});

test("release manifest pins only the tracker and two live-page cache-key documents", () => {
  assert.equal(manifest.releaseType, "standard");
  assert.deepEqual(manifest.protectedPathsApproved, ["public_html/assets/tracker-base.js"]);
  assert.deepEqual(manifest.files.map(({ source, destination, expectedSha256, expectedRemoteSha256 }) => ({
    source, destination, expectedSha256, expectedRemoteSha256,
  })), [
    {
      source: candidatePath,
      destination: "public_html/assets/tracker-base.js",
      expectedSha256: sha256(candidate),
      expectedRemoteSha256: sha256(baseline),
    },
    {
      source: "garmin-startup-gate-release-2026-10-12-index.html",
      destination: "public_html/index.html",
      expectedSha256: sha256(read("garmin-startup-gate-release-2026-10-12-index.html")),
      expectedRemoteSha256: sha256(read("garmin-ii-priority-release-2026-10-12-index.html")),
    },
    {
      source: "garmin-startup-gate-release-2026-10-12-live-tracking.html",
      destination: "public_html/live-tracking.html",
      expectedSha256: sha256(read("garmin-startup-gate-release-2026-10-12-live-tracking.html")),
      expectedRemoteSha256: sha256(read("garmin-ii-priority-release-2026-10-12-live-tracking.html")),
    },
  ]);
  assert.doesNotMatch(JSON.stringify(manifest.files), /garmin-feed|\.htaccess|strava-race-map\.mjs|tracker-base\.css/i);
});
