import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const baselinePath = "assets/releases/live-map-scheduled-flights-2026-10-10/tracker-base.js";
const candidatePath = "assets/releases/mission-clock-dynamic-subtext-2026-10-10/tracker-base.js";
const baseline = read(baselinePath);
const candidate = read(candidatePath);
const baselineHome = read("flight-schedule-release-2026-10-10-index.html");
const baselineLive = read("flight-schedule-release-2026-10-10-live-tracking.html");
const candidateHome = read("mission-clock-dynamic-release-2026-10-10-index.html");
const candidateLive = read("mission-clock-dynamic-release-2026-10-10-live-tracking.html");
const manifest = JSON.parse(read("deploy/manifests/releases/mission-clock-dynamic-subtext-2026-10-10.json"));

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

function clockHarness() {
  return new Function(`
    ${constStatement(candidate, "staticRouteStops")}
    let routeStops = staticRouteStops;
    let missionTrackingStatusSnapshot = null;
    let missionGarminRunner = { kind: "stale", position: { lat: 21.3187, lng: -157.9225 }, observedAt: "2026-10-09T22:55:00-10:00", trail: [] };
    const startDate = new Date("2026-10-09T15:00:00-10:00");
    const endDate = new Date("2026-11-01T23:59:59-05:00");
    ${constStatement(candidate, "MISSION_SCHEDULED_FLIGHTS")}
    ${constStatement(candidate, "MISSION_CLOCK_AIRPORT_STOPS")}
    ${constStatement(candidate, "flightAirports")}
    ${namedFunction(candidate, "missionScheduledFlightAt")}
    ${namedFunction(candidate, "missionPostFlightPlacementAt")}
    ${namedFunction(candidate, "missionWindowStateAt")}
    ${namedFunction(candidate, "missionClockCompletedRaces")}
    ${namedFunction(candidate, "missionClockFallbackStopAt")}
    ${namedFunction(candidate, "missionClockStopForAirport")}
    ${namedFunction(candidate, "missionClockSubtextAt")}
    return { missionClockSubtextAt, routeStops };
  `)();
}

test("before mission start the existing Honolulu launch copy remains", () => {
  const clock = clockHarness();
  assert.equal(
    clock.missionClockSubtextAt(Date.parse("2026-10-09T14:59:59-10:00")),
    "October 9, 2026 · Honolulu",
  );
});

test("during HNL to ANC the clock shows the scheduled in-transit states and cities", () => {
  const clock = clockHarness();
  assert.equal(
    clock.missionClockSubtextAt(Date.parse("2026-10-10T04:00:00-08:00")),
    "In transit: Hawaii / Honolulu → Alaska / Anchorage",
  );
});

test("after HNL to ANC arrival the clock shows Anchorage before a new Garmin fix", () => {
  const clock = clockHarness();
  assert.equal(
    clock.missionClockSubtextAt(Date.parse("2026-10-10T07:22:00-08:00")),
    "Current: Alaska · Anchorage",
  );
});

test("completedRaces selects the next incomplete race without stale coordinate inference", () => {
  const clock = clockHarness();
  const postArrivalFix = {
    kind: "fresh",
    position: { lat: 61.2, lng: -149.9 },
    observedAt: "2026-10-10T07:23:00-08:00",
    trail: [],
  };
  const subtext = clock.missionClockSubtextAt(
    Date.parse("2026-10-10T08:00:00-08:00"),
    { completedRaces: 1, totalRaces: 50 },
    postArrivalFix,
  );
  assert.equal(subtext, "Current: Alaska · Anchorage");
  assert.doesNotMatch(subtext, /Hawaii|Honolulu/);
});

test("after the mission window the clock shows completion copy", () => {
  const clock = clockHarness();
  assert.equal(
    clock.missionClockSubtextAt(Date.parse("2026-11-02T00:00:00-05:00")),
    "50 states complete · New York City",
  );
});

test("both production pages expose the same dynamic clock target and cache key", () => {
  const oldTag = '<script defer src="/assets/tracker-base.js?v=20261010scheduled-flights"></script>';
  const newTag = '<script defer src="/assets/tracker-base.js?v=20261010dynamic-subtext"></script>';
  const oldCopy = '<p class="tracker-panel-copy">October 9, 2026 · Honolulu</p>';
  const newCopy = '<p class="tracker-panel-copy" data-mission-clock-subtext aria-live="polite">October 9, 2026 · Honolulu</p>';
  assert.equal(candidateHome, baselineHome.replace(oldTag, newTag).replace(oldCopy, newCopy));
  assert.equal(candidateLive, baselineLive.replace(oldTag, newTag).replace(oldCopy, newCopy));
  assert.equal(candidateHome, candidateLive);
  assert.match(candidate, /subtext\.textContent = missionClockSubtextAt\(nowMs\)/);
});

test("Garmin routing, cadence, flight priority, route lines, and security scope stay unchanged", () => {
  assert.match(candidate, /GARMIN_KML_MODULE_URL = "\/tracking-preview\/assets\/garmin-kml-3deff4779671db1e\.mjs"/);
  assert.match(candidate, /GARMIN_MIN_REFRESH_MS = 120_000/);
  for (const name of [
    "loadMissionTrackingStatus",
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
  assert.equal((candidate.match(/\/strava\/public\/tracking-status/g) || []).length, 1);
  assert.doesNotMatch(candidate, /\/strava\/public\/(?:races|race-status)/);
  assert.doesNotMatch(candidate, /frame-ancestors|Content-Security-Policy/i);
});

test("deployment manifest pins only the shared tracker and the two page documents", () => {
  assert.equal(manifest.releaseType, "micro");
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
      source: "mission-clock-dynamic-release-2026-10-10-index.html",
      destination: "public_html/index.html",
      expectedSha256: sha256(candidateHome),
      expectedRemoteSha256: sha256(baselineHome),
    },
    {
      source: "mission-clock-dynamic-release-2026-10-10-live-tracking.html",
      destination: "public_html/live-tracking.html",
      expectedSha256: sha256(candidateLive),
      expectedRemoteSha256: sha256(baselineLive),
    },
  ]);
  assert.doesNotMatch(JSON.stringify(manifest.files), /garmin-feed|\.htaccess|strava-race-map|tracker-base\.css/i);
});
