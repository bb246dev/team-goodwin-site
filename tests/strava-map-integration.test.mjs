import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ACTIVE_REFRESH_MS,
  PUBLIC_RACES_ENDPOINT,
  PUBLIC_RACE_STATUS_ENDPOINT,
  createPublicRacePoller,
  decodeSummaryPolyline,
  joinPublicRaces,
  loadPublicRaceSnapshot,
} from "../assets/strava-race-map.mjs";

const staticStops = Array.from({ length: 50 }, (_, index) => ({
  n: index + 1,
  state: `Static State ${index + 1}`,
  abbr: `S${index + 1}`,
  city: `Static City ${index + 1}`,
  date: index === 49 ? "Nov 1" : "Oct 9",
  lat: 30 + index / 100,
  lng: -100 + index / 100,
}));

function racesPayload(overrides = new Map()) {
  return {
    races: Array.from({ length: 50 }, (_, index) => {
      const raceNumber = index + 1;
      return {
        raceNumber,
        raceId: `ggma-2026-${String(raceNumber).padStart(2, "0")}`,
        date: raceNumber === 50 ? "2026-11-01" : "2026-10-09",
        state: `API State ${raceNumber}`,
        city: `API City ${raceNumber}`,
        status: "scheduled",
        ...overrides.get(raceNumber),
      };
    }),
  };
}

function statusPayload(overrides = {}) {
  return {
    active: false,
    raceWindowId: "ggma-2026",
    raceWindowStart: "2026-10-09T00:00:00-04:00",
    raceWindowEnd: "2026-11-01T23:59:59-05:00",
    completedRaces: 0,
    totalRaces: 50,
    ...overrides,
  };
}

function apiFetch(races, status) {
  const calls = [];
  return {
    calls,
    fetch: async (url, options) => {
      calls.push({ url, options });
      if (url === PUBLIC_RACES_ENDPOINT) return Response.json(races);
      if (url === PUBLIC_RACE_STATUS_ENDPOINT) return Response.json(status);
      return new Response("not found", { status: 404 });
    },
  };
}

test("the frontend accepts exactly 50 ordered scheduled races from the public API", async () => {
  const mock = apiFetch(racesPayload(), statusPayload());
  const snapshot = await loadPublicRaceSnapshot({ staticStops, fetchImpl: mock.fetch });
  assert.equal(snapshot.source, "api");
  assert.equal(snapshot.races.length, 50);
  assert.deepEqual(snapshot.races.map((race) => race.n), Array.from({ length: 50 }, (_, index) => index + 1));
  assert.equal(snapshot.races[0].state, "API State 1");
  assert.equal(snapshot.races[0].lat, staticStops[0].lat);
  assert.deepEqual(mock.calls.map((call) => call.url).sort(), [PUBLIC_RACES_ENDPOINT, PUBLIC_RACE_STATUS_ENDPOINT].sort());
  assert.ok(mock.calls.every((call) => call.options.credentials === "omit"));
});

test("a failed public request falls back to the complete static schedule with a safe warning", async () => {
  const warnings = [];
  const snapshot = await loadPublicRaceSnapshot({
    staticStops,
    fetchImpl: async () => new Response("unavailable", { status: 503 }),
    warn: (...values) => warnings.push(values),
  });
  assert.equal(snapshot.source, "static");
  assert.equal(snapshot.races.length, 50);
  assert.equal(snapshot.races[0].city, "Static City 1");
  assert.equal(warnings.length, 1);
  assert.deepEqual(warnings[0], []);
});

test("malformed or incomplete API schedules fail closed to all 50 static races", async () => {
  const incomplete = racesPayload();
  incomplete.races.pop();
  const mock = apiFetch(incomplete, statusPayload());
  const snapshot = await loadPublicRaceSnapshot({ staticStops, fetchImpl: mock.fetch, warn() {} });
  assert.equal(snapshot.source, "static");
  assert.equal(snapshot.races.length, 50);
  assert.ok(snapshot.races.every((race) => race.status === "scheduled" && race.activity === null));
});

test("raceId is preferred for the static-geometry join, with raceNumber as fallback", () => {
  const publicRaces = [
    { raceNumber: 1, raceId: "ggma-2026-01", date: "2026-10-09", state: "Hawaii", city: "Honolulu", status: "scheduled", activity: null },
    { raceNumber: 2, raceId: "ggma-2026-02", date: "2026-10-10", state: "Alaska", city: "Anchorage", status: "scheduled", activity: null },
  ];
  const joined = joinPublicRaces([
    { ...staticStops[1], raceId: "ggma-2026-01" },
    { ...staticStops[1], raceId: undefined },
  ], publicRaces);
  assert.equal(joined[0].raceId, "ggma-2026-01");
  assert.equal(joined[0].city, "Honolulu");
  assert.equal(joined[1].raceId, "ggma-2026-02");
  assert.equal(joined[1].city, "Anchorage");
});

test("a completed race receives only its public activity and a missing polyline remains renderable", async () => {
  const activity = {
    stravaActivityId: "987654321",
    startTime: "2026-10-09T12:00:00.000Z",
    distanceMeters: 42_195.2,
    movingTimeSeconds: 10_800,
    elapsedTimeSeconds: 11_000,
    elevationGainMeters: 250,
    summaryPolyline: null,
    startLatLng: [21.3, -157.8],
    endLatLng: [21.31, -157.81],
  };
  const mock = apiFetch(
    racesPayload(new Map([[1, { status: "completed", activity }]])),
    statusPayload({ completedRaces: 1 }),
  );
  const snapshot = await loadPublicRaceSnapshot({ staticStops, fetchImpl: mock.fetch });
  assert.equal(snapshot.source, "api");
  assert.equal(snapshot.races[0].status, "completed");
  assert.deepEqual(snapshot.races[0].activity, activity);
  assert.equal(snapshot.races[1].activity, null);
  assert.deepEqual(decodeSummaryPolyline(snapshot.races[0].activity.summaryPolyline), []);
  assert.deepEqual(decodeSummaryPolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@"), [
    [38.5, -120.2], [40.7, -120.95], [43.252, -126.453],
  ]);
});

function pollingHarness(active) {
  const timers = [];
  const documentObject = {
    hidden: false,
    addEventListener() {},
    removeEventListener() {},
  };
  let loads = 0;
  const snapshot = { source: "api", status: statusPayload({ active }) };
  const poller = createPublicRacePoller({
    documentObject,
    intervalMs: ACTIVE_REFRESH_MS,
    setTimeoutImpl(callback, delay) {
      timers.push({ callback, delay });
      return timers.length;
    },
    clearTimeoutImpl() {},
    async load() {
      loads += 1;
      return snapshot;
    },
    onSnapshot() {},
  });
  return { poller, snapshot, timers, loads: () => loads };
}

test("polling is scheduled every 45 seconds only while the API says the race window is active", async () => {
  const active = pollingHarness(true);
  await active.poller.start(active.snapshot);
  assert.equal(active.timers.length, 1);
  assert.equal(active.timers[0].delay, 45_000);
  active.timers[0].callback();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(active.loads(), 1);
  active.poller.stop();

  const beforeWindow = pollingHarness(false);
  await beforeWindow.poller.start(beforeWindow.snapshot);
  assert.equal(beforeWindow.timers.length, 0);
  assert.equal(beforeWindow.loads(), 0);

  const afterWindow = pollingHarness(false);
  await afterWindow.poller.start(afterWindow.snapshot);
  assert.equal(afterWindow.timers.length, 0);
  assert.equal(afterWindow.loads(), 0);
});

test("active polling coalesces overlapping refreshes and pauses while the page is hidden", async () => {
  const timers = [];
  const listeners = new Map();
  const documentObject = {
    hidden: false,
    addEventListener(name, listener) { listeners.set(name, listener); },
    removeEventListener(name) { listeners.delete(name); },
  };
  let resolveLoad;
  let loads = 0;
  const snapshot = { source: "api", status: statusPayload({ active: true }) };
  const poller = createPublicRacePoller({
    documentObject,
    setTimeoutImpl(callback, delay) { timers.push({ callback, delay }); return timers.length; },
    clearTimeoutImpl() {},
    load() {
      loads += 1;
      return new Promise((resolve) => { resolveLoad = resolve; });
    },
    onSnapshot() {},
  });
  await poller.start(snapshot);
  documentObject.hidden = true;
  listeners.get("visibilitychange")();
  timers[0].callback();
  const first = poller.refresh();
  const second = poller.refresh();
  assert.strictEqual(first, second);
  await Promise.resolve();
  assert.equal(loads, 1);
  resolveLoad(snapshot);
  await first;
  assert.equal(timers.length, 1);

  documentObject.hidden = false;
  listeners.get("visibilitychange")();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(loads, 2);
  resolveLoad(snapshot);
  await new Promise((resolve) => setImmediate(resolve));
  poller.stop();
  assert.equal(listeners.has("visibilitychange"), false);
});

test("the map and both Strava requests remain behind the near-viewport lazy-load gate", () => {
  const html = readFileSync(new URL("../source-html/live-tracking.html", import.meta.url), "utf8");
  const lazyStart = html.indexOf("function loadMissionMapNearViewport()");
  const observer = html.indexOf("new IntersectionObserver", lazyStart);
  const observerLoad = html.indexOf("void loadMissionMap();", observer);
  const invocation = html.indexOf("loadMissionMapNearViewport();", observerLoad);
  assert.ok(lazyStart > 0 && observer > lazyStart && observerLoad > observer && invocation > observerLoad);
  assert.match(html.slice(lazyStart, invocation), /rootMargin: "300px 0px"/);
  assert.ok(html.indexOf('import("/assets/strava-race-map.mjs")') < lazyStart);

  const moduleSource = readFileSync(new URL("../assets/strava-race-map.mjs", import.meta.url), "utf8");
  for (const endpoint of [PUBLIC_RACES_ENDPOINT, PUBLIC_RACE_STATUS_ENDPOINT]) assert.ok(moduleSource.includes(endpoint));
  for (const privateRoute of ["/strava/status", "/strava/candidates", "/strava/connect", "/strava/webhook"]) {
    assert.ok(!moduleSource.includes(privateRoute));
  }
});
