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

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const previousProduction = read("assets/releases/live-map-layout-2026-10-05/tracker-base.js");
const deployedGarmin = read("assets/releases/live-map-garmin-runner-2026-10-07/tracker-base.js");
const trackerPath = "assets/releases/live-map-garmin-footer-copy-2026-10-07/tracker-base.js";
const tracker = read(trackerPath);
const manifest = JSON.parse(read("deploy/manifests/releases/live-map-garmin-footer-copy-2026-10-07.json"));
const loaderKml = read("tracking-preview/test-fixtures/garmin-loader.kml");
const feedKml = read("tracking-preview/test-fixtures/garmin-feed-with-track.kml");
const priorTrackingNote = "Tracking note: Location and status information may be delayed, approximate or temporarily unavailable. Travel schedules and route information are subject to change.";

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
  const functions = block(tracker, "    function validMissionGarminFix", "    function createMissionGarminPoller");
  const create = new Function("renderMissionMap", `
    let missionGarminRunner = { kind: "connecting", position: null, observedAt: null, trail: [] };
    const missionMapTopology = null;
    ${functions}
    return { setMissionGarminLocation, getState: () => missionGarminRunner };
  `);
  return create(() => {});
}

test("candidate removes only the deployed Garmin public status renderer", () => {
  const statusRenderer = block(
    deployedGarmin,
    "    function formatMissionGarminUpdate",
    "    function setMissionGarminLocation",
  );
  const expected = deployedGarmin
    .replace(statusRenderer, "")
    .replaceAll("        updateMissionGarminNotice();\n", "")
    .replaceAll("      updateMissionGarminNotice();\n", "");
  assert.equal(tracker, expected);
  assert.doesNotMatch(tracker, /mission-garmin-location-status|updateMissionGarminNotice|formatMissionGarminUpdate/);
  assert.doesNotMatch(tracker, /Garmin feed connected|Garmin feed temporarily unavailable|Connecting to Garmin|Garmin location is approximate|Garmin last known location/);
});

test("visible footer copy stays at the exact previous live-site tracking note", () => {
  const home = read("sponsor-release-2026-10-04-index.html");
  const live = read("sponsor-release-2026-10-04-live-tracking.html");
  for (const [route, html] of [["/", home], ["/#map", home], ["/live-tracking.html", live], ["/live-tracking/", live]]) {
    assert.match(html, new RegExp(`<p class="legal-note">${priorTrackingNote.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</p>`), route);
  }
  assert.equal(
    namedFunction(tracker, "initLiveMapLayoutFix"),
    namedFunction(previousProduction, "initLiveMapLayoutFix"),
  );
  assert.doesNotMatch(tracker, /querySelector\(["']\.tracker-map-note["']\)/);
  assert.doesNotMatch(tracker, /\.tracker-map-note[^\n]*textContent|textContent[^\n]*tracker-map-note/);
});

test("Garmin still exclusively drives the live runner marker and trail", async () => {
  const render = block(tracker, "    function renderMissionMap", "    function clearMissionHapnPosition");
  const load = block(tracker, "    async function loadMissionMap()", "    function initMissionMapLoading");
  assert.match(render, /const runnerPoint = missionGarminPoint\(missionGarminRunner\.position, centroids\)/);
  assert.match(render, /garminTrail\.dataset\.runnerSource = "garmin"/);
  assert.match(render, /runnerMarker\.dataset\.runnerSource = "garmin"/);
  assert.match(load, /load: \(\) => garminModule\.loadGarminRunnerLocation\(\)/);
  assert.doesNotMatch(tracker, /strava-race-map|loadPublicRaceSnapshot|createPublicRacePoller|PUBLIC_RACES_ENDPOINT|PUBLIC_RACE_STATUS_ENDPOINT/);
  assert.doesNotMatch(tracker, /\/strava\/public\/(?:races|race-status)/);
  assert.doesNotMatch(render, /activityRoutePoints\(|summaryPolyline/);
  assert.equal((tracker.match(/\/strava\/public\/tracking-status/g) || []).length, 1, "only the legacy-namespaced HAPN RV endpoint remains");

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
  assert.ok(result.trail.length > 1);
});

test("Garmin keeps the 120-second poll floor and silent empty/stale/unavailable state handling", async () => {
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

  const empty = parseGarminFeed('<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document/></kml>');
  const state = garminStateHarness();
  assert.doesNotThrow(() => state.setMissionGarminLocation(empty, "connected"));
  assert.equal(state.getState().kind, "empty");
  const stale = parseGarminFeed(feedKml, { nowMs: Date.parse("2026-10-08T00:40:00Z") });
  assert.doesNotThrow(() => state.setMissionGarminLocation(stale, "connected"));
  assert.equal(state.getState().kind, "stale");
  assert.doesNotThrow(() => state.setMissionGarminLocation(null, "unavailable"));
  assert.equal(state.getState().kind, "stale");
  assert.deepEqual(state.getState().position, stale.position);
});

test("RV, flight, map layout, legend, route, mobile, and load behavior are byte-identical to the deployed Garmin asset", () => {
  for (const name of [
    "missionRvFeedEnabled",
    "scheduleMissionRvFeedWindowTransition",
    "missionAirportPlacementsAt",
    "validMissionRvFix",
    "setMissionHapnLocation",
    "loadMissionRvLocation",
    "appendStaticFlightLegs",
    "scheduledFlightMarkerLeg",
    "appendFlightMarker",
    "initLiveMapLayoutFix",
    "updateTrackingMapKeyTerminology",
  ]) {
    assert.equal(namedFunction(tracker, name), namedFunction(deployedGarmin, name), name);
  }
  assert.match(tracker, /appendFlightMarker\(flightLayer, svgNS, trackingData\.flight, centroids\)/);
  assert.match(tracker, /const displayedRvPosition = showRvMarker \? staticPlacements\.rv\?\.position \|\| missionHapnRv\.position : null/);
  assert.match(tracker, /node\.textContent\.trim\(\) === "Runner"\) node\.textContent = "Will"/);
});

test("manifest is a one-file release from the deployed production hash", () => {
  assert.equal(manifest.releaseType, "standard");
  assert.deepEqual(manifest.protectedPathsApproved, ["public_html/assets/tracker-base.js"]);
  assert.deepEqual(manifest.files, [{
    source: trackerPath,
    destination: "public_html/assets/tracker-base.js",
    publicPath: "/assets/tracker-base.js",
    expectedSha256: sha256(tracker),
    expectedRemoteSha256: "15d801a0117f2e076bc15a5e28620e110d8c5d6a267c2cf035f57d976d616b12",
  }]);
  assert.equal(manifest.files[0].expectedSha256, "affa32ebf67da4f1615c995131ebafe0ce4a03ea10f5518e316bd097569c6467");
  assert.doesNotMatch(JSON.stringify(manifest.files), /tracking-preview|garmin-feed|embed|\.html|\.css|\.php/);
  assert.deepEqual(manifest.validation.browserRoutes, ["/", "/live-tracking.html", "/live-tracking/"]);
});
