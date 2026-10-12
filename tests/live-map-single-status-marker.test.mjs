import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const baselinePath = "assets/releases/strava-public-race-feed-2026-10-11/tracker-base.js";
const candidatePath = "assets/releases/live-map-single-status-marker-2026-10-11/tracker-base.js";
const baseline = read(baselinePath);
const candidate = read(candidatePath);
const baselineHome = read("strava-public-race-feed-release-2026-10-11-index.html");
const baselineLive = read("strava-public-race-feed-release-2026-10-11-live-tracking.html");
const candidateHome = read("single-status-marker-release-2026-10-11-index.html");
const candidateLive = read("single-status-marker-release-2026-10-11-live-tracking.html");
const manifest = JSON.parse(read("deploy/manifests/releases/live-map-single-status-marker-2026-10-11.json"));

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
    ${namedFunction(candidate, "missionWillDisplayStateAt")}
    ${namedFunction(candidate, "missionMarkerVisibility")}
    return { missionWillDisplayStateAt, missionMarkerVisibility };
  `)();
}

const flightTime = Date.parse("2026-10-11T18:00:00-07:00");
const idleTime = Date.parse("2026-10-11T12:00:00-07:00");
const freshRunner = {
  kind: "fresh",
  position: { lat: 45.52, lng: -122.68 },
  observedAt: "2026-10-11T17:59:00-07:00",
  trail: [{ lat: 45.51, lng: -122.67 }],
};
const staleRunner = {
  kind: "stale",
  position: { lat: 45.52, lng: -122.68 },
  observedAt: "2026-10-11T10:00:00-07:00",
  trail: [{ lat: 45.51, lng: -122.67 }],
};
const invalidRunner = {
  kind: "fresh",
  position: { lat: Number.NaN, lng: null },
  observedAt: "invalid",
  trail: [],
};

test("an active run wins and hides both the scheduled plane and eligible RV", () => {
  const h = priorityHarness();
  const state = h.missionWillDisplayStateAt(flightTime, freshRunner);
  assert.equal(state.kind, "fresh");
  assert.equal(state.activeFlightWindow, true);
  assert.deepEqual(h.missionMarkerVisibility(state, true), {
    runner: true,
    plane: false,
    rv: false,
  });
});

test("an active scheduled flight wins and hides both runner and eligible RV", () => {
  const h = priorityHarness();
  const state = h.missionWillDisplayStateAt(flightTime, staleRunner);
  assert.equal(state.kind, "flight");
  assert.equal(state.flight.from, "PDX");
  assert.equal(state.flight.to, "SLC");
  assert.deepEqual(h.missionMarkerVisibility(state, true), {
    runner: false,
    plane: true,
    rv: false,
  });
});

test("idle state shows only the RV and only when the existing RV gate allows it", () => {
  const h = priorityHarness();
  const state = h.missionWillDisplayStateAt(idleTime, staleRunner);
  assert.equal(state.kind, "stale");
  assert.equal(state.showRunner, false);
  assert.deepEqual(h.missionMarkerVisibility(state, true), {
    runner: false,
    plane: false,
    rv: true,
  });
  assert.deepEqual(h.missionMarkerVisibility(state, false), {
    runner: false,
    plane: false,
    rv: false,
  });
});

test("stale or invalid runner data cannot block the scheduled plane or eligible RV", () => {
  const h = priorityHarness();
  for (const runner of [staleRunner, invalidRunner]) {
    const flightState = h.missionWillDisplayStateAt(flightTime, runner);
    assert.deepEqual(h.missionMarkerVisibility(flightState, true), {
      runner: false,
      plane: true,
      rv: false,
    });

    const idleState = h.missionWillDisplayStateAt(idleTime, runner);
    assert.deepEqual(h.missionMarkerVisibility(idleState, true), {
      runner: false,
      plane: false,
      rv: true,
    });
  }
});

test("production rendering consumes the single-marker decision for every moving marker", () => {
  const render = namedFunction(candidate, "renderMissionMap");
  assert.match(render, /const rvAllowed = rvMapVisible\(\)/);
  assert.match(render, /const markerVisibility = missionMarkerVisibility\(willDisplay, rvAllowed\)/);
  assert.match(render, /const showRvMarker = markerVisibility\.rv/);
  assert.match(render, /const displayedRvPosition = rvAllowed \?/);
  assert.match(render, /if \(markerVisibility\.plane\) appendFlightMarker/);
  assert.match(render, /const runnerPoint = markerVisibility\.runner/);
  assert.doesNotMatch(render, /const showRvMarker = rvMapVisible\(\)/);
  assert.doesNotMatch(render, /const runnerPoint = willDisplay\.showRunner/);
});

test("flight schedules, paths, Garmin and Strava freshness, RV rules, styling, and layout stay unchanged", () => {
  for (const name of [
    "missionScheduledFlightAt",
    "missionPostFlightPlacementAt",
    "appendStaticFlightLegs",
    "scheduledFlightMarkerLeg",
    "appendFlightMarker",
    "validMissionGarminFix",
    "setMissionGarminLocation",
    "createMissionGarminPoller",
    "applyMissionRaceSnapshot",
    "rvMapVisible",
    "missionAirportPlacementsAt",
    "validMissionRvFix",
    "setMissionHapnLocation",
    "appendImageMarker",
    "startingMapViewBox",
    "initLiveMapLayoutFix",
  ]) {
    assert.equal(sha256(namedFunction(candidate, name)), sha256(namedFunction(baseline, name)), name);
  }
  for (const name of [
    "GARMIN_FRESH_MS",
    "MISSION_SCHEDULED_FLIGHTS",
    "MISSION_AIRPORT_PLACEMENTS",
    "RV_MAP_VISIBLE_FROM",
    "mapEntityAssets",
  ]) {
    assert.equal(sha256(constStatement(candidate, name)), sha256(constStatement(baseline, name)), name);
  }
});

test("both live production routes change only the tracker cache key", () => {
  const oldTag = '<script defer src="/assets/tracker-base.js?v=20261011strava-races"></script>';
  const newTag = '<script defer src="/assets/tracker-base.js?v=20261011single-status-marker"></script>';
  assert.equal(candidateHome, baselineHome.replace(oldTag, newTag));
  assert.equal(candidateLive, baselineLive.replace(oldTag, newTag));
  assert.equal(candidateHome, candidateLive);
});

test("the standard release pins only the production tracker and its two cache-key documents", () => {
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
      source: "single-status-marker-release-2026-10-11-index.html",
      destination: "public_html/index.html",
      expectedSha256: sha256(candidateHome),
      expectedRemoteSha256: sha256(baselineHome),
    },
    {
      source: "single-status-marker-release-2026-10-11-live-tracking.html",
      destination: "public_html/live-tracking.html",
      expectedSha256: sha256(candidateLive),
      expectedRemoteSha256: sha256(baselineLive),
    },
  ]);
  assert.doesNotMatch(JSON.stringify(manifest.files), /garmin-feed|\.htaccess|strava-race-map\.mjs|tracker-base\.css/i);
});
