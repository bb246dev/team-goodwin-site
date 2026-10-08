import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  GARMIN_LOADER_URL,
  GARMIN_MIN_REFRESH_MS,
  loadGarminRunnerLocation,
  parseGarminFeed,
} from "../tracking-preview/source/garmin-kml.mjs";
import { scheduledAirportPlacementsAt as referenceAirportPlacementsAt } from "../assets/releases/full-route-itinerary-2026-09-30/strava-race-map.mjs";
const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const baseline = read("assets/releases/live-map-layout-2026-10-05/tracker-base.js");
const trackerPath = "assets/releases/live-map-garmin-runner-2026-10-07/tracker-base.js";
const tracker = read(trackerPath);
const manifest = JSON.parse(read("deploy/manifests/releases/live-map-garmin-runner-2026-10-07.json"));
const loaderKml = read("tracking-preview/test-fixtures/garmin-loader.kml");
const feedKml = read("tracking-preview/test-fixtures/garmin-feed-with-track.kml");

function block(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `missing block ${start}`);
  return source.slice(from, to);
}

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

function garminStateHarness() {
  let notice = null;
  const document = {
    getElementById: (id) => id === "mission-garmin-location-status" ? notice : null,
    createElement: () => ({ setAttribute() {} }),
    querySelector: (selector) => selector === ".tracker-map-note"
      ? null
      : { insertAdjacentElement(_where, element) { notice = element; } },
  };
  const functions = block(tracker, "    function validMissionGarminFix", "    function createMissionGarminPoller");
  const create = new Function("document", "renderMissionMap", `
    let missionGarminRunner = { kind: "connecting", position: null, observedAt: null, trail: [] };
    const missionMapTopology = null;
    ${functions}
    return { setMissionGarminLocation, getState: () => missionGarminRunner };
  `);
  return { ...create(document, () => {}), getNotice: () => notice?.textContent };
}

test("production runner marker and trail use Garmin with Strava race polling fully inactive", () => {
  const render = block(tracker, "    function renderMissionMap", "    function clearMissionHapnPosition");
  const load = block(tracker, "    async function loadMissionMap()", "    function initMissionMapLoading");
  assert.match(render, /const runnerPoint = missionGarminPoint\(missionGarminRunner\.position, centroids\)/);
  assert.match(render, /garminTrail\.dataset\.runnerSource = "garmin"/);
  assert.match(render, /runnerMarker\.dataset\.runnerSource = "garmin"/);
  assert.doesNotMatch(render, /trackingData\.runner|missionRunnerTracking|staticPlacements\.will/);
  assert.doesNotMatch(render, /activityRoutePoints\(/);
  assert.match(load, /load: \(\) => garminModule\.loadGarminRunnerLocation\(\)/);
  assert.match(load, /load: loadMissionRvLocation/);
  assert.doesNotMatch(tracker, /strava-race-map|loadPublicRaceSnapshot|createPublicRacePoller|PUBLIC_RACES_ENDPOINT|PUBLIC_RACE_STATUS_ENDPOINT/);
  assert.doesNotMatch(tracker, /\/strava\/public\/(?:races|race-status)/);
  assert.equal((tracker.match(/\/strava\/public\/tracking-status/g) || []).length, 1);
  assert.equal(
    sha256(read("assets/releases/full-route-itinerary-2026-09-30/strava-race-map.mjs")),
    "3f476d314f48615ee0f9ae8dca165f2d940ef8d0b5a84651bb303711573125ca",
    "rollback/reference Strava module remains unchanged",
  );
});

test("RV feed keeps its original mission-window gate and airport placement rules without Strava race status", () => {
  const rvEnabled = new Function(`
    const startDate = new Date("2026-10-09T09:00:00-04:00");
    const endDate = new Date("2026-11-01T23:59:59-05:00");
    ${namedFunction(tracker, "missionRvFeedEnabled")}
    return missionRvFeedEnabled;
  `)();
  const start = Date.parse("2026-10-09T09:00:00-04:00");
  const end = Date.parse("2026-11-01T23:59:59-05:00");
  assert.equal(rvEnabled(start - 1), false);
  assert.equal(rvEnabled(start), true);
  assert.equal(rvEnabled(end), true);
  assert.equal(rvEnabled(end + 1), false);

  const airportConstants = block(tracker, "    const MISSION_AIRPORT_PLACEMENTS", "    const MISSION_AIRPORT_BOUNDARIES");
  const airportPlacementsAt = new Function(`
    ${airportConstants}
    ${namedFunction(tracker, "missionAirportPlacementsAt")}
    return missionAirportPlacementsAt;
  `)();
  for (const instant of [
    "2026-10-09T21:30:00-10:00",
    "2026-10-10T14:30:00-08:00",
    "2026-10-11T05:00:00-07:00",
    "2026-10-11T14:00:00-07:00",
  ]) {
    assert.deepEqual(airportPlacementsAt(Date.parse(instant)), referenceAirportPlacementsAt(Date.parse(instant)));
  }
});

test("live Garmin adapter follows the loader NetworkLink and places the latest KML coordinate", async () => {
  const requests = [];
  const result = await loadGarminRunnerLocation({
    nowMs: Date.parse("2026-10-08T00:25:00Z"),
    fetchImpl: async (requestPath) => {
      const request = new URL(requestPath, "https://goodwingoodge.com");
      const target = request.searchParams.get("url");
      requests.push(target);
      return {
        ok: true,
        headers: { get: (name) => name.toLowerCase() === "content-type" ? "application/vnd.google-earth.kml+xml" : null },
        text: async () => target === GARMIN_LOADER_URL ? loaderKml : feedKml,
      };
    },
  });
  assert.deepEqual(requests, [
    GARMIN_LOADER_URL,
    "https://eur-share.explore.garmin.com/Feed/Share/missionamerica",
  ]);
  assert.deepEqual(result.position, { lat: 21.32, lng: -157.85 });
  assert.equal(result.observedAt, "2026-10-08T00:24:00.000Z");
  assert.ok(result.trail.length > 1);
  assert.match(tracker, /GARMIN_KML_MODULE_URL = "\/tracking-preview\/assets\/garmin-kml-3deff4779671db1e\.mjs"/);
  assert.equal(sha256(read("tracking-preview/source/garmin-kml.mjs")).slice(0, 16), "3deff4779671db1e");
});

test("Garmin polling is clamped to no faster than 120 seconds", async () => {
  const create = new Function(`
    const GARMIN_MIN_REFRESH_MS = 120_000;
    ${namedFunction(tracker, "createMissionGarminPoller")}
    return createMissionGarminPoller;
  `)();
  let now = 0;
  let loads = 0;
  const scheduled = [];
  const poller = create({
    intervalMs: 1,
    minimumIntervalMs: 1,
    load: async () => { loads += 1; return { available: false }; },
    onData() {},
    onFailure() {},
    documentObject: { hidden: false, addEventListener() {}, removeEventListener() {} },
    windowObject: { addEventListener() {}, removeEventListener() {} },
    nowImpl: () => now,
    setTimeoutImpl: (callback, delay) => { scheduled.push({ callback, delay }); return scheduled.length; },
    clearTimeoutImpl() {},
  });
  await poller.start();
  assert.equal(loads, 1);
  assert.equal(GARMIN_MIN_REFRESH_MS, 120_000);
  assert.ok(scheduled.every(({ delay }) => delay >= GARMIN_MIN_REFRESH_MS));
  now = 119_999;
  await poller.refresh();
  assert.equal(loads, 1);
  now = 120_000;
  await poller.refresh();
  assert.equal(loads, 2);
  poller.destroy();
});

test("reachable empty Garmin KML shows the safe waiting fallback", () => {
  const empty = parseGarminFeed('<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document/></kml>');
  assert.deepEqual(empty, { available: false, trail: [] });
  const view = garminStateHarness();
  view.setMissionGarminLocation(empty, "connected");
  assert.equal(view.getState().kind, "empty");
  assert.equal(view.getNotice(), "Garmin feed connected. Waiting for location update. Updates are approximate and arrive about every 2 minutes.");
});

test("stale and unavailable Garmin results retain a safe last-known marker without breaking the map", () => {
  const stale = parseGarminFeed(feedKml, { nowMs: Date.parse("2026-10-08T00:40:00Z") });
  assert.equal(stale.available, true);
  assert.equal(stale.stale, true);
  const view = garminStateHarness();
  assert.doesNotThrow(() => view.setMissionGarminLocation(stale, "connected"));
  assert.equal(view.getState().kind, "stale");
  assert.doesNotThrow(() => view.setMissionGarminLocation(null, "unavailable"));
  assert.equal(view.getState().kind, "stale");
  assert.deepEqual(view.getState().position, stale.position);
  assert.match(view.getNotice(), /Garmin last known location[\s\S]*Feed connection interrupted[\s\S]*about every 2 minutes/);

  const unavailable = garminStateHarness();
  assert.doesNotThrow(() => unavailable.setMissionGarminLocation(null, "unavailable"));
  assert.equal(unavailable.getState().kind, "unavailable");
  assert.match(unavailable.getNotice(), /temporarily unavailable[\s\S]*no sooner than every 2 minutes/);
});

test("flight paths, plane marker, RV rules, legend, layout, and mobile fix remain unchanged", () => {
  for (const [start, end] of [
    ["    function rvMapVisible", "    function scheduleMissionRvReveal"],
    ["    function scheduleMissionRvReveal", "    function missionAirportPlacementsAt"],
    ["    function validMissionRvFix", "    function updateMissionRvNotice"],
    ["    function appendStaticFlightLegs", "    function scheduledFlightMarkerLeg"],
    ["    function scheduledFlightMarkerLeg", "    function appendFlightMarker"],
    ["    function appendFlightMarker", "    function appendImageMarker"],
    ["    function initLiveMapLayoutFix", "    initLiveMapLayoutFix();"],
  ]) {
    assert.equal(sha256(block(tracker, start, end)), sha256(block(baseline, start, end)), start);
  }
  assert.equal(
    sha256(namedFunction(tracker, "setMissionHapnLocation")),
    sha256(namedFunction(baseline, "setMissionHapnLocation")),
    "setMissionHapnLocation",
  );
  assert.equal(
    sha256(namedFunction(tracker, "updateTrackingMapKeyTerminology")),
    sha256(namedFunction(baseline, "updateTrackingMapKeyTerminology")),
    "updateTrackingMapKeyTerminology",
  );
  assert.equal((tracker.match(/class", "map-route flight"/g) || []).length, 1);
  assert.match(tracker, /appendFlightMarker\(flightLayer, svgNS, trackingData\.flight, centroids\)/);
  assert.match(tracker, /const displayedRvPosition = showRvMarker \? staticPlacements\.rv\?\.position \|\| missionHapnRv\.position : null/);
  assert.match(tracker, /const rvMarker = showRvMarker \? appendImageMarker\(svg, svgNS, rvSvgPoint, mapEntityAssets\.rv, "rv"\) : null/);
  assert.match(tracker, /node\.textContent\.trim\(\) === "Runner"\) node\.textContent = "Will"/);
});

test("homepage and both live-tracking URLs keep the same map mount and production tracker", () => {
  const home = read("sponsor-release-2026-10-04-index.html");
  const live = read("sponsor-release-2026-10-04-live-tracking.html");
  const routes = new Map([
    ["/", home],
    ["/#map", home],
    ["/live-tracking.html", live],
    ["/live-tracking/", live],
  ]);
  for (const [route, html] of routes) {
    assert.match(html, /<section class="tracker-section" id="map">/, route);
    assert.match(html, /<div class="tracker-map" id="mission-map"/, route);
    assert.match(html, /<script defer src="\/assets\/tracker-base\.js\?v=/, route);
  }
  assert.deepEqual(manifest.validation.browserRoutes, ["/", "/live-tracking.html", "/live-tracking/"]);
});

test("manifest changes only the live tracker asset with its exact rollback hash", () => {
  assert.equal(manifest.releaseType, "standard");
  assert.deepEqual(manifest.protectedPathsApproved, ["public_html/assets/tracker-base.js"]);
  assert.deepEqual(manifest.files.map(({ source, destination, publicPath, expectedSha256, expectedRemoteSha256 }) => ({
    source, destination, publicPath, expectedSha256, expectedRemoteSha256,
  })), [
    {
      source: trackerPath,
      destination: "public_html/assets/tracker-base.js",
      publicPath: "/assets/tracker-base.js",
      expectedSha256: sha256(tracker),
      expectedRemoteSha256: "a34af9a8f8311a1a6dc060206a04534fb59a7f14ca76b22f42ea9df5ee3f664f",
    },
  ]);
  assert.doesNotMatch(JSON.stringify(manifest.files), /tracking-preview|garmin-feed|embed|\.html|\.css|\.php/);
});
