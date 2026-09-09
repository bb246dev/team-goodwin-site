import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const baseRoot = new URL("../production-merge/strava-live-map-2026-09-06/public_html/assets/", import.meta.url);
const candidateRoot = new URL("../production-merge/hapn-api2-production-base-patch-2026-09-09/public_html/assets/", import.meta.url);
const baseTracker = readFileSync(new URL("tracker-base.js", baseRoot), "utf8");
const baseModule = readFileSync(new URL("strava-race-map.mjs", baseRoot), "utf8");
const candidateTracker = readFileSync(new URL("tracker-base.js", candidateRoot), "utf8");
const candidateModule = readFileSync(new URL("strava-race-map.mjs", candidateRoot), "utf8");
const hash = (value) => createHash("sha256").update(value).digest("hex");
const module = await import("../production-merge/hapn-api2-production-base-patch-2026-09-09/public_html/assets/strava-race-map.mjs");

const activeStatus = {
  source: "api",
  active: true,
  raceWindowId: "ggma-2026",
  raceWindowStart: "2026-10-09T00:00:00-04:00",
  raceWindowEnd: "2026-11-01T23:59:59-05:00",
};

function block(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `missing preserved block: ${start}`);
  return source.slice(from, to);
}

test("candidate starts from the exact restored production hashes", () => {
  assert.equal(hash(baseTracker), "a6c9fea694c1bb73181ed1a9ca9801169326bd8194c576e453b2d4faf2928c54");
  assert.equal(hash(baseModule), "7a750659403f256d7a5305b84f164da7a75041d362627e016c6e5457c9de9b80");
});

test("known-good static RV, asset and flight implementations remain byte-identical blocks", () => {
  for (const [start, end] of [
    ["    const mapAssetBase =", "    const MAP_FLIGHT_PREVIEW"],
    ["    const flightItinerary =", "    const RUN_WITH_WILL_FORM_URL"],
    ["    function pointFromTracking", "    function pathPointsFromStops"],
    ["    function appendStaticFlightLegs", "    function appendImageMarker"],
    ["      const rvStopPath =", "      const flightLayer ="],
  ]) assert.equal(block(candidateTracker, start, end), block(baseTracker, start, end));
  assert.equal(
    block(candidateTracker, "      const rvPoint = pointFromTracking", "      const displayedRvPoint ="),
    block(baseTracker, "      const rvPoint = pointFromTracking", "      appendImageMarker(svg, svgNS, rvPoint"),
  );
  assert.match(candidateTracker, /appendImageMarker\(svg, svgNS, displayedRvPoint, mapEntityAssets\.rv, "RV", "rv"\)/);
});

test("HAPN activation fails closed at exact operational boundaries and invalid authority", () => {
  const start = Date.parse(activeStatus.raceWindowStart);
  const end = Date.parse(activeStatus.raceWindowEnd);
  assert.equal(module.hapnLivePositioningEnabled(activeStatus, start - 1), false);
  assert.equal(module.hapnLivePositioningEnabled(activeStatus, start), true);
  assert.equal(module.hapnLivePositioningEnabled(activeStatus, end), true);
  assert.equal(module.hapnLivePositioningEnabled(activeStatus, end + 1), false);
  assert.equal(module.hapnLivePositioningEnabled({ ...activeStatus, active: false }, start), false);
  assert.equal(module.hapnLivePositioningEnabled({ ...activeStatus, source: "static" }, start), false);
  assert.equal(module.hapnLivePositioningEnabled({ ...activeStatus, raceWindowEnd: "wrong" }, start), false);
  assert.equal(module.hapnLivePositioningEnabled(null, start), false);
});

test("public RV normalization accepts only the minimal fresh/stale or unavailable schemas", () => {
  const nowMs = Date.parse("2026-10-10T12:05:00Z");
  const fresh = module.normalizePublicRvLocation({
    available: true,
    stale: false,
    observedAt: "2026-10-10T12:00:00Z",
    position: { lat: 40.831, lng: -74.117 },
  }, { nowMs });
  assert.deepEqual(fresh.position, { lat: 40.831, lng: -74.117 });
  assert.deepEqual(module.normalizePublicRvLocation({ available: false }), { available: false });
  for (const value of [
    { available: true, stale: true, observedAt: "bad", position: { lat: 40, lng: -74 } },
    { available: true, stale: false, observedAt: "2026-10-10T12:20:00Z", position: { lat: 40, lng: -74 } },
    { available: true, stale: false, observedAt: "2026-10-10T12:00:00Z", position: { lat: 100, lng: -74 } },
    { available: true, stale: false, observedAt: "2026-10-10T12:00:00Z", position: { lat: 40, lng: -74 }, extra: true },
  ]) assert.throws(() => module.normalizePublicRvLocation(value, { nowMs }), /invalid_rv_location/);
});

test("RV poller covers fresh-stale-fresh-unavailable-error transitions without overlap", async () => {
  let authority = activeStatus;
  let nowMs = Date.parse("2026-10-10T12:05:00Z");
  const positions = [];
  let fallbacks = 0;
  const queue = [
    { available: true, stale: false, position: { lat: 40.831, lng: -74.117 } },
    { available: true, stale: true, position: { lat: 39.966, lng: -82.934 } },
    { available: true, stale: false, position: { lat: 41.2, lng: -73.8 } },
    { available: false },
  ];
  let loads = 0;
  const poller = module.createPublicRvPoller({
    load: async () => { loads += 1; const next = queue.shift(); if (!next) throw new Error("down"); return next; },
    onPosition: (position) => positions.push(position),
    onFallback: () => { fallbacks += 1; },
    isEnabled: () => module.hapnLivePositioningEnabled(authority, nowMs),
    documentObject: { hidden: false, addEventListener() {}, removeEventListener() {} },
    setTimeoutImpl: () => 1,
    clearTimeoutImpl() {},
  });
  await poller.start();
  await poller.refresh();
  await poller.refresh();
  await poller.refresh();
  await poller.refresh();
  assert.deepEqual(positions, [{ lat: 40.831, lng: -74.117 }, { lat: 41.2, lng: -73.8 }]);
  assert.equal(fallbacks, 3);
  assert.equal(loads, 5);
  authority = { ...activeStatus, active: false };
  assert.equal(await poller.refresh(), null);
  assert.equal(loads, 5);
  assert.equal(fallbacks, 4);
  poller.destroy();
});

test("pre-race disabled poller makes zero HAPN requests", async () => {
  let loads = 0;
  const poller = module.createPublicRvPoller({
    load: async () => { loads += 1; return { available: false }; },
    onPosition() {},
    onFallback() {},
    isEnabled: () => false,
    documentObject: { hidden: false, addEventListener() {}, removeEventListener() {} },
    setTimeoutImpl: () => 1,
    clearTimeoutImpl() {},
  });
  await poller.start();
  assert.equal(loads, 0);
  poller.destroy();
});

test("RV poller coalesces overlapping requests and resumes once after visibility returns", async () => {
  let resolveLoad;
  let loads = 0;
  const listeners = new Map();
  const documentObject = {
    hidden: false,
    addEventListener(name, callback) { listeners.set(name, callback); },
    removeEventListener(name) { listeners.delete(name); },
  };
  const pending = new Promise((resolve) => { resolveLoad = resolve; });
  const poller = module.createPublicRvPoller({
    load: () => { loads += 1; return pending; },
    onPosition() {},
    onFallback() {},
    isEnabled: () => true,
    documentObject,
    setTimeoutImpl: () => 1,
    clearTimeoutImpl() {},
  });
  const first = poller.start();
  const second = poller.refresh();
  assert.strictEqual(first, second);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(loads, 1);
  documentObject.hidden = true;
  listeners.get("visibilitychange")();
  documentObject.hidden = false;
  listeners.get("visibilitychange")();
  assert.equal(loads, 1);
  resolveLoad({ available: false });
  await first;
  poller.destroy();
  assert.equal(listeners.size, 0);
});

test("candidate adds no provider module waterfall or direct HAPN credential surface", () => {
  assert.match(candidateTracker, /import\("\/assets\/strava-race-map\.mjs"\)/);
  assert.doesNotMatch(candidateTracker, /import\([^)]*hapn/i);
  assert.match(candidateModule, /PUBLIC_RV_LOCATION_ENDPOINT = "\/strava\/public\/tracking-status"/);
  assert.doesNotMatch(`${candidateTracker}\n${candidateModule}`, /HAPN_(?:CLIENT_ID|CLIENT_SECRET|DEVICE_IMEI)|auth\.usehapn\.com|api\.iotgps\.io|Authorization\s*:/i);
});
