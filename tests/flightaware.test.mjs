import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  FLIGHT_LEGS,
  validateFlightLegs,
} from "../strava-app/config/flight-legs.mjs";
import {
  selectTrackingSourceAt,
  buildPublicTrackingOverlay,
} from "../strava-app/lib/tracking-source.mjs";
import { createFlightStateCache, FLIGHT_REFRESH_INTERVALS_MS } from "../strava-app/lib/flightaware/cache.mjs";
import {
  createUnavailableFlightState,
  normalizeFlightAwareFlight,
} from "../strava-app/lib/flightaware/normalize.mjs";
import {
  createFlightAwareService,
  flightAwareConfiguration,
} from "../strava-app/lib/flightaware/service.mjs";
import { handleStravaRequest } from "../strava-app/lib/routes.mjs";
import { selectTrackingPosition } from "../assets/strava-race-map.mjs";
import { createMemoryStravaStore } from "./helpers/memory-strava-store.mjs";

const fixtures = JSON.parse(readFileSync(
  new URL("./fixtures/flightaware/responses.json", import.meta.url),
  "utf8",
));
const legFixtures = JSON.parse(readFileSync(
  new URL("./fixtures/flightaware/flight-legs.json", import.meta.url),
  "utf8",
));
const now = new Date("2026-10-10T13:05:00Z");

function leg(overrides = {}) {
  return {
    id: "test-commercial-leg",
    type: "commercial",
    scheduledDate: "2026-10-10",
    scheduledDeparture: "2026-10-10T12:00:00Z",
    origin: "KAAA",
    destination: "KBBB",
    ident: "TST123",
    registration: null,
    faFlightId: null,
    trackingEnabled: true,
    notes: null,
    ...overrides,
  };
}

function flight(name) {
  return structuredClone(fixtures[name].flights[0]);
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=UTF-8" },
  });
}

function memoryFlightCacheStore() {
  const entries = new Map();
  return {
    entries,
    async getFlightTrackingState(legId) { return structuredClone(entries.get(legId) || null); },
    async saveFlightTrackingState(entry) { entries.set(entry.legId, structuredClone(entry)); },
  };
}

test("the authoritative flight configuration starts empty and validates nullable private registrations", () => {
  assert.deepEqual(FLIGHT_LEGS, []);
  const [privateLeg] = validateFlightLegs([legFixtures.privateRegistrationTbd]);
  assert.equal(privateLeg.registration, null);
  assert.equal(privateLeg.faFlightId, null);
  assert.ok(Object.isFrozen(privateLeg));
  assert.throws(() => validateFlightLegs([leg(), leg()]), { code: "invalid_flight_leg_id" });
  assert.throws(() => validateFlightLegs([leg({ scheduledDate: "2026-02-31" })]), { code: "invalid_flight_date" });
  assert.throws(() => validateFlightLegs([leg({ origin: "KAAA", destination: "KAAA" })]), { code: "invalid_flight_route" });
});

test("FlightAware responses normalize scheduled, airborne, landed, private, cancelled and diverted flights", () => {
  const scheduled = normalizeFlightAwareFlight({ leg: leg(), flight: flight("commercialScheduled"), now });
  const airborne = normalizeFlightAwareFlight({ leg: leg(), flight: flight("commercialAirborne"), now });
  const landed = normalizeFlightAwareFlight({ leg: leg(), flight: flight("commercialLanded"), now });
  const privateAirborne = normalizeFlightAwareFlight({
    leg: leg({
      id: "test-private-leg",
      type: "private",
      scheduledDeparture: "2026-10-10T16:00:00Z",
      origin: "KCCC",
      destination: "KDDD",
      ident: null,
      registration: "NTEST2",
    }),
    flight: flight("privateAirborne"),
    now: new Date("2026-10-10T17:05:00Z"),
  });
  const cancelled = normalizeFlightAwareFlight({ leg: leg(), flight: flight("cancelled"), now });
  const diverted = normalizeFlightAwareFlight({ leg: leg(), flight: flight("diverted"), now });

  assert.equal(scheduled.status, "scheduled");
  assert.equal(scheduled.trackingAvailable, false);
  assert.equal(airborne.status, "en_route");
  assert.equal(airborne.trackingAvailable, true);
  assert.equal(airborne.altitude, 35_100);
  assert.equal(airborne.groundspeed, 447);
  assert.equal(airborne.track, 83);
  assert.equal(landed.status, "landed");
  assert.equal(landed.actualArrival, "2026-10-10T15:10:00.000Z");
  assert.equal(privateAirborne.registration, "NTEST2");
  assert.equal(privateAirborne.status, "en_route");
  assert.equal(cancelled.status, "cancelled");
  assert.equal(diverted.status, "diverted");
});

test("missing position and stale position remain safe normalized states", () => {
  const unavailable = normalizeFlightAwareFlight({ leg: leg(), flight: flight("positionUnavailable"), now });
  const stale = normalizeFlightAwareFlight({ leg: leg(), flight: flight("stalePosition"), now });
  assert.equal(unavailable.status, "en_route");
  assert.equal(unavailable.trackingAvailable, false);
  assert.equal(unavailable.latitude, null);
  assert.equal(unavailable.trackingAvailability, "unavailable");
  assert.equal(stale.status, "en_route");
  assert.equal(stale.trackingAvailable, false);
  assert.equal(stale.trackingAvailability, "stale");
  assert.equal(stale.latitude, 35.1);
  assert.throws(() => normalizeFlightAwareFlight({
    leg: leg(),
    flight: { ...flight("commercialAirborne"), last_position: { latitude: 91, longitude: 0 } },
    now,
  }), { code: "invalid_flight_latitude" });
});

test("API-key absence disables the service without making a request, including a private TBD registration", async () => {
  let calls = 0;
  const disabled = createFlightAwareService({
    env: {},
    fetchImpl: async () => { calls += 1; throw new Error("must not run"); },
    now: () => now,
  });
  assert.equal(flightAwareConfiguration({}), null);
  assert.equal(disabled.enabled, false);
  assert.equal((await disabled.retrieveFlightState(leg())).trackingAvailability, "not_configured");
  assert.equal(calls, 0);

  const enabled = createFlightAwareService({
    env: { FLIGHTAWARE_API_KEY: "test-only-flightaware-key-000000" },
    fetchImpl: async () => { calls += 1; throw new Error("must not run"); },
    now: () => now,
  });
  const privateTbd = await enabled.retrieveFlightState(legFixtures.privateRegistrationTbd);
  assert.equal(privateTbd.trackingAvailability, "registration_pending");
  assert.equal(privateTbd.status, "scheduled");
  assert.equal(calls, 0);
  assert.throws(() => flightAwareConfiguration({ FLIGHTAWARE_API_KEY: "short" }), { code: "flightaware_not_configured" });
});

test("the dormant AeroAPI v4 client resolves through fixed server-only endpoints with mocked transport", async () => {
  const calls = [];
  const service = createFlightAwareService({
    env: { FLIGHTAWARE_API_KEY: "test-only-flightaware-key-000000" },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return String(url).endsWith("/position")
        ? jsonResponse(flight("commercialAirborne"))
        : jsonResponse(fixtures.commercialAirborne);
    },
    now: () => now,
  });
  const state = await service.retrieveFlightState(leg());
  assert.equal(state.status, "en_route");
  assert.equal(calls.length, 1);
  const url = new URL(calls[0].url);
  assert.equal(url.origin, "https://aeroapi.flightaware.com");
  assert.equal(url.pathname, "/aeroapi/flights/TST123");
  assert.equal(url.searchParams.get("ident_type"), "designator");
  assert.equal(calls[0].options.headers["x-apikey"], "test-only-flightaware-key-000000");
  assert.equal(calls[0].options.redirect, "error");
  const position = await service.getLatestPosition("TST123-test-commercial-airborne");
  assert.equal(position.last_position.latitude, 35.25);
  assert.equal(new URL(calls[1].url).pathname,
    "/aeroapi/flights/TST123-test-commercial-airborne/position");
});

test("provider and rate-limit failures are sanitized", async () => {
  for (const [status, code] of [[503, "flightaware_unavailable"], [429, "flightaware_rate_limited"]]) {
    const service = createFlightAwareService({
      env: { FLIGHTAWARE_API_KEY: "test-only-flightaware-key-000000" },
      fetchImpl: async () => jsonResponse(fixtures.apiError, status),
      now: () => now,
    });
    await assert.rejects(service.retrieveFlightState(leg()), { code });
  }
  const malformed = createFlightAwareService({
    env: { FLIGHTAWARE_API_KEY: "test-only-flightaware-key-000000" },
    fetchImpl: async () => jsonResponse({ unexpected: true }),
    now: () => now,
  });
  await assert.rejects(malformed.retrieveFlightState(leg()), {
    code: "flightaware_invalid_flights_response",
  });
});

test("the shared cache serves repeated readers, coalesces refreshes and retains stale data on failure", async () => {
  const store = memoryFlightCacheStore();
  let nowMs = now.getTime();
  let calls = 0;
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const state = normalizeFlightAwareFlight({ leg: leg(), flight: flight("commercialAirborne"), now });
  const cache = createFlightStateCache({ store, now: () => nowMs });
  const service = {
    enabled: true,
    async retrieveFlightState() { calls += 1; await pending; return state; },
  };
  const first = cache.refresh(leg(), service);
  const second = cache.refresh(leg(), service);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
  release();
  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.deepEqual(firstResult, secondResult);
  assert.equal((await cache.refresh(leg(), service)).state.status, "en_route");
  assert.equal(calls, 1);

  nowMs += FLIGHT_REFRESH_INTERVALS_MS.airborne + 1_000;
  const retained = await cache.refresh(leg(), {
    enabled: true,
    async retrieveFlightState() { throw new Error("provider down"); },
  });
  assert.equal(retained.stale, true);
  assert.equal(retained.state.status, "en_route");
});

test("tracking source selection is explicit and never inferred", () => {
  const flightLegs = validateFlightLegs([leg()]);
  const windows = [{
    id: "test-flight-window",
    source: "flightaware",
    startsAt: "2026-10-10T12:00:00Z",
    endsAt: "2026-10-10T15:00:00Z",
    flightLegId: leg().id,
    notes: null,
  }];
  assert.deepEqual(selectTrackingSourceAt({ at: "2026-10-10T13:00:00Z", windows, flightLegs }), {
    source: "flightaware",
    flightLegId: leg().id,
  });
  assert.deepEqual(selectTrackingSourceAt({ at: "2026-10-10T11:59:59Z", windows, flightLegs }), {
    source: "strava",
    flightLegId: null,
  });
  assert.deepEqual(selectTrackingPosition({
    raceStatus: { trackingSource: "flightaware", flight: { trackingAvailable: false, stale: false } },
    stravaPosition: { lat: 40, lng: -73 },
  }), { source: "flightaware", available: false, position: null });
  assert.deepEqual(selectTrackingPosition({
    raceStatus: {},
    stravaPosition: { lat: 40, lng: -73 },
  }), { source: "strava", available: true, position: { lat: 40, lng: -73 } });
});

test("race-status is byte-for-shape compatible by default and conditionally exposes only a normalized flight projection", async () => {
  const timestampSeconds = Math.floor(now.getTime() / 1_000);
  const store = createMemoryStravaStore(() => timestampSeconds);
  store.setRaceSchedule(Array.from({ length: 50 }, (_, index) => ({
    id: `ggma-2026-${String(index + 1).padStart(2, "0")}`,
    race_number: index + 1,
    race_date: "2026-10-10",
    state: `State ${index + 1}`,
    city: `City ${index + 1}`,
    status: "scheduled",
  })));
  const request = new Request("https://goodwingoodge.com/api/strava/public/race-status");
  const base = await handleStravaRequest(request, { STRAVA_STORE: store }, { now: () => timestampSeconds });
  assert.deepEqual(await base.json(), {
    active: true,
    raceWindowId: "ggma-2026",
    raceWindowStart: "2026-10-09T09:00:00-04:00",
    raceWindowEnd: "2026-11-01T23:59:59-05:00",
    completedRaces: 0,
    totalRaces: 50,
  });

  const flightLegs = validateFlightLegs([leg()]);
  const normalized = normalizeFlightAwareFlight({ leg: flightLegs[0], flight: flight("commercialAirborne"), now });
  await createFlightStateCache({ store, now: () => now.getTime() }).write(normalized);
  const withFlight = await handleStravaRequest(request, {
    STRAVA_STORE: store,
    FLIGHTAWARE_API_KEY: "must-never-be-public-test-key",
  }, {
    now: () => timestampSeconds,
    flightLegs,
    trackingSourceWindows: [{
      id: "test-flight-window",
      source: "flightaware",
      startsAt: "2026-10-10T12:00:00Z",
      endsAt: "2026-10-10T15:00:00Z",
      flightLegId: leg().id,
      notes: null,
    }],
  });
  const body = await withFlight.json();
  assert.equal(body.trackingSource, "flightaware");
  assert.equal(body.flight.status, "en_route");
  assert.deepEqual(body.flight.position.lat, 35.25);
  const serialized = JSON.stringify(body);
  assert.doesNotMatch(serialized, /must-never-be-public-test-key/);
  assert.doesNotMatch(serialized, /faFlightId|fa_flight_id|raw|x-apikey/i);
});

test("a flight cache failure cannot take down race-status", async () => {
  const flightLegs = validateFlightLegs([leg()]);
  const store = memoryFlightCacheStore();
  store.getFlightTrackingState = async () => { throw new Error("database unavailable"); };
  const overlay = await buildPublicTrackingOverlay({
    at: now,
    store,
    flightLegs,
    windows: [{
      id: "test-flight-window",
      source: "flightaware",
      startsAt: "2026-10-10T12:00:00Z",
      endsAt: "2026-10-10T15:00:00Z",
      flightLegId: leg().id,
      notes: null,
    }],
  });
  assert.equal(overlay.trackingSource, "flightaware");
  assert.equal(overlay.flight.trackingAvailable, false);
  assert.equal(overlay.flight.position, null);
});

test("an unavailable state remains normalized without exposing a guessed position", () => {
  const state = createUnavailableFlightState(leg(), { availability: "flight_not_found", status: "scheduled" });
  assert.equal(state.status, "scheduled");
  assert.equal(state.trackingAvailable, false);
  assert.equal(state.latitude, null);
});
