import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const assetRoot = new URL(
  "../production-merge/hapn-api2-frontend-window-fix-2026-09-09/public_html/assets/",
  import.meta.url,
);
const tracker = readFileSync(new URL("tracker-base.js", assetRoot), "utf8");
const moduleSource = readFileSync(new URL("strava-race-map.mjs", assetRoot), "utf8");

test("controlled merge retains the production schedule and lazy map lifecycle", () => {
  const schedule = tracker.match(/const staticRouteStops = \[([\s\S]*?)\n    \];/);
  assert.ok(schedule, "production schedule must remain in the authoritative tracker bundle");
  assert.equal((schedule[1].match(/\{ n: \d+,/g) || []).length, 50);
  assert.match(schedule[1], /n: 1, state: "Hawaii"/);
  assert.match(schedule[1], /n: 50, state: "New York"/);

  assert.match(tracker, /rootMargin: "700px 0px"/);
  const mapLoader = tracker.indexOf("async function loadMissionMap()");
  const lazyGate = tracker.indexOf("function initMissionMapLoading()");
  const moduleImport = tracker.indexOf('import("/assets/strava-race-map.mjs")');
  assert.ok(moduleImport > mapLoader && moduleImport < lazyGate);
  assert.match(tracker.slice(lazyGate), /const start = \(\) => \{[\s\S]*loadMissionMap\(\);/);
  assert.ok(tracker.indexOf("renderMissionMap(missionMapTopology);") < moduleImport);
});

test("controlled merge preserves production route, state, marker, zoom and entity rendering", () => {
  assert.match(tracker, /futurePath\.setAttribute\("class", "map-route future"\)/);
  assert.match(tracker, /completePath\.setAttribute\("class", "map-route complete"\)/);
  assert.match(tracker, /rvPath\.setAttribute\("class", "map-route rv"\)/);
  assert.match(tracker, /appendStaticFlightLegs\(flightLayer, svgNS, centroids\)/);
  assert.match(tracker, /topo\.objects\.states\.geometries\.forEach/);
  assert.match(tracker, /routeStops\.forEach\(\(stop, index\)/);
  assert.match(tracker, /map-zoom-controls/);
  assert.match(tracker, /appendImageMarker\(svg, svgNS, rvPoint/);
  assert.match(tracker, /appendImageMarker\(svg, svgNS, runnerPoint/);
});

test("controlled merge coordinates Strava and HAPN through normalized fail-safe rendering", () => {
  assert.match(moduleSource, /PUBLIC_RACES_ENDPOINT = "\/strava\/public\/races"/);
  assert.match(moduleSource, /PUBLIC_RACE_STATUS_ENDPOINT = "\/strava\/public\/race-status"/);
  assert.match(moduleSource, /payload\.races\.length !== EXPECTED_RACE_COUNT/);
  assert.match(moduleSource, /credentials: "omit"/);
  assert.match(moduleSource, /createPublicRacePoller/);
  assert.match(moduleSource, /createMultiProviderCoordinator/);
  assert.match(moduleSource, /PUBLIC_RV_LOCATION_ENDPOINT = "\/strava\/public\/tracking-status"/);
  assert.match(moduleSource, /applyMapDomainPatch/);
  assert.match(moduleSource, /hapnLivePositioningEnabled/);
  assert.match(moduleSource, /documentObject\?\.hidden/);
  assert.match(tracker, /activityRoutePoints/);
  assert.match(tracker, /map-activity-route/);
  assert.match(tracker, /snapshot\?\.source !== "api"/);
  assert.match(tracker, /enabled: \(\) => missionRaceMapModule\.hapnLivePositioningEnabled\(missionHapnRaceStatus\)/);
  assert.match(tracker, /failure: restoreStaticRv/);
  assert.doesNotMatch(moduleSource, /\/strava\/(?:connect|status|webhook|candidates)/);
  assert.doesNotMatch(tracker, /window\.missionMapTracking/);
  assert.doesNotMatch(tracker, /\/api\/tracking-status/);
});

test("controlled deployment contains only the two required public runtime assets", async () => {
  const { readdir } = await import("node:fs/promises");
  assert.deepEqual((await readdir(assetRoot)).sort(), [
    "strava-race-map.mjs",
    "tracker-base.js",
  ]);
});

test("controlled HAPN frontend candidate contains only the two changed public runtime files", async () => {
  const { readdir } = await import("node:fs/promises");
  const candidateRoot = new URL("../production-merge/hapn-api2-frontend-window-fix-2026-09-09/", import.meta.url);
  assert.deepEqual((await readdir(candidateRoot)).sort(), ["public_html", "validation-results.json"]);
});
