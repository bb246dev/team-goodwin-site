import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const candidate = readFileSync(new URL(
  "../assets/releases/live-map-journey-overrides-2026-10-18/tracker-base.js",
  import.meta.url,
), "utf8");

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

function harness() {
  return new Function(`
    const GARMIN_FRESH_MS = 30 * 60_000;
    ${constStatement(candidate, "MISSION_SCHEDULED_FLIGHTS")}
    ${constStatement(candidate, "MISSION_JOURNEY")}
    let missionJourneyState = { available: false, transitions: {}, origins: {} };
    let missionGarminRunner = { kind: "unavailable", position: null, observedAt: null, trail: [] };
    let missionLosAngelesDepartureOrigin = null;
    const flightAirports = {};
    ${namedFunction(candidate, "missionScheduledFlightAt")}
    ${namedFunction(candidate, "missionGarminLiveFreshAt")}
    ${namedFunction(candidate, "missionDistanceKm")}
    ${namedFunction(candidate, "missionQualifiedGarminRunAt")}
    ${namedFunction(candidate, "missionJourneyTransitionMs")}
    ${namedFunction(candidate, "decodeMissionPolyline6")}
    ${namedFunction(candidate, "missionRoutePosition")}
    ${namedFunction(candidate, "missionLosAngelesOriginAt")}
    ${namedFunction(candidate, "missionJourneyRoute")}
    ${namedFunction(candidate, "missionJourneyFlightDisplay")}
    ${namedFunction(candidate, "missionJourneyHotelDisplay")}
    ${namedFunction(candidate, "missionJourneyRunnerDisplay")}
    ${namedFunction(candidate, "missionJourneyTravelDisplay")}
    ${namedFunction(candidate, "missionJourneyDisplayStateAt")}
    ${namedFunction(candidate, "missionMarkerVisibility")}
    return { MISSION_JOURNEY, missionJourneyDisplayStateAt, missionMarkerVisibility };
  `)();
}

const emptyState = {
  available: true,
  transitions: {
    "las-vegas-race-finished": null,
    "arizona-race-finished": null,
    "miami-race-finished": null,
  },
  origins: {
    "los-angeles-departure": {
      capturedAt: "2026-10-21T05:00:00.000Z",
      observedAt: "2026-10-21T04:59:00.000Z",
      position: { lat: 34.0412, lng: -118.2521 },
    },
  },
};

const noGarmin = { kind: "unavailable", position: null, observedAt: null, trail: [] };
const transition = (transitionId, occurredAt, nextPhase) => ({ transitionId, occurredAt, nextPhase });
const only = (visibility, name) => {
  assert.equal(Object.values(visibility).filter(Boolean).length, 1);
  assert.equal(visibility[name], true);
};

test("journey constants use the approved locations and authorized road estimates", () => {
  const { MISSION_JOURNEY: journey } = harness();
  assert.deepEqual(journey.coordinates.willowBeachHooverDam, { lat: 35.8755, lng: -114.6608 });
  assert.deepEqual(journey.coordinates.fontainebleauLasVegas, { lat: 36.1374208, lng: -115.1592284 });
  assert.deepEqual(journey.coordinates.fontainebleauMiami, { lat: 25.8180847, lng: -80.1220423 });
  assert.equal(journey.lasVegasToArizonaDurationMs, 80 * 60_000);
  assert.equal(journey.arizonaToKlasDurationMs, 110 * 60_000);
});

test("Los Angeles departure changes exactly at 10 PM Pacific and uses the captured Garmin origin", () => {
  const h = harness();
  const departure = Date.parse("2026-10-20T22:00:00-07:00");
  assert.equal(h.missionJourneyDisplayStateAt(departure - 1, noGarmin, emptyState), null);
  const atDeparture = h.missionJourneyDisplayStateAt(departure, noGarmin, emptyState);
  assert.equal(atDeparture.phaseId, "drive-los-angeles-to-fontainebleau-las-vegas");
  assert.deepEqual(atDeparture.position, emptyState.origins["los-angeles-departure"].position);
  assert.equal(atDeparture.markerTitle, "Scheduled travel — estimated position.");
  only(h.missionMarkerVisibility(atDeparture, true), "rv");
  const beforeArrival = h.missionJourneyDisplayStateAt(Date.parse("2026-10-21T03:29:59.999-07:00"), noGarmin, emptyState);
  assert.equal(beforeArrival.kind, "drive");
  const atArrival = h.missionJourneyDisplayStateAt(Date.parse("2026-10-21T03:30:00-07:00"), noGarmin, emptyState);
  assert.equal(atArrival.phaseId, "fontainebleau-las-vegas");
  only(h.missionMarkerVisibility(atArrival, true), "hotel");
});

test("shared Las Vegas and Arizona finish timestamps drive, hold, and remain idempotent inputs", () => {
  const h = harness();
  const lasVegasFinishedAt = "2026-10-21T12:00:00-07:00";
  const drivingState = structuredClone(emptyState);
  drivingState.transitions["las-vegas-race-finished"] = transition(
    "las-vegas-race-finished", lasVegasFinishedAt, "drive-las-vegas-to-arizona",
  );
  const start = h.missionJourneyDisplayStateAt(Date.parse(lasVegasFinishedAt), noGarmin, drivingState);
  assert.equal(start.progress, 0);
  const exactArrival = h.missionJourneyDisplayStateAt(Date.parse("2026-10-21T13:20:00-07:00"), noGarmin, drivingState);
  assert.equal(exactArrival.kind, "drive-arrived");
  assert.deepEqual(exactArrival.position, h.MISSION_JOURNEY.coordinates.willowBeachHooverDam);
  const held = h.missionJourneyDisplayStateAt(Date.parse("2026-10-21T17:59:59-07:00"), noGarmin, drivingState);
  assert.equal(held.progress, 1);
  only(h.missionMarkerVisibility(held, true), "rv");

  drivingState.transitions["arizona-race-finished"] = transition(
    "arizona-race-finished", "2026-10-21T20:00:00-07:00", "drive-arizona-to-klas",
  );
  const klas = h.missionJourneyDisplayStateAt(Date.parse("2026-10-21T21:50:00-07:00"), noGarmin, drivingState);
  assert.equal(klas.kind, "drive-arrived");
  assert.deepEqual(klas.position, h.MISSION_JOURNEY.coordinates.klas);
});

test("a qualified Arizona Garmin observation interrupts estimated driving and survives silence without an 11 PM cutoff", () => {
  const h = harness();
  const state = structuredClone(emptyState);
  state.transitions["las-vegas-race-finished"] = transition(
    "las-vegas-race-finished", "2026-10-21T17:45:00-07:00", "drive-las-vegas-to-arizona",
  );
  const runner = {
    available: true,
    validGpsFix: true,
    kind: "stale",
    observedAt: "2026-10-21T18:04:00-07:00",
    position: { lat: 35.876, lng: -114.661 },
    trail: [],
  };
  for (const instant of ["2026-10-21T18:05:00-07:00", "2026-10-21T23:00:00-07:00", "2026-10-22T04:59:59.999-07:00"]) {
    const display = h.missionJourneyDisplayStateAt(Date.parse(instant), runner, state);
    assert.equal(display.phaseId, "arizona-run", instant);
    only(h.missionMarkerVisibility(display, true), "runner");
  }
});

test("the confirmed KLAS flight replaces every ground phase and expires exactly on arrival", () => {
  const h = harness();
  const state = structuredClone(emptyState);
  state.transitions["arizona-race-finished"] = transition(
    "arizona-race-finished", "2026-10-21T22:30:00-07:00", "drive-arizona-to-klas",
  );
  const departure = Date.parse("2026-10-22T05:00:00-07:00");
  const arrival = Date.parse("2026-10-22T09:42:00-05:00");
  only(h.missionMarkerVisibility(h.missionJourneyDisplayStateAt(departure, noGarmin, state), true), "plane");
  only(h.missionMarkerVisibility(h.missionJourneyDisplayStateAt(arrival - 1, noGarmin, state), true), "plane");
  assert.equal(h.missionJourneyDisplayStateAt(arrival, noGarmin, state), null);
  assert.equal(h.missionJourneyDisplayStateAt(arrival + 1, noGarmin, state), null);
});

test("Miami hotel, race, finish, and flights transition at explicit Eastern instants", () => {
  const h = harness();
  const state = structuredClone(emptyState);
  const start = Date.parse("2026-10-23T21:00:00-04:00");
  assert.equal(h.missionJourneyDisplayStateAt(start - 1, noGarmin, state), null);
  only(h.missionMarkerVisibility(h.missionJourneyDisplayStateAt(start, noGarmin, state), true), "hotel");
  only(h.missionMarkerVisibility(
    h.missionJourneyDisplayStateAt(Date.parse("2026-10-23T22:00:00-04:00"), noGarmin, state), true,
  ), "plane");
  const landing = Date.parse("2026-10-23T23:54:00-04:00");
  only(h.missionMarkerVisibility(h.missionJourneyDisplayStateAt(landing, noGarmin, state), true), "hotel");
  const raceStart = Date.parse("2026-10-24T09:00:00-04:00");
  const race = h.missionJourneyDisplayStateAt(raceStart, noGarmin, state);
  assert.equal(race.phaseId, "miami-run");
  only(h.missionMarkerVisibility(race, true), "runner");
  state.transitions["miami-race-finished"] = transition(
    "miami-race-finished", "2026-10-24T13:30:00-04:00", "fontainebleau-miami-hotel",
  );
  only(h.missionMarkerVisibility(
    h.missionJourneyDisplayStateAt(Date.parse("2026-10-24T13:30:00-04:00"), noGarmin, state), true,
  ), "hotel");
  only(h.missionMarkerVisibility(
    h.missionJourneyDisplayStateAt(Date.parse("2026-10-24T16:21:00-04:00"), noGarmin, state), true,
  ), "plane");
  assert.equal(h.missionJourneyDisplayStateAt(Date.parse("2026-10-24T18:24:00-04:00"), noGarmin, state), null);
});

test("missing transition data cannot invent finishes and explicit offsets are viewer-timezone independent", () => {
  const h = harness();
  const unavailable = { available: false, transitions: {}, origins: {} };
  const equivalent = [
    "2026-10-21T18:00:00-07:00",
    "2026-10-22T01:00:00Z",
    "2026-10-22T02:00:00+01:00",
    "2026-10-22T10:00:00+09:00",
  ];
  for (const instant of equivalent) {
    const display = h.missionJourneyDisplayStateAt(Date.parse(instant), noGarmin, unavailable);
    assert.equal(display.phaseId, "fontainebleau-las-vegas", instant);
    only(h.missionMarkerVisibility(display, true), "hotel");
  }
});

test("rendering wires shared state before first paint and keeps all four subjects mutually exclusive", () => {
  assert.match(candidate, /await Promise\.all\(\[trackingPromise, journeyStatePromise\]\)/);
  assert.match(candidate, /const JOURNEY_STATE_REFRESH_MS = 30_000/);
  assert.doesNotMatch(
    namedFunction(candidate, "setMissionJourneyState"),
    /JSON\.stringify\(missionJourneyState\)\) return/,
    "unchanged shared state still repaints estimated road progress and arrival holds",
  );
  assert.match(candidate, /const hotelMarker = appendImageMarker/);
  assert.match(candidate, /willDisplay\.journeyOverride === true[\s\S]*willDisplay\.position/);
  const h = harness();
  const samples = [
    h.missionJourneyDisplayStateAt(Date.parse("2026-10-20T22:01:00-07:00"), noGarmin, emptyState),
    h.missionJourneyDisplayStateAt(Date.parse("2026-10-21T04:00:00-07:00"), noGarmin, emptyState),
    h.missionJourneyDisplayStateAt(Date.parse("2026-10-22T05:01:00-07:00"), noGarmin, emptyState),
    h.missionJourneyDisplayStateAt(Date.parse("2026-10-24T09:01:00-04:00"), noGarmin, emptyState),
  ];
  for (const sample of samples) assert.equal(Object.values(h.missionMarkerVisibility(sample, true)).filter(Boolean).length, 1);
});
