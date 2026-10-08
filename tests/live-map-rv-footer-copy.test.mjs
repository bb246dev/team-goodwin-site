import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const deployed = read("assets/releases/live-map-garmin-footer-copy-2026-10-07/tracker-base.js");
const trackerPath = "assets/releases/live-map-rv-footer-copy-2026-10-08/tracker-base.js";
const tracker = read(trackerPath);
const manifest = JSON.parse(read("deploy/manifests/releases/live-map-rv-footer-copy-2026-10-08.json"));
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

test("candidate removes only the RV public footer/status renderer and its calls", () => {
  const renderer = block(deployed, "    function updateMissionRvNotice", "    function setMissionHapnLocation");
  const expected = deployed
    .replace(renderer, "")
    .replace(/^[ \t]*updateMissionRvNotice\(\);\n/gm, "");
  assert.equal(tracker, expected);
  assert.doesNotMatch(tracker, /mission-rv-location-status|updateMissionRvNotice/);
  assert.doesNotMatch(tracker, /RV location currently unavailable\.|Last updated \$\{updated\}/);
});

test("stale and unavailable HAPN states cannot create public RV footer copy", () => {
  const stateBlock = block(tracker, "    function validMissionRvFix", "    function missionRvFeedEnabled");
  assert.doesNotMatch(stateBlock, /document\.|createElement|insertAdjacentElement|textContent|legal-note|role.*status/);
  assert.doesNotThrow(() => new Function("renderMissionMap", `
    let missionHapnRv = { kind: "unqueried", position: null, observedAt: null };
    const missionMapTopology = null;
    ${stateBlock}
    setMissionHapnLocation({
      available: true,
      stale: true,
      observedAt: "2026-10-08T03:24:00.000Z",
      position: { lat: 39.1, lng: -84.5 }
    });
    setMissionHapnLocation(null);
  `)(() => {}));
});

test("the existing general tracking/legal note remains exact on every live-map URL", () => {
  const home = read("sponsor-release-2026-10-04-index.html");
  const live = read("sponsor-release-2026-10-04-live-tracking.html");
  for (const [route, html] of [["/", home], ["/#map", home], ["/live-tracking.html", live], ["/live-tracking/", live]]) {
    assert.equal((html.match(new RegExp(priorTrackingNote.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length, 1, route);
  }
  assert.equal(namedFunction(tracker, "initLiveMapLayoutFix"), namedFunction(deployed, "initLiveMapLayoutFix"));
  assert.doesNotMatch(tracker, /querySelector\(["']\.tracker-map-note["']\)/);
});

test("Garmin remains the exclusive runner marker and trail source with Strava race runtime disabled", () => {
  const render = block(tracker, "    function renderMissionMap", "    function clearMissionHapnPosition");
  const load = block(tracker, "    async function loadMissionMap()", "    function initMissionMapLoading");
  assert.match(render, /const runnerPoint = missionGarminPoint\(missionGarminRunner\.position, centroids\)/);
  assert.match(render, /garminTrail\.dataset\.runnerSource = "garmin"/);
  assert.match(render, /runnerMarker\.dataset\.runnerSource = "garmin"/);
  assert.match(load, /load: \(\) => garminModule\.loadGarminRunnerLocation\(\)/);
  assert.doesNotMatch(tracker, /strava-race-map|loadPublicRaceSnapshot|createPublicRacePoller|PUBLIC_RACES_ENDPOINT|PUBLIC_RACE_STATUS_ENDPOINT/);
  assert.doesNotMatch(tracker, /\/strava\/public\/(?:races|race-status)|activityRoutePoints\(|summaryPolyline/);
  assert.equal((tracker.match(/\/strava\/public\/tracking-status/g) || []).length, 1, "only the legacy-namespaced HAPN RV endpoint remains");
});

test("HAPN polling, RV state, and stale marker styling remain unchanged", () => {
  for (const name of [
    "validMissionRvFix",
    "missionRvFeedEnabled",
    "normalizeMissionRvLocation",
    "loadMissionRvLocation",
    "createMissionRvPoller",
    "scheduleMissionRvFeedWindowTransition",
    "missionAirportPlacementsAt",
  ]) {
    assert.equal(namedFunction(tracker, name), namedFunction(deployed, name), name);
  }
  assert.equal(
    namedFunction(tracker, "setMissionHapnLocation"),
    namedFunction(deployed, "setMissionHapnLocation").replace("      updateMissionRvNotice();\n", ""),
    "setMissionHapnLocation differs only by the removed public notice call",
  );
  const render = namedFunction(tracker, "renderMissionMap");
  assert.match(render, /missionHapnRv\.kind === "stale"/);
  assert.match(render, /rvMarker\.classList\.add\("is-stale"\)/);
  assert.match(render, /image\.style\.filter = "grayscale\(1\) brightness\(1\.5\)"/);
  assert.match(render, /staleBadge\.setAttribute\("fill", "#C6A15B"\)/);
  assert.match(render, /title\.textContent = "RV last known location\. Location is currently stale\."/);
});

test("flight paths, plane marker, layout, legend, zoom, routes, and mobile behavior remain unchanged", () => {
  for (const name of [
    "appendStaticFlightLegs",
    "scheduledFlightMarkerLeg",
    "appendFlightMarker",
    "initLiveMapLayoutFix",
    "updateTrackingMapKeyTerminology",
    "renderMissionMap",
  ]) {
    assert.equal(namedFunction(tracker, name), namedFunction(deployed, name), name);
  }
  assert.equal((tracker.match(/class", "map-route flight"/g) || []).length, 1);
  assert.match(tracker, /appendFlightMarker\(flightLayer, svgNS, trackingData\.flight, centroids\)/);
  assert.match(tracker, /node\.textContent\.trim\(\) === "Runner"\) node\.textContent = "Will"/);
});

test("manifest is a one-file release pinned to the deployed production hash", () => {
  assert.equal(manifest.releaseType, "standard");
  assert.deepEqual(manifest.protectedPathsApproved, ["public_html/assets/tracker-base.js"]);
  assert.deepEqual(manifest.files, [{
    source: trackerPath,
    destination: "public_html/assets/tracker-base.js",
    publicPath: "/assets/tracker-base.js",
    expectedSha256: sha256(tracker),
    expectedRemoteSha256: "affa32ebf67da4f1615c995131ebafe0ce4a03ea10f5518e316bd097569c6467",
  }]);
  assert.equal(manifest.files[0].expectedSha256, "a72e41049ac28e412795413629d4e4808efba243f26210da6e4a2ffddfd485e4");
  assert.doesNotMatch(JSON.stringify(manifest.files), /tracking-preview|garmin-feed|embed|\.html|\.css|\.php/);
  assert.deepEqual(manifest.validation.browserRoutes, ["/", "/live-tracking.html", "/live-tracking/"]);
});
