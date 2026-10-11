import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const baselinePath = "assets/releases/mission-clock-dynamic-subtext-2026-10-10/tracker-base.js";
const candidatePath = "assets/releases/strava-public-race-feed-2026-10-11/tracker-base.js";
const baseline = read(baselinePath);
const candidate = read(candidatePath);
const baselineHome = read("mission-clock-dynamic-release-2026-10-10-index.html");
const baselineLive = read("mission-clock-dynamic-release-2026-10-10-live-tracking.html");
const candidateHome = read("strava-public-race-feed-release-2026-10-11-index.html");
const candidateLive = read("strava-public-race-feed-release-2026-10-11-live-tracking.html");
const publicRaceModule = read("assets/strava-race-map.mjs");
const manifest = JSON.parse(read("deploy/manifests/releases/strava-public-race-feed-2026-10-11.json"));

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

test("the production tracker consumes only validated public race snapshots", () => {
  const harness = new Function(`
    let routeStops = [];
    let missionRaceSnapshotSignature = null;
    let missionMapTopology = { ready: true };
    const calls = [];
    const map = { setAttribute: (...values) => calls.push(["aria", ...values]) };
    const document = { getElementById: () => map };
    const window = {};
    const renderRunItinerary = () => calls.push(["itinerary"]);
    const updateCountdown = () => calls.push(["clock"]);
    const renderMissionMap = (...values) => calls.push(["map", ...values]);
    ${namedFunction(candidate, "applyMissionRaceSnapshot")}
    return {
      applyMissionRaceSnapshot,
      state: () => ({ routeStops, missionRaceSnapshotSignature, calls, window })
    };
  `)();
  harness.applyMissionRaceSnapshot({ source: "static", races: [], status: { completedRaces: 0, totalRaces: 50 } });
  assert.deepEqual(harness.state().calls, []);

  const races = Array.from({ length: 50 }, (_, index) => ({
    n: index + 1,
    raceId: `ggma-2026-${String(index + 1).padStart(2, "0")}`,
    status: index < 3 ? "completed" : "scheduled",
    activity: index < 3 ? { stravaActivityId: String(20522781394 + index) } : null,
  }));
  const snapshot = {
    source: "api",
    races,
    status: { active: true, completedRaces: 3, totalRaces: 50 },
  };
  harness.applyMissionRaceSnapshot(snapshot);
  const state = harness.state();
  assert.strictEqual(state.routeStops, races);
  assert.deepEqual(state.window.missionRaceStatus, { ...snapshot.status, source: "api" });
  assert.deepEqual(state.calls.map((call) => call[0]), ["itinerary", "clock", "aria", "map"]);
  assert.match(state.calls.find((call) => call[0] === "aria")[2], /3 of 50 races completed/);

  harness.applyMissionRaceSnapshot(snapshot);
  assert.equal(harness.state().calls.length, 4, "an unchanged poll must not rerender the live map");
});

test("the deployed-compatible race module retains last-good API data during fallback", () => {
  assert.match(candidate, /STRAVA_RACE_MODULE_URL = "\/assets\/strava-race-map\.mjs"/);
  assert.match(candidate, /createPublicRacePoller/);
  assert.match(candidate, /loadPublicRaceSnapshot\(\{ staticStops: staticRouteStops \}\)/);
  assert.match(publicRaceModule, /let lastGoodSnapshot = null/);
  assert.match(publicRaceModule, /if \(snapshot\?\.source === "api"\)/);
});

test("Garmin, flights, RV, marker priority, and map rendering remain byte-identical", () => {
  for (const name of [
    "loadMissionTrackingStatus",
    "loadMissionRvLocation",
    "createMissionRvPoller",
    "validMissionGarminFix",
    "setMissionGarminLocation",
    "createMissionGarminPoller",
    "missionScheduledFlightAt",
    "missionPostFlightPlacementAt",
    "missionWillDisplayStateAt",
    "appendStaticFlightLegs",
    "routePathWithoutFlightTransitions",
    "renderMissionMap",
  ]) {
    assert.equal(sha256(namedFunction(candidate, name)), sha256(namedFunction(baseline, name)), name);
  }
  for (const name of [
    "GARMIN_KML_MODULE_URL",
    "GARMIN_MIN_REFRESH_MS",
    "GARMIN_FRESH_MS",
    "RV_LOCATION_ENDPOINT",
    "RV_REFRESH_MS",
    "MISSION_AIRPORT_PLACEMENTS",
    "MISSION_SCHEDULED_FLIGHTS",
  ]) {
    assert.equal(sha256(constStatement(candidate, name)), sha256(constStatement(baseline, name)), name);
  }
  assert.doesNotMatch(candidate, /frame-ancestors|Content-Security-Policy/i);
});

test("both live production routes change only the tracker cache key", () => {
  const oldTag = '<script defer src="/assets/tracker-base.js?v=20261010dynamic-subtext"></script>';
  const newTag = '<script defer src="/assets/tracker-base.js?v=20261011strava-races"></script>';
  assert.equal(candidateHome, baselineHome.replace(oldTag, newTag));
  assert.equal(candidateLive, baselineLive.replace(oldTag, newTag));
  assert.equal(candidateHome, candidateLive);
});

test("the standard deployment pins the exact three existing production files", () => {
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
      source: "strava-public-race-feed-release-2026-10-11-index.html",
      destination: "public_html/index.html",
      expectedSha256: sha256(candidateHome),
      expectedRemoteSha256: sha256(baselineHome),
    },
    {
      source: "strava-public-race-feed-release-2026-10-11-live-tracking.html",
      destination: "public_html/live-tracking.html",
      expectedSha256: sha256(candidateLive),
      expectedRemoteSha256: sha256(baselineLive),
    },
  ]);
  assert.doesNotMatch(JSON.stringify(manifest.files), /garmin-feed|\.htaccess|strava-race-map\.mjs|tracker-base\.css/i);
});
