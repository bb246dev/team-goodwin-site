import assert from "node:assert/strict";
import test from "node:test";
import {
  applyMapDomainPatch,
  createMapSnapshot,
  createMultiProviderCoordinator,
  hapnLivePositioningEnabled,
  inMissionRaceWindow,
  normalizePublicRvLocation,
} from "../assets/strava-race-map.mjs";

const staticStops = Array.from({ length: 50 }, (_, index) => ({
  n: index + 1,
  state: `State ${index + 1}`,
  city: `City ${index + 1}`,
  date: "Oct 9",
  lat: 40,
  lng: -90,
}));
const fallbackRv = { pathStops: [3, 4, 5, 6], progress: 0.64 };
const activeRaceStatus = {
  source: "api",
  active: true,
  raceWindowId: "ggma-2026",
  raceWindowStart: "2026-10-09T09:00:00-04:00",
  raceWindowEnd: "2026-11-01T23:59:59-05:00",
};

function rvPatch(lat = 40.831, lng = -74.117, observedAt = "2026-10-10T12:00:00Z") {
  return normalizePublicRvLocation({
    available: true,
    stale: false,
    observedAt,
    position: { lat, lng },
  });
}

test("HAPN can change only normalized RV location and changed coordinates change the render input", () => {
  const original = createMapSnapshot({ staticStops, runner: { progress: 0.2 }, rv: fallbackRv, flight: { active: false } });
  const first = applyMapDomainPatch(original, rvPatch(), { nowMs: Date.parse("2026-10-10T12:01:00Z"), raceStatus: activeRaceStatus });
  const second = applyMapDomainPatch(first, rvPatch(41.2, -73.8, "2026-10-10T12:02:00Z"), { nowMs: Date.parse("2026-10-10T12:03:00Z"), raceStatus: activeRaceStatus });
  assert.deepEqual(first.locations.rv, { ...fallbackRv, lat: 40.831, lng: -74.117 });
  assert.deepEqual(second.locations.rv, { ...fallbackRv, lat: 41.2, lng: -73.8 });
  assert.notDeepEqual(first.locations.rv, second.locations.rv);
  assert.strictEqual(second.schedule, first.schedule);
  assert.deepEqual(second.locations.runner, first.locations.runner);
  assert.deepEqual(second.locations.flight, first.locations.flight);
});

test("fresh, stale, unavailable and recovered HAPN transitions preserve all non-RV domains", () => {
  const base = createMapSnapshot({ staticStops, rv: fallbackRv });
  const apply = (snapshot, patch, now = "2026-10-10T12:05:00Z") => applyMapDomainPatch(snapshot, patch, {
    nowMs: Date.parse(now), raceStatus: activeRaceStatus,
  });
  const fresh = apply(base, rvPatch());
  const freshAgain = apply(fresh, rvPatch(41.2, -73.8, "2026-10-10T12:02:00Z"));
  const stale = apply(freshAgain, { ...rvPatch(), stale: true });
  const recoveredFromStale = apply(stale, rvPatch());
  const unavailable = apply(recoveredFromStale, { owner: "hapn", domain: "rvLocation", available: false });
  const recoveredFromUnavailable = apply(unavailable, rvPatch(41.2, -73.8));

  assert.deepEqual(fresh.locations.rv, { ...fallbackRv, lat: 40.831, lng: -74.117 });
  assert.deepEqual(freshAgain.locations.rv, { ...fallbackRv, lat: 41.2, lng: -73.8 });
  assert.deepEqual(stale.locations.rv, fallbackRv);
  assert.equal(stale.observations.rv, null);
  assert.deepEqual(recoveredFromStale.locations.rv, { ...fallbackRv, lat: 40.831, lng: -74.117 });
  assert.deepEqual(unavailable.locations.rv, fallbackRv);
  assert.equal(unavailable.observations.rv, null);
  assert.deepEqual(recoveredFromUnavailable.locations.rv, { ...fallbackRv, lat: 41.2, lng: -73.8 });
  for (const snapshot of [fresh, freshAgain, stale, recoveredFromStale, unavailable, recoveredFromUnavailable]) {
    assert.strictEqual(snapshot.schedule, base.schedule);
    assert.deepEqual(snapshot.locations.runner, base.locations.runner);
    assert.deepEqual(snapshot.locations.flight, base.locations.flight);
  }
});

test("outside-window, missing authority and future timestamps fail closed to the static RV", () => {
  const base = createMapSnapshot({ staticStops, rv: fallbackRv });
  const live = applyMapDomainPatch(base, rvPatch(), {
    nowMs: Date.parse("2026-10-10T12:05:00Z"), raceStatus: activeRaceStatus,
  });
  for (const options of [
    { nowMs: Date.parse("2026-09-09T01:05:00Z"), raceStatus: { ...activeRaceStatus, active: false } },
    { nowMs: Date.parse("2026-10-10T12:05:00Z"), raceStatus: null },
  ]) {
    const result = applyMapDomainPatch(live, rvPatch(), options);
    assert.deepEqual(result.locations.rv, fallbackRv);
    assert.equal(result.observations.rv, null);
  }
  const future = applyMapDomainPatch(live, rvPatch(40.9, -74.2, "2026-10-10T12:11:00Z"), {
    nowMs: Date.parse("2026-10-10T12:05:00Z"), raceStatus: activeRaceStatus,
  });
  assert.deepEqual(future.locations.rv, fallbackRv);
  assert.equal(future.observations.rv, null);
});

test("invalid public structures and provider-controlled strings never reach the model", () => {
  for (const payload of [
    { available: true, stale: false, observedAt: "2026-10-10T12:00:00Z", position: { lat: 40, lng: -74 }, html: "<img onerror=alert(1)>" },
    { available: true, stale: false, observedAt: "<script>", position: { lat: 40, lng: -74 } },
    { available: true, stale: false, observedAt: "2026-10-10T12:00:00Z", position: { lat: "<svg>", lng: -74 } },
  ]) assert.throws(() => normalizePublicRvLocation(payload), /invalid_rv_location/);
});

test("coordinator isolates a hanging HAPN task from Strava and coalesces overlap", async () => {
  let resolveHapn;
  let hapnLoads = 0;
  let stravaApplied = 0;
  const hanging = new Promise((resolve) => { resolveHapn = resolve; });
  const coordinator = createMultiProviderCoordinator({
    providers: [
      { name: "hapn", intervalMs: 120_000, load: () => { hapnLoads += 1; return hanging; } },
      { name: "strava", intervalMs: 45_000, load: async () => ({ source: "api" }), apply: () => { stravaApplied += 1; } },
    ],
    documentObject: { hidden: false, addEventListener() {}, removeEventListener() {} },
    setTimeoutImpl: () => 1,
    clearTimeoutImpl() {},
    random: () => 0.5,
  });
  coordinator.start();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(stravaApplied, 1);
  const first = coordinator.refresh("hapn");
  const second = coordinator.refresh("hapn");
  assert.strictEqual(first, second);
  assert.equal(hapnLoads, 1);
  resolveHapn({ available: false });
  await first;
  coordinator.stop();
});

test("visibility resume schedules one jittered poll per provider without a catch-up burst", async () => {
  const listeners = new Map();
  const documentObject = {
    hidden: false,
    addEventListener(name, callback) { listeners.set(name, callback); },
    removeEventListener() {},
  };
  const timers = [];
  let loads = 0;
  const coordinator = createMultiProviderCoordinator({
    providers: [{ name: "hapn", intervalMs: 120_000, load: async () => { loads += 1; return { available: true }; } }],
    documentObject,
    setTimeoutImpl(callback, delay) { timers.push({ callback, delay, cleared: false }); return timers.length - 1; },
    clearTimeoutImpl(id) { if (timers[id]) timers[id].cleared = true; },
    random: () => 0.5,
  });
  coordinator.start();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(loads, 1);
  documentObject.hidden = true;
  listeners.get("visibilitychange")();
  documentObject.hidden = false;
  listeners.get("visibilitychange")();
  assert.equal(loads, 1);
  const liveTimers = timers.filter((timer) => !timer.cleared);
  assert.equal(liveTimers.length, 1);
  assert.equal(liveTimers[0].delay, 120_000);
  coordinator.stop();
});

test("failure backoff is capped, jittered and enters cooldown after repeated failures", async () => {
  const delays = [];
  const coordinator = createMultiProviderCoordinator({
    providers: [{ name: "hapn", intervalMs: 10_000, load: async () => { throw new Error("down"); } }],
    documentObject: { hidden: false, addEventListener() {}, removeEventListener() {} },
    setTimeoutImpl(callback, delay) { delays.push(delay); return delays.length; },
    clearTimeoutImpl() {},
    random: () => 1,
    maximumBackoffMs: 25_000,
    cooldownFailures: 3,
    cooldownMs: 60_000,
    jitterRatio: 0.1,
  });
  await coordinator.refresh("hapn");
  await coordinator.refresh("hapn");
  await coordinator.refresh("hapn");
  assert.deepEqual(delays, [11_000, 22_000, 66_000]);
  coordinator.stop();
});

test("HAPN polling is bounded to the Mission America race window", () => {
  const start = Date.parse("2026-10-09T09:00:00-04:00");
  const end = Date.parse("2026-11-01T23:59:59-05:00");
  assert.equal(inMissionRaceWindow(start - 1), false);
  assert.equal(inMissionRaceWindow(start), true);
  assert.equal(inMissionRaceWindow(end), true);
  assert.equal(inMissionRaceWindow(end + 1), false);
  assert.equal(hapnLivePositioningEnabled(activeRaceStatus, start - 1), false);
  assert.equal(hapnLivePositioningEnabled(activeRaceStatus, start), true);
  assert.equal(hapnLivePositioningEnabled(activeRaceStatus, end), true);
  assert.equal(hapnLivePositioningEnabled(activeRaceStatus, end + 1), false);
  assert.equal(hapnLivePositioningEnabled({ ...activeRaceStatus, active: false }, start), false);
  assert.equal(hapnLivePositioningEnabled({ ...activeRaceStatus, source: "static" }, start), false);
  assert.equal(hapnLivePositioningEnabled({ ...activeRaceStatus, raceWindowId: "other" }, start), false);
  assert.equal(hapnLivePositioningEnabled(null, start), false);
});

test("coordinator makes no HAPN request until validated race authority becomes active", async () => {
  let authority = null;
  let nowMs = Date.parse("2026-09-09T01:05:00Z");
  let loads = 0;
  const coordinator = createMultiProviderCoordinator({
    providers: [{
      name: "hapn",
      intervalMs: 120_000,
      enabled: () => hapnLivePositioningEnabled(authority, nowMs),
      load: async () => { loads += 1; return { available: false }; },
    }],
    documentObject: { hidden: false, addEventListener() {}, removeEventListener() {} },
    setTimeoutImpl: () => 1,
    clearTimeoutImpl() {},
    now: () => nowMs,
  });
  coordinator.start();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(loads, 0);
  assert.equal(await coordinator.refresh("hapn"), null);
  authority = activeRaceStatus;
  nowMs = Date.parse("2026-10-10T12:05:00Z");
  await coordinator.refresh("hapn");
  assert.equal(loads, 1);
  authority = { ...activeRaceStatus, active: false };
  assert.equal(await coordinator.refresh("hapn"), null);
  assert.equal(loads, 1);
  coordinator.stop();
});
