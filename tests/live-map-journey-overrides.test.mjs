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
  assert.equal(journey.lasVegasRaceEnd, "2026-10-21T15:30:00-07:00");
  assert.equal(journey.arizonaRaceEnd, "2026-10-21T23:00:00-07:00");
  assert.equal(journey.miamiRaceEnd, "2026-10-24T14:00:00-04:00");
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

test("Las Vegas and Arizona switch automatically at their definitive scheduled ends", () => {
  const h = harness();
  const legacyState = structuredClone(emptyState);
  legacyState.transitions["las-vegas-race-finished"] = transition(
    "las-vegas-race-finished", "2026-10-21T12:00:00-07:00", "drive-las-vegas-to-arizona",
  );
  legacyState.transitions["arizona-race-finished"] = transition(
    "arizona-race-finished", "2026-10-21T20:00:00-07:00", "drive-arizona-to-klas",
  );
  const lasVegasRunner = {
    available: true,
    validGpsFix: true,
    kind: "fresh",
    observedAt: "2026-10-21T15:30:00-07:00",
    position: { ...h.MISSION_JOURNEY.coordinates.lasVegasRace },
    trail: [],
  };
  assert.equal(
    h.missionJourneyDisplayStateAt(Date.parse("2026-10-21T15:29:59.999-07:00"), lasVegasRunner, legacyState).phaseId,
    "las-vegas-run",
  );
  const start = h.missionJourneyDisplayStateAt(
    Date.parse(h.MISSION_JOURNEY.lasVegasRaceEnd), lasVegasRunner, legacyState,
  );
  assert.equal(start.phaseId, "drive-las-vegas-to-arizona");
  assert.equal(start.progress, 0);
  only(h.missionMarkerVisibility(start, true), "rv");
  assert.equal(
    h.missionJourneyDisplayStateAt(Date.parse(h.MISSION_JOURNEY.lasVegasRaceEnd) + 1, lasVegasRunner, legacyState).phaseId,
    "drive-las-vegas-to-arizona",
  );
  const exactArrival = h.missionJourneyDisplayStateAt(
    Date.parse("2026-10-21T16:50:00-07:00"), lasVegasRunner, legacyState,
  );
  assert.equal(exactArrival.kind, "drive-arrived");
  assert.deepEqual(exactArrival.position, h.MISSION_JOURNEY.coordinates.willowBeachHooverDam);
  const held = h.missionJourneyDisplayStateAt(Date.parse("2026-10-21T17:59:59.999-07:00"), noGarmin, legacyState);
  assert.equal(held.progress, 1);
  only(h.missionMarkerVisibility(held, true), "rv");

  const arizonaRunner = {
    ...lasVegasRunner,
    observedAt: "2026-10-21T23:00:00-07:00",
    position: { ...h.MISSION_JOURNEY.coordinates.willowBeachHooverDam },
  };
  assert.equal(
    h.missionJourneyDisplayStateAt(Date.parse("2026-10-21T22:59:59.999-07:00"), arizonaRunner, legacyState).phaseId,
    "arizona-run",
  );
  const arizonaEnd = h.missionJourneyDisplayStateAt(
    Date.parse(h.MISSION_JOURNEY.arizonaRaceEnd), arizonaRunner, legacyState,
  );
  assert.equal(arizonaEnd.phaseId, "drive-arizona-to-klas");
  assert.equal(arizonaEnd.progress, 0);
  only(h.missionMarkerVisibility(arizonaEnd, true), "rv");
  assert.equal(
    h.missionJourneyDisplayStateAt(Date.parse(h.MISSION_JOURNEY.arizonaRaceEnd) + 1, arizonaRunner, legacyState).phaseId,
    "drive-arizona-to-klas",
  );
  const klas = h.missionJourneyDisplayStateAt(Date.parse("2026-10-22T00:50:00-07:00"), arizonaRunner, legacyState);
  assert.equal(klas.kind, "drive-arrived");
  assert.deepEqual(klas.position, h.MISSION_JOURNEY.coordinates.klas);
});

test("subsequent Garmin fixes cannot reactivate either completed race", () => {
  const h = harness();
  const runner = {
    available: true,
    validGpsFix: true,
    kind: "fresh",
    observedAt: "2026-10-22T04:59:00-07:00",
    position: { lat: 35.876, lng: -114.661 },
    trail: [],
  };
  for (const instant of ["2026-10-21T23:00:00-07:00", "2026-10-22T00:50:00-07:00", "2026-10-22T04:59:59.999-07:00"]) {
    const display = h.missionJourneyDisplayStateAt(Date.parse(instant), runner, emptyState);
    assert.equal(display.phaseId, "drive-arizona-to-klas", instant);
    only(h.missionMarkerVisibility(display, true), "rv");
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
  only(h.missionMarkerVisibility(h.missionJourneyDisplayStateAt(departure - 1, noGarmin, state), true), "rv");
  only(h.missionMarkerVisibility(h.missionJourneyDisplayStateAt(departure, noGarmin, state), true), "plane");
  only(h.missionMarkerVisibility(h.missionJourneyDisplayStateAt(arrival - 1, noGarmin, state), true), "plane");
  assert.equal(h.missionJourneyDisplayStateAt(arrival, noGarmin, state), null);
  assert.equal(h.missionJourneyDisplayStateAt(arrival + 1, noGarmin, state), null);
});

test("Miami switches automatically to the hotel at the definitive end and flights retain precedence", () => {
  const h = harness();
  const state = structuredClone(emptyState);
  state.transitions["miami-race-finished"] = transition(
    "miami-race-finished", "2026-10-24T10:00:00-04:00", "fontainebleau-miami-hotel",
  );
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
  const lateRunner = {
    available: true,
    validGpsFix: true,
    kind: "fresh",
    observedAt: "2026-10-24T14:01:00-04:00",
    position: { ...h.MISSION_JOURNEY.coordinates.miamiRace },
    trail: [],
  };
  only(h.missionMarkerVisibility(
    h.missionJourneyDisplayStateAt(Date.parse("2026-10-24T13:59:59.999-04:00"), lateRunner, state), true,
  ), "runner");
  only(h.missionMarkerVisibility(
    h.missionJourneyDisplayStateAt(Date.parse("2026-10-24T14:00:00-04:00"), lateRunner, state), true,
  ), "hotel");
  assert.equal(
    h.missionJourneyDisplayStateAt(Date.parse("2026-10-24T14:01:00-04:00"), lateRunner, state).phaseId,
    "fontainebleau-miami-after-race",
  );
  only(h.missionMarkerVisibility(
    h.missionJourneyDisplayStateAt(Date.parse("2026-10-24T16:20:59.999-04:00"), lateRunner, state), true,
  ), "hotel");
  only(h.missionMarkerVisibility(
    h.missionJourneyDisplayStateAt(Date.parse("2026-10-24T16:21:00-04:00"), noGarmin, state), true,
  ), "plane");
  only(h.missionMarkerVisibility(
    h.missionJourneyDisplayStateAt(Date.parse("2026-10-24T18:23:59.999-04:00"), noGarmin, state), true,
  ), "plane");
  assert.equal(h.missionJourneyDisplayStateAt(Date.parse("2026-10-24T18:24:00-04:00"), noGarmin, state), null);
});

test("automatic scheduled finishes are viewer-timezone independent and ignore unavailable legacy state", () => {
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
    assert.equal(display.phaseId, "drive-las-vegas-to-arizona", instant);
    only(h.missionMarkerVisibility(display, true), "rv");
  }
});

test("finish instants are explicit scheduler boundaries and background resume repaints immediately", () => {
  const boundaries = constStatement(candidate, "MISSION_JOURNEY_BOUNDARIES");
  for (const name of ["lasVegasRaceEnd", "arizonaRaceEnd", "miamiRaceEnd"]) {
    assert.match(boundaries, new RegExp(`MISSION_JOURNEY\\.${name}`));
  }
  const scheduler = namedFunction(candidate, "createMissionAirportPlacementScheduler");
  assert.match(scheduler, /visibilitychange/);
  assert.match(scheduler, /onTransition\(Number\(now\(\)\)\)/);
  assert.match(scheduler, /schedule\(\)/);

  const boundary = Date.parse("2026-10-21T15:30:00-07:00");
  let current = boundary - 1;
  let scheduled = null;
  const listeners = new Map();
  const transitions = [];
  const documentObject = {
    hidden: false,
    addEventListener(name, callback) { listeners.set(name, callback); },
    removeEventListener(name) { listeners.delete(name); },
  };
  const create = new Function(`
    const MISSION_AIRPORT_BOUNDARIES = [${boundary}];
    const missionScheduledFlightAt = () => null;
    const missionJourneyDisplayStateAt = () => ({ animate: false });
    ${scheduler}
    return createMissionAirportPlacementScheduler;
  `)();
  const instance = create({
    onTransition: (now) => transitions.push(now),
    now: () => current,
    setTimeoutImpl: (callback, delay) => { scheduled = { callback, delay }; return 1; },
    clearTimeoutImpl: () => { scheduled = null; },
    documentObject,
  });
  instance.start();
  assert.equal(scheduled.delay, 1);
  current = boundary;
  scheduled.callback();
  assert.deepEqual(transitions, [boundary]);
  current = boundary + 60_000;
  listeners.get("visibilitychange")();
  assert.deepEqual(transitions, [boundary, boundary + 60_000]);
  instance.destroy();
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
