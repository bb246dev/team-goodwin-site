import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const baseline = read("assets/releases/mission-clock-honolulu-start-2026-10-09/tracker-base.js");
const candidatePath = "assets/releases/live-map-scheduled-flights-2026-10-10/tracker-base.js";
const candidate = read(candidatePath);
const baselineHome = read("mission-clock-release-2026-10-09-index.html");
const baselineLive = read("mission-clock-release-2026-10-09-live-tracking.html");
const candidateHome = read("flight-schedule-release-2026-10-10-index.html");
const candidateLive = read("flight-schedule-release-2026-10-10-live-tracking.html");
const manifest = JSON.parse(read("deploy/manifests/releases/live-map-scheduled-flights-2026-10-10.json"));

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

function stateHarness() {
  return new Function(`
    const GARMIN_FRESH_MS = 10 * 60_000;
    ${constStatement(candidate, "MISSION_SCHEDULED_FLIGHTS")}
    ${constStatement(candidate, "flightAirports")}
    let missionGarminRunner = { kind: "unavailable", position: null, observedAt: null, trail: [] };
    ${namedFunction(candidate, "missionScheduledFlightAt")}
    ${namedFunction(candidate, "missionPostFlightPlacementAt")}
    ${namedFunction(candidate, "missionWillDisplayStateAt")}
    return { MISSION_SCHEDULED_FLIGHTS, missionScheduledFlightAt, missionPostFlightPlacementAt, missionWillDisplayStateAt };
  `)();
}

const staleHawaii = {
  kind: "stale",
  position: { lat: 21.3187, lng: -157.9225 },
  observedAt: "2026-10-09T22:55:00-10:00",
  trail: [{ lat: 21.31, lng: -157.9 }],
};

test("the five scheduled flights use the supplied local offsets and half-open windows", () => {
  const h = stateHarness();
  assert.deepEqual(h.MISSION_SCHEDULED_FLIGHTS.map(({ from, to, start, end }) => ({ from, to, start, end })), [
    { from: "HNL", to: "ANC", start: "2026-10-09T23:11:00-10:00", end: "2026-10-10T07:22:00-08:00" },
    { from: "ANC", to: "PDX", start: "2026-10-10T15:51:00-08:00", end: "2026-10-10T20:35:00-07:00" },
    { from: "PDX", to: "SLC", start: "2026-10-11T17:15:00-07:00", end: "2026-10-11T20:10:00-06:00" },
    { from: "CMH", to: "LAX", start: "2026-10-20T19:03:00-04:00", end: "2026-10-20T21:11:00-07:00" },
    { from: "MIA", to: "ATL", start: "2026-10-24T16:21:00-04:00", end: "2026-10-24T18:24:00-04:00" },
  ]);
  for (const flight of h.MISSION_SCHEDULED_FLIGHTS) {
    const start = Date.parse(flight.start);
    const end = Date.parse(flight.end);
    assert.equal(h.missionScheduledFlightAt(start - 1), null, `${flight.from} before departure`);
    assert.equal(h.missionScheduledFlightAt(start)?.from, flight.from, `${flight.from} at departure`);
    assert.equal(h.missionScheduledFlightAt(end - 1)?.to, flight.to, `${flight.to} before arrival`);
    assert.equal(h.missionScheduledFlightAt(end), null, `${flight.to} at arrival`);
  }
});

test("during HNL to ANC stale Garmin is hidden and the scheduled plane is visible and moving", () => {
  const h = stateHarness();
  const departure = Date.parse("2026-10-09T23:11:00-10:00");
  const arrival = Date.parse("2026-10-10T07:22:00-08:00");
  const state = h.missionWillDisplayStateAt((departure + arrival) / 2, staleHawaii);
  assert.equal(state.kind, "flight");
  assert.equal(state.showRunner, false);
  assert.equal(state.showPlane, true);
  assert.equal(state.position, null);
  assert.equal(state.flight.from, "HNL");
  assert.equal(state.flight.to, "ANC");
  assert.equal(state.flight.status, "IN TRANSIT");
  assert.equal(state.flight.progress, 0.5);
});

test("after HNL to ANC arrival the plane hides and Will is placed at Anchorage", () => {
  const h = stateHarness();
  const state = h.missionWillDisplayStateAt(Date.parse("2026-10-10T07:22:00-08:00"), staleHawaii);
  assert.equal(state.kind, "scheduled");
  assert.equal(state.showRunner, true);
  assert.equal(state.showPlane, false);
  assert.equal(state.airportCode, "ANC");
  assert.equal(state.label, "Anchorage airport");
  assert.deepEqual(state.position, { lat: 61.1743, lng: -149.9985 });
});

test("fresh Garmin has first priority over active-flight and post-flight schedule state", () => {
  const h = stateHarness();
  const duringFlight = Date.parse("2026-10-10T04:00:00-08:00");
  const airborneFresh = {
    kind: "fresh", position: { lat: 47.2, lng: -153.1 },
    observedAt: "2026-10-10T03:59:00-08:00", trail: [],
  };
  const active = h.missionWillDisplayStateAt(duringFlight, airborneFresh);
  assert.equal(active.kind, "fresh");
  assert.equal(active.showRunner, true);
  assert.equal(active.showPlane, false);
  assert.equal(active.activeFlightWindow, true);

  const afterArrival = Date.parse("2026-10-10T07:24:00-08:00");
  const anchorageFresh = {
    kind: "fresh", position: { lat: 61.21, lng: -149.89 },
    observedAt: "2026-10-10T07:23:00-08:00", trail: [],
  };
  const arrived = h.missionWillDisplayStateAt(afterArrival, anchorageFresh);
  assert.equal(arrived.kind, "fresh");
  assert.equal(arrived.source, "garmin");
  assert.deepEqual(arrived.position, anchorageFresh.position);
});

test("stale Garmin cannot override active flight or a pending post-flight placement", () => {
  const h = stateHarness();
  const active = h.missionWillDisplayStateAt(Date.parse("2026-10-10T04:00:00-08:00"), staleHawaii);
  assert.equal(active.kind, "flight");
  assert.equal(active.showRunner, false);

  const arrived = h.missionWillDisplayStateAt(Date.parse("2026-10-10T07:30:00-08:00"), staleHawaii);
  assert.equal(arrived.kind, "scheduled");
  assert.equal(arrived.airportCode, "ANC");
  assert.notDeepEqual(arrived.position, staleHawaii.position);

  const laterFix = { ...staleHawaii, observedAt: "2026-10-10T07:23:00-08:00", position: { lat: 61.2, lng: -149.9 } };
  const afterNextFix = h.missionWillDisplayStateAt(Date.parse("2026-10-10T08:00:00-08:00"), laterFix);
  assert.equal(afterNextFix.kind, "stale");
  assert.equal(afterNextFix.source, "garmin");
  assert.deepEqual(afterNextFix.position, laterFix.position);
});

test("map rendering consumes the priority state without changing flight route lines", () => {
  const render = namedFunction(candidate, "renderMissionMap");
  assert.match(render, /const willDisplay = missionWillDisplayStateAt\(nowMs\)/);
  assert.match(render, /if \(willDisplay\.showPlane && willDisplay\.flight\)/);
  assert.match(render, /const runnerPoint = willDisplay\.showRunner/);
  assert.match(render, /runnerMarker\.dataset\.scheduledAirport = willDisplay\.airportCode/);
  assert.match(render, /appendFlightMarker\(flightLayer, svgNS, trackingData\.flight, centroids\)/);
  assert.equal(
    sha256(namedFunction(candidate, "appendStaticFlightLegs")),
    sha256(namedFunction(baseline, "appendStaticFlightLegs")),
  );
  assert.equal(
    sha256(namedFunction(candidate, "routePathWithoutFlightTransitions")),
    sha256(namedFunction(baseline, "routePathWithoutFlightTransitions")),
  );
});

test("Garmin adapter routing, state handling, and 120-second polling cadence are unchanged", () => {
  assert.match(candidate, /GARMIN_KML_MODULE_URL = "\/tracking-preview\/assets\/garmin-kml-3deff4779671db1e\.mjs"/);
  assert.match(candidate, /GARMIN_MIN_REFRESH_MS = 120_000/);
  for (const name of [
    "validMissionGarminFix",
    "setMissionGarminLocation",
    "createMissionGarminPoller",
    "loadMissionTrackingStatus",
  ]) {
    assert.equal(sha256(namedFunction(candidate, name)), sha256(namedFunction(baseline, name)), name);
  }
  assert.equal((candidate.match(/\/strava\/public\/tracking-status/g) || []).length, 1);
  assert.doesNotMatch(candidate, /frame-ancestors|Content-Security-Policy/i);
});

test("production pages change only the tracker cache key", () => {
  const oldTag = '<script defer src="/assets/tracker-base.js?v=20261009honolulu1500"></script>';
  const newTag = '<script defer src="/assets/tracker-base.js?v=20261010scheduled-flights"></script>';
  assert.equal(candidateHome, baselineHome.replace(oldTag, newTag));
  assert.equal(candidateLive, baselineLive.replace(oldTag, newTag));
  assert.equal(candidateHome, candidateLive);
});

test("deployment manifest pins only the production tracker and two cache-key documents", () => {
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
      source: "flight-schedule-release-2026-10-10-index.html",
      destination: "public_html/index.html",
      expectedSha256: sha256(candidateHome),
      expectedRemoteSha256: sha256(baselineHome),
    },
    {
      source: "flight-schedule-release-2026-10-10-live-tracking.html",
      destination: "public_html/live-tracking.html",
      expectedSha256: sha256(candidateLive),
      expectedRemoteSha256: sha256(baselineLive),
    },
  ]);
  assert.doesNotMatch(JSON.stringify(manifest.files), /garmin-feed|\.htaccess|strava-race-map|tracker-base\.css/i);
});
