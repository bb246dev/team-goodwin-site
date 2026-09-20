import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ACTIVE_REFRESH_MS,
  HAPN_REFRESH_MS,
  MAX_LOCATION_BACKOFF_MS,
  createPublicRacePoller,
  createPublicRvPoller,
  createVisibleRefreshPoller,
  hapnLivePositioningEnabled,
  normalizePublicRvLocation,
  versionedLocationUrl,
} from "../assets/releases/location-refresh-2026-09-20/strava-race-map.mjs";

const tracker = readFileSync(new URL("../assets/releases/location-refresh-2026-09-20/tracker-base.js", import.meta.url), "utf8");
const moduleSource = readFileSync(new URL("../assets/releases/location-refresh-2026-09-20/strava-race-map.mjs", import.meta.url), "utf8");
const releaseHtml = [
  readFileSync(new URL("../index.location-refresh-2026-09-20.html", import.meta.url), "utf8"),
  readFileSync(new URL("../live-tracking.location-refresh-2026-09-20.html", import.meta.url), "utf8"),
];

function eventTarget(initial = {}) {
  const listeners = new Map();
  return {
    ...initial,
    addEventListener(name, listener) { listeners.set(name, listener); },
    removeEventListener(name) { listeners.delete(name); },
    dispatch(name) { listeners.get(name)?.(); },
    listeners,
  };
}

test("production location feeds use a deterministic 30-second cadence", () => {
  assert.equal(ACTIVE_REFRESH_MS, 30_000);
  assert.equal(HAPN_REFRESH_MS, 30_000);
  assert.equal(MAX_LOCATION_BACKOFF_MS, 300_000);
  assert.equal(versionedLocationUrl("/position", 90_001), "/position?v=3");
  assert.equal(versionedLocationUrl("/position?unit=rv", 90_001), "/position?unit=rv&v=3");
});

test("visible poller fetches immediately, every 30 seconds, on visibility, and on reconnect", async () => {
  const documentObject = eventTarget({ hidden: false });
  const windowObject = eventTarget();
  const timers = [];
  let calls = 0;
  const poller = createVisibleRefreshPoller({
    load: async () => ({ sequence: ++calls }),
    onSuccess: () => true,
    documentObject,
    windowObject,
    setTimeoutImpl(callback, delay) { timers.push({ callback, delay }); return timers.length; },
    clearTimeoutImpl() {},
  });

  await poller.start();
  assert.equal(calls, 1, "map load performs an immediate request");
  assert.equal(timers.at(-1).delay, 30_000);

  await timers.at(-1).callback();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 2, "active timer performs the next request");

  documentObject.hidden = true;
  documentObject.dispatch("visibilitychange");
  const hiddenCalls = calls;
  await poller.refresh();
  assert.equal(calls, hiddenCalls, "hidden pages do not issue timer refreshes");

  documentObject.hidden = false;
  documentObject.dispatch("visibilitychange");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, hiddenCalls + 1, "visibility restore refreshes immediately");

  windowObject.dispatch("online");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, hiddenCalls + 2, "connectivity restore refreshes immediately");
  poller.destroy();
  assert.equal(documentObject.listeners.size, 0);
  assert.equal(windowObject.listeners.size, 0);
});

test("poller coalesces overlap and applies bounded backoff before normal recovery", async () => {
  let resolveRequest;
  let calls = 0;
  const delays = [];
  const poller = createVisibleRefreshPoller({
    load: () => {
      calls += 1;
      if (calls === 1) return new Promise((resolve) => { resolveRequest = resolve; });
      if (calls < 4) return Promise.reject(new Error("temporary"));
      return Promise.resolve({ ok: true });
    },
    onSuccess: () => true,
    documentObject: eventTarget({ hidden: false }),
    windowObject: eventTarget(),
    setTimeoutImpl(_callback, delay) { delays.push(delay); return delays.length; },
    clearTimeoutImpl() {},
  });

  const first = poller.start();
  const overlapping = poller.refresh();
  await Promise.resolve();
  assert.equal(calls, 1);
  assert.equal(first, overlapping, "overlapping callers share one request");
  resolveRequest({ ok: true });
  await first;
  assert.equal(delays.at(-1), 30_000);

  await poller.refresh();
  assert.equal(delays.at(-1), 30_000);
  await poller.refresh();
  assert.equal(delays.at(-1), 60_000);
  await poller.refresh();
  assert.equal(delays.at(-1), 30_000, "success restores the normal cadence");

  const failingDelays = [];
  const failingPoller = createVisibleRefreshPoller({
    load: async () => { throw new Error("offline"); },
    onSuccess: () => true,
    documentObject: eventTarget({ hidden: false }),
    windowObject: eventTarget(),
    setTimeoutImpl(_callback, delay) { failingDelays.push(delay); return failingDelays.length; },
    clearTimeoutImpl() {},
  });
  await failingPoller.start();
  for (let index = 0; index < 8; index += 1) await failingPoller.refresh();
  assert.deepEqual(failingDelays.slice(0, 6), [30_000, 60_000, 120_000, 240_000, 300_000, 300_000]);
  assert.ok(failingDelays.every((delay) => delay <= MAX_LOCATION_BACKOFF_MS));
  failingPoller.destroy();
  poller.destroy();
});

test("inactive official race status still polls display data without enabling scoring", async () => {
  const inactive = { source: "api", status: { active: false }, races: [] };
  let snapshots = 0;
  let scheduled;
  const poller = createPublicRacePoller({
    load: async () => inactive,
    onSnapshot: () => { snapshots += 1; },
    documentObject: eventTarget({ hidden: false }),
    windowObject: eventTarget(),
    setTimeoutImpl(_callback, delay) { scheduled = delay; return 1; },
    clearTimeoutImpl() {},
  });
  await poller.start();
  assert.equal(snapshots, 1);
  assert.equal(scheduled, 30_000);
  assert.equal(hapnLivePositioningEnabled({
    source: "api",
    active: false,
    raceWindowId: "ggma-2026",
    raceWindowStart: "2026-10-09T09:00:00-04:00",
    raceWindowEnd: "2026-11-01T23:59:59-05:00",
  }, Date.parse("2026-10-10T12:00:00Z")), false);
  assert.match(tracker, /if \(!officialWindowActive\) return 0;/);
  assert.match(tracker, /completedRaces: officialWindowActive \? snapshot\.status\.completedRaces : 0/);
  assert.match(tracker, /status: "scheduled", activity: null/);
  poller.destroy();
});

test("RV payloads preserve precision and fresh, repeated, stale, invalid, recovery behavior", async () => {
  const fresh = {
    available: true,
    stale: false,
    observedAt: "2026-09-20T16:26:15.000Z",
    position: { lat: 39.990123456789, lng: -82.891987654321 },
  };
  assert.deepEqual(
    normalizePublicRvLocation(fresh, { nowMs: Date.parse(fresh.observedAt) }),
    fresh,
    "browser normalization must not round coordinates",
  );
  assert.throws(() => normalizePublicRvLocation({ ...fresh, position: { lat: 0, lng: -82.8 } }), /invalid_rv_location/);

  const events = [];
  const queue = [fresh, fresh, { ...fresh, stale: true }, { ...fresh, position: { lat: 0, lng: -82.8 } }, fresh];
  const poller = createPublicRvPoller({
    load: async () => {
      const value = queue.shift();
      return normalizePublicRvLocation(value, { nowMs: Date.parse(fresh.observedAt) });
    },
    onPosition: (_position, result) => events.push(["fresh", result.position]),
    onStale: (result) => events.push(["stale", result.position]),
    onFallback: () => events.push(["unavailable"]),
    isEnabled: () => true,
    documentObject: eventTarget({ hidden: false }),
    windowObject: eventTarget(),
    setTimeoutImpl() { return 1; },
    clearTimeoutImpl() {},
  });
  await poller.start();
  await poller.refresh();
  await poller.refresh();
  await poller.refresh();
  await poller.refresh();
  assert.deepEqual(events.map(([kind]) => kind), ["fresh", "fresh", "stale", "fresh"]);
  assert.deepEqual(events.at(-1)[1], fresh.position);
  assert.match(tracker, /next\.position\?\.lat === missionHapnRv\.position\?\.lat/);
  assert.match(tracker, /next\.position\?\.lng === missionHapnRv\.position\?\.lng/);
  poller.destroy();
});

test("release keeps the production SVG map and RV dimensions and excludes preview mapping", () => {
  assert.match(tracker, /document\.createElementNS\(svgNS, "svg"\)/);
  assert.match(tracker, /className === "rv"\s*\? \{ x: -30, y: -20, width: 60, height: 40 \}/);
  assert.match(tracker, /appendImageMarker\(svg, svgNS, rvSvgPoint, mapEntityAssets\.rv, "rv"\)/);
  assert.doesNotMatch(`${tracker}\n${moduleSource}\n${releaseHtml.join("\n")}`, /leaflet|openstreetmap|tilelayer/i);
  assert.match(tracker, /const MISSION_WINDOW_START = "2026-10-09T09:00:00-04:00"/);
  assert.match(tracker, /const MISSION_WINDOW_END = "2026-11-01T23:59:59-05:00"/);
});

test("content hashes deterministically upgrade both cached production entry points", () => {
  for (const html of releaseHtml) {
    assert.match(html, /\/assets\/tracker-base\.js\?v=d45a939c5ea5f76fc0246bdb55d3294ecc57856dcf0a9a115624ce5129986592/);
  }
  assert.match(tracker, /\/assets\/strava-race-map\.mjs\?v=ccaa5f541bb5da832641af2a43a1826c9e824a2824bd88dd4ce141d0b8e83e02/);
  assert.doesNotMatch(`${tracker}\n${releaseHtml.join("\n")}`, /[?&](?:t|timestamp|cacheBust)=\$\{?Date\.now/);
});
