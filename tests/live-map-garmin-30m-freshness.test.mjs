import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const baselinePath = "assets/releases/live-map-garmin-startup-gate-2026-10-12/tracker-base.js";
const candidatePath = "assets/releases/live-map-garmin-30m-freshness-2026-10-15/tracker-base.js";
const baseline = read(baselinePath);
const candidate = read(candidatePath);
const manifest = JSON.parse(read("deploy/manifests/releases/live-map-garmin-30m-freshness-2026-10-15.json"));

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
    ${constStatement(candidate, "GARMIN_FRESH_MS")}
    ${constStatement(candidate, "MISSION_SCHEDULED_FLIGHTS")}
    let missionGarminRunner = { kind: "connecting", position: null, observedAt: null, trail: [] };
    ${namedFunction(candidate, "missionScheduledFlightAt")}
    ${namedFunction(candidate, "missionGarminLiveFreshAt")}
    ${namedFunction(candidate, "missionWillDisplayStateAt")}
    ${namedFunction(candidate, "missionMarkerVisibility")}
    return { missionGarminLiveFreshAt, missionWillDisplayStateAt, missionMarkerVisibility };
  `)();
}

const idleTime = Date.parse("2026-10-15T12:00:00Z");
const flightTime = Date.parse("2026-10-16T10:00:00Z");

function garminPointAtAge(nowMs, ageMinutes) {
  return {
    available: true,
    validGpsFix: true,
    deviceType: "inReach Mini 2",
    kind: ageMinutes > 10 ? "stale" : "fresh",
    position: { lat: 43.6301, lng: -116.2404 },
    observedAt: new Date(nowMs - ageMinutes * 60_000).toISOString(),
    trail: [],
  };
}

function assertOnly(visibility, expected) {
  assert.equal(Object.values(visibility).filter(Boolean).length, expected === "none" ? 0 : 1);
  assert.deepEqual(visibility, {
    runner: expected === "runner",
    plane: expected === "plane",
    rv: expected === "rv",
  });
}

test("valid Garmin II points aged 9, 15, 29, and 30 minutes keep the runner only", () => {
  const h = priorityHarness();
  for (const ageMinutes of [9, 15, 29, 30]) {
    const garmin = garminPointAtAge(idleTime, ageMinutes);
    assert.equal(h.missionGarminLiveFreshAt(idleTime, garmin), true, `${ageMinutes} minutes`);
    const state = h.missionWillDisplayStateAt(idleTime, garmin);
    assert.equal(state.kind, "fresh", `${ageMinutes} minutes`);
    assert.equal(state.source, "garmin", `${ageMinutes} minutes`);
    assertOnly(h.missionMarkerVisibility(state, true), "runner");
  }
});

test("a valid Garmin II point exactly 30 minutes old still hides an active flight and RV", () => {
  const h = priorityHarness();
  const garmin = garminPointAtAge(flightTime, 30);
  const state = h.missionWillDisplayStateAt(flightTime, garmin);
  assert.equal(state.activeFlightWindow, true);
  assertOnly(h.missionMarkerVisibility(state, true), "runner");
});

test("a Garmin II point 31 minutes old falls through to the active scheduled flight", () => {
  const h = priorityHarness();
  const garmin = garminPointAtAge(flightTime, 31);
  assert.equal(h.missionGarminLiveFreshAt(flightTime, garmin), false);
  const state = h.missionWillDisplayStateAt(flightTime, garmin);
  assert.equal(state.kind, "flight");
  assertOnly(h.missionMarkerVisibility(state, true), "plane");
});

test("a Garmin II point 31 minutes old falls through to the existing RV gate without a flight", () => {
  const h = priorityHarness();
  const garmin = garminPointAtAge(idleTime, 31);
  const state = h.missionWillDisplayStateAt(idleTime, garmin);
  assert.equal(state.kind, "stale");
  assertOnly(h.missionMarkerVisibility(state, true), "rv");
  assertOnly(h.missionMarkerVisibility(state, false), "none");
});

test("one-icon priority remains enforced in every resolved boundary state", () => {
  const h = priorityHarness();
  for (const [nowMs, ageMinutes, expected] of [
    [idleTime, 9, "runner"],
    [idleTime, 15, "runner"],
    [idleTime, 29, "runner"],
    [idleTime, 30, "runner"],
    [flightTime, 31, "plane"],
    [idleTime, 31, "rv"],
  ]) {
    const state = h.missionWillDisplayStateAt(nowMs, garminPointAtAge(nowMs, ageMinutes));
    assertOnly(h.missionMarkerVisibility(state, true), expected);
  }
});

test("initial connecting state still renders no fallback icon", () => {
  const h = priorityHarness();
  const state = h.missionWillDisplayStateAt(idleTime, {
    kind: "connecting", position: null, observedAt: null, trail: [],
  });
  assertOnly(h.missionMarkerVisibility(state, true), "none");
});

test("the live selector owns the 30-minute threshold even when the shared parser labels a point stale", () => {
  assert.equal(constStatement(candidate, "GARMIN_FRESH_MS"), "const GARMIN_FRESH_MS = 30 * 60_000;");
  const freshness = namedFunction(candidate, "missionGarminLiveFreshAt");
  assert.doesNotMatch(freshness, /garminRunner\?\.kind === "fresh"/);
  assert.match(freshness, /now - observedMs <= GARMIN_FRESH_MS/);
});

test("polling, routes, tracks, static markers, schedules, styling, and startup behavior remain unchanged", () => {
  for (const name of [
    "missionScheduledFlightAt", "missionPostFlightPlacementAt", "missionWillDisplayStateAt",
    "missionMarkerVisibility", "validMissionGarminFix", "setMissionGarminLocation",
    "createMissionGarminPoller", "missionGarminTrailPoints", "appendStaticFlightLegs",
    "scheduledFlightMarkerLeg", "appendFlightMarker", "rvMapVisible", "validMissionRvFix",
    "setMissionHapnLocation", "appendImageMarker", "startingMapViewBox", "initLiveMapLayoutFix", "loadMissionMap",
  ]) assert.equal(sha256(namedFunction(candidate, name)), sha256(namedFunction(baseline, name)), name);
  for (const name of [
    "GARMIN_MIN_REFRESH_MS", "GARMIN_KML_MODULE_URL", "MISSION_SCHEDULED_FLIGHTS",
    "MISSION_CLOCK_AIRPORT_STOPS", "RV_MAP_VISIBLE_FROM", "mapEntityAssets", "staticRouteStops",
  ]) assert.equal(sha256(constStatement(candidate, name)), sha256(constStatement(baseline, name)), name);
});

test("production pages change only the tracker cache key", () => {
  const oldTag = '<script defer src="/assets/tracker-base.js?v=20261012garmin-startup-gate"></script>';
  const newTag = '<script defer src="/assets/tracker-base.js?v=20261015garmin-30m-freshness"></script>';
  const baselineHome = read("garmin-startup-gate-release-2026-10-12-index.html");
  const baselineLive = read("garmin-startup-gate-release-2026-10-12-live-tracking.html");
  const candidateHome = read("garmin-30m-freshness-release-2026-10-15-index.html");
  const candidateLive = read("garmin-30m-freshness-release-2026-10-15-live-tracking.html");
  assert.equal(candidateHome, baselineHome.replace(oldTag, newTag));
  assert.equal(candidateLive, baselineLive.replace(oldTag, newTag));
});

test("release manifest pins only the live tracker and two cache-key pages", () => {
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
      source: "garmin-30m-freshness-release-2026-10-15-index.html",
      destination: "public_html/index.html",
      expectedSha256: sha256(read("garmin-30m-freshness-release-2026-10-15-index.html")),
      expectedRemoteSha256: sha256(read("garmin-startup-gate-release-2026-10-12-index.html")),
    },
    {
      source: "garmin-30m-freshness-release-2026-10-15-live-tracking.html",
      destination: "public_html/live-tracking.html",
      expectedSha256: sha256(read("garmin-30m-freshness-release-2026-10-15-live-tracking.html")),
      expectedRemoteSha256: sha256(read("garmin-startup-gate-release-2026-10-12-live-tracking.html")),
    },
  ]);
  assert.doesNotMatch(JSON.stringify(manifest.files), /garmin-feed|\.htaccess|strava-race-map\.mjs|tracker-base\.css/i);
});
