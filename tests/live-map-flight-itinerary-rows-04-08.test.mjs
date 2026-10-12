import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const baselinePath = "assets/releases/live-map-pdx-slc-landed-2026-10-11/tracker-base.js";
const candidatePath = "assets/releases/live-map-flight-itinerary-rows-04-08-2026-10-11/tracker-base.js";
const baseline = read(baselinePath);
const candidate = read(candidatePath);
const baselineHome = read("pdx-slc-landed-release-2026-10-11-index.html");
const baselineLive = read("pdx-slc-landed-release-2026-10-11-live-tracking.html");
const candidateHome = read("flight-itinerary-rows-04-08-release-2026-10-11-index.html");
const candidateLive = read("flight-itinerary-rows-04-08-release-2026-10-11-live-tracking.html");
const manifest = JSON.parse(read("deploy/manifests/releases/live-map-flight-itinerary-rows-04-08-2026-10-11.json"));

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

function evaluateConstants(source, names) {
  return new Function(`${names.map((name) => constStatement(source, name)).join("\n")}\nreturn { ${names.join(", ")} };`)();
}

function priorityHarness() {
  return new Function(`
    const GARMIN_FRESH_MS = 10 * 60_000;
    ${constStatement(candidate, "MISSION_SCHEDULED_FLIGHTS")}
    ${namedFunction(candidate, "missionScheduledFlightAt")}
    ${namedFunction(candidate, "missionWillDisplayStateAt")}
    ${namedFunction(candidate, "missionMarkerVisibility")}
    return { MISSION_SCHEDULED_FLIGHTS, missionScheduledFlightAt, missionWillDisplayStateAt, missionMarkerVisibility };
  `)();
}

function clockHarness() {
  return new Function(`
    ${constStatement(candidate, "staticRouteStops")}
    let routeStops = staticRouteStops;
    let missionTrackingStatusSnapshot = null;
    let missionGarminRunner = { kind: "unavailable", position: null, observedAt: null, trail: [] };
    const startDate = new Date("2026-10-09T15:00:00-10:00");
    const endDate = new Date("2026-11-01T23:59:59-05:00");
    ${constStatement(candidate, "MISSION_SCHEDULED_FLIGHTS")}
    ${constStatement(candidate, "MISSION_CLOCK_AIRPORT_STOPS")}
    ${constStatement(candidate, "flightAirports")}
    ${namedFunction(candidate, "missionScheduledFlightAt")}
    ${namedFunction(candidate, "missionPostFlightPlacementAt")}
    ${namedFunction(candidate, "missionWindowStateAt")}
    ${namedFunction(candidate, "missionClockCompletedRaces")}
    ${namedFunction(candidate, "missionClockFallbackStopAt")}
    ${namedFunction(candidate, "missionClockStopForAirport")}
    ${namedFunction(candidate, "missionClockSubtextAt")}
    return { missionClockSubtextAt };
  `)();
}

const newFlights = [
  {
    flight: "N978X", operator: "Paradigm Jet Management", from: "KABQ", to: "KDAL",
    fromStop: 13, toStop: 14, destinationLabel: "Dallas airport",
    start: "2026-10-16T03:00:00-06:00", end: "2026-10-16T05:41:00-05:00",
  },
  {
    flight: "AA1360", operator: "American Airlines", from: "KCMH", to: "KLAX",
    fromStop: 24, toStop: 26, destinationLabel: "Los Angeles airport",
    start: "2026-10-20T19:03:00-04:00", end: "2026-10-20T21:11:00-07:00",
  },
  {
    flight: "TBD", operator: "Jet Excellence", from: "KLAS", to: "KLIT",
    fromStop: 26, toStop: 28, destinationLabel: "Little Rock airport",
    start: "2026-10-22T05:00:00-07:00", end: "2026-10-22T09:42:00-05:00",
  },
  {
    flight: "N525CR", operator: "Skyway Aviation", from: "KTCL", to: "KOPF",
    fromStop: 31, toStop: 32, destinationLabel: "Miami/Opa-locka airport",
    start: "2026-10-23T21:00:00-05:00", end: "2026-10-23T23:54:00-04:00",
  },
  {
    flight: "DL1323", operator: "Delta Airlines", from: "KMIA", to: "KATL",
    fromStop: 32, toStop: 33, destinationLabel: "Atlanta airport",
    start: "2026-10-24T16:21:00-04:00", end: "2026-10-24T18:24:00-04:00",
  },
];

const unavailableRunner = { kind: "unavailable", position: null, observedAt: null, trail: [] };

test("the earlier three completed flight records remain exact", () => {
  const prior = evaluateConstants(baseline, ["MISSION_SCHEDULED_FLIGHTS", "flightItinerary"]);
  const next = evaluateConstants(candidate, ["MISSION_SCHEDULED_FLIGHTS", "flightItinerary"]);
  assert.deepEqual(next.MISSION_SCHEDULED_FLIGHTS.slice(0, 3), prior.MISSION_SCHEDULED_FLIGHTS.slice(0, 3));
  assert.deepEqual(next.flightItinerary.slice(0, 3), prior.flightItinerary.slice(0, 3));
});

test("rows 04 through 08 carry the supplied aircraft, operators, routes, stops, labels, and offset timestamps", () => {
  const h = priorityHarness();
  assert.deepEqual(h.MISSION_SCHEDULED_FLIGHTS.slice(3), newFlights);
});

test("every updated flight activates on departure and deactivates immediately on arrival", () => {
  const h = priorityHarness();
  for (const flight of newFlights) {
    const start = Date.parse(flight.start);
    const end = Date.parse(flight.end);
    assert.equal(h.missionScheduledFlightAt(start - 1), null, `${flight.from} before departure`);
    assert.equal(h.missionScheduledFlightAt(start)?.from, flight.from, `${flight.from} at departure`);
    assert.equal(h.missionScheduledFlightAt(end - 1)?.to, flight.to, `${flight.to} before arrival`);
    assert.equal(h.missionScheduledFlightAt(end), null, `${flight.to} at arrival`);
  }
});

test("each active window selects only the plane and each arrival falls through to RV", () => {
  const h = priorityHarness();
  for (const flight of newFlights) {
    const start = Date.parse(flight.start);
    const end = Date.parse(flight.end);
    const active = h.missionWillDisplayStateAt((start + end) / 2, unavailableRunner);
    assert.equal(active.kind, "flight", flight.flight);
    assert.deepEqual(h.missionMarkerVisibility(active, true), {
      runner: false,
      plane: true,
      rv: false,
    }, flight.flight);

    const arrived = h.missionWillDisplayStateAt(end, unavailableRunner);
    assert.notEqual(arrived.kind, "flight", flight.flight);
    assert.deepEqual(h.missionMarkerVisibility(arrived, true), {
      runner: false,
      plane: false,
      rv: true,
    }, flight.flight);
  }
});

test("airport endpoint coordinates and mission-clock stop mappings cover every updated ICAO code", () => {
  const { flightAirports, MISSION_CLOCK_AIRPORT_STOPS } = evaluateConstants(candidate, [
    "flightAirports", "MISSION_CLOCK_AIRPORT_STOPS",
  ]);
  assert.deepEqual(flightAirports, {
    HNL: { lat: 21.3187, lng: -157.9225, insetOffset: [6, 2] },
    ANC: { lat: 61.1743, lng: -149.9985, insetOffset: [5, -4] },
    PDX: { lat: 45.5898, lng: -122.5951 },
    SLC: { lat: 40.7899, lng: -111.9791 },
    KABQ: { lat: 35.0389, lng: -106.6083 },
    KDAL: { lat: 32.8459, lng: -96.8509 },
    KCMH: { lat: 39.9969, lng: -82.8922 },
    KLAX: { lat: 33.9425, lng: -118.408 },
    KLAS: { lat: 36.0803, lng: -115.1524 },
    KLIT: { lat: 34.7294, lng: -92.2248 },
    KTCL: { lat: 33.2206, lng: -87.6114 },
    KOPF: { lat: 25.9074, lng: -80.2782 },
    KMIA: { lat: 25.7954, lng: -80.2901 },
    KATL: { lat: 33.6367, lng: -84.4279 },
  });
  assert.deepEqual(MISSION_CLOCK_AIRPORT_STOPS, {
    HNL: 1, ANC: 2, PDX: 3, SLC: 5,
    KABQ: 13, KDAL: 14, KCMH: 24, KLAX: 25, KLAS: 26,
    KLIT: 28, KTCL: 31, KOPF: 32, KMIA: 32, KATL: 33,
  });
});

test("the mission clock resolves all five updated airport pairs to route cities", () => {
  const h = clockHarness();
  const expected = [
    "In transit: New Mexico / Albuquerque → Texas / Dallas",
    "In transit: Ohio / Columbus → California / Los Angeles",
    "In transit: Nevada / Las Vegas → Arkansas / Little Rock",
    "In transit: Alabama / Tuscaloosa → Florida / Miami",
    "In transit: Florida / Miami → Georgia / Atlanta",
  ];
  newFlights.forEach((flight, index) => {
    const midpoint = (Date.parse(flight.start) + Date.parse(flight.end)) / 2;
    assert.equal(h.missionClockSubtextAt(midpoint), expected[index], flight.flight);
  });
});

test("static flight legs use the new airport pairs and supplied Eastern display equivalents", () => {
  const { flightItinerary } = evaluateConstants(candidate, ["flightItinerary"]);
  assert.deepEqual(flightItinerary.slice(3), [
    { date: "Oct 16", flight: "N978X", from: "KABQ", to: "KDAL", fromStop: 13, toStop: 14, time: "5:00 AM ET - 6:41 AM ET", airline: "Paradigm Jet Management" },
    { date: "Oct 20", flight: "AA1360", from: "KCMH", to: "KLAX", fromStop: 24, toStop: 26, time: "7:03 PM ET - 12:11 AM ET", airline: "American Airlines" },
    { date: "Oct 22", flight: "TBD", from: "KLAS", to: "KLIT", fromStop: 26, toStop: 28, time: "8:00 AM ET - 10:42 AM ET", airline: "Jet Excellence" },
    { date: "Oct 23", flight: "N525CR", from: "KTCL", to: "KOPF", fromStop: 31, toStop: 32, time: "10:00 PM ET - 11:54 PM ET", airline: "Skyway Aviation" },
    { date: "Oct 24", flight: "DL1323", from: "KMIA", to: "KATL", fromStop: 32, toStop: 33, time: "4:21 PM ET - 6:24 PM ET", airline: "Delta Airlines" },
  ]);
  assert.match(namedFunction(candidate, "appendStaticFlightLegs"), /flightAirportPoint\(flight\.from, centroids\)/);
  assert.match(namedFunction(candidate, "appendStaticFlightLegs"), /flightAirportPoint\(flight\.to, centroids\)/);
});

test("only coordinated flight configuration and production cache keys change", () => {
  let expected = baseline;
  for (const name of [
    "MISSION_SCHEDULED_FLIGHTS", "MISSION_CLOCK_AIRPORT_STOPS", "flightAirports", "flightItinerary",
  ]) {
    expected = expected.replace(constStatement(baseline, name), constStatement(candidate, name));
  }
  assert.equal(candidate, expected);
  for (const name of [
    "missionScheduledFlightAt", "missionPostFlightPlacementAt", "missionWillDisplayStateAt",
    "missionMarkerVisibility", "missionClockSubtextAt", "appendStaticFlightLegs",
    "scheduledFlightMarkerLeg", "appendFlightMarker", "renderMissionMap", "rvMapVisible",
    "validMissionGarminFix", "createMissionGarminPoller", "applyMissionRaceSnapshot",
  ]) {
    assert.equal(sha256(namedFunction(candidate, name)), sha256(namedFunction(baseline, name)), name);
  }

  const oldTag = '<script defer src="/assets/tracker-base.js?v=20261011pdx-slc-landed"></script>';
  const newTag = '<script defer src="/assets/tracker-base.js?v=20261011flight-itinerary-rows-04-08"></script>';
  assert.equal(candidateHome, baselineHome.replace(oldTag, newTag));
  assert.equal(candidateLive, baselineLive.replace(oldTag, newTag));
});

test("the standard release contains only the live tracker and two cache-key pages", () => {
  assert.equal(manifest.releaseType, "standard");
  assert.deepEqual(manifest.protectedPathsApproved, ["public_html/assets/tracker-base.js"]);
  assert.deepEqual(manifest.files.map(({ source, destination, expectedSha256, expectedRemoteSha256 }) => ({
    source, destination, expectedSha256, expectedRemoteSha256,
  })), [
    {
      source: candidatePath,
      destination: "public_html/assets/tracker-base.js",
      expectedSha256: sha256(candidate),
      expectedRemoteSha256: sha256(baseline),
    },
    {
      source: "flight-itinerary-rows-04-08-release-2026-10-11-index.html",
      destination: "public_html/index.html",
      expectedSha256: sha256(candidateHome),
      expectedRemoteSha256: sha256(baselineHome),
    },
    {
      source: "flight-itinerary-rows-04-08-release-2026-10-11-live-tracking.html",
      destination: "public_html/live-tracking.html",
      expectedSha256: sha256(candidateLive),
      expectedRemoteSha256: sha256(baselineLive),
    },
  ]);
  assert.doesNotMatch(JSON.stringify(manifest.files), /garmin-feed|\.htaccess|strava-race-map\.mjs|tracker-base\.css|tracking-preview/i);
});
