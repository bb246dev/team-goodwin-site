import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const candidate = readFileSync(new URL(
  "../assets/releases/live-map-dl766-las-vegas-2026-10-20/tracker-base.js",
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
    ${constStatement(candidate, "MISSION_CLOCK_SCHEDULE")}
    ${constStatement(candidate, "MISSION_SCHEDULED_FLIGHTS")}
    ${constStatement(candidate, "MISSION_JOURNEY")}
    ${constStatement(candidate, "MISSION_CLOCK_AIRPORT_STOPS")}
    ${constStatement(candidate, "flightAirports")}
    ${constStatement(candidate, "flightItinerary")}
    let missionJourneyState = { available: false, transitions: {}, origins: {} };
    let missionGarminRunner = { kind: "unavailable", position: null, observedAt: null, trail: [] };
    ${namedFunction(candidate, "missionScheduledFlightAt")}
    ${namedFunction(candidate, "missionGarminLiveFreshAt")}
    ${namedFunction(candidate, "missionDistanceKm")}
    ${namedFunction(candidate, "missionQualifiedGarminRunAt")}
    ${namedFunction(candidate, "missionJourneyFlightDisplay")}
    ${namedFunction(candidate, "missionJourneyHotelDisplay")}
    ${namedFunction(candidate, "missionJourneyRunnerDisplay")}
    ${namedFunction(candidate, "missionJourneyDisplayStateAt")}
    ${namedFunction(candidate, "missionMarkerVisibility")}
    ${namedFunction(candidate, "scheduledFlightMarkerLeg")}
    return {
      MISSION_CLOCK_SCHEDULE, MISSION_SCHEDULED_FLIGHTS, MISSION_JOURNEY,
      MISSION_CLOCK_AIRPORT_STOPS, flightAirports, flightItinerary,
      missionJourneyDisplayStateAt, missionMarkerVisibility, scheduledFlightMarkerLeg
    };
  `)();
}

const noGarmin = { kind: "unavailable", position: null, observedAt: null, trail: [] };
const only = (visibility, name) => {
  assert.equal(Object.values(visibility).filter(Boolean).length, 1);
  assert.equal(visibility[name], true);
};
const visible = (h, display, name) => only(h.missionMarkerVisibility(display, true), name);
const runner = (observedAt, position, kind = "fresh") => ({
  available: true,
  validGpsFix: true,
  kind,
  observedAt,
  position: { ...position },
  trail: []
});

test("DL766 replaces the obsolete October 20 flight in every data representation", () => {
  const h = harness();
  const flight = h.MISSION_SCHEDULED_FLIGHTS.find(({ flight: id }) => id === "DL766");
  assert.deepEqual(flight, {
    flight: "DL766",
    operator: "Delta Air Lines",
    from: "KDTW",
    to: "KLAS",
    fromStop: 24,
    toStop: 26,
    destinationLabel: "Las Vegas airport",
    start: "2026-10-20T16:48:00-04:00",
    end: "2026-10-20T18:07:00-07:00"
  });
  assert.deepEqual(h.flightAirports.KDTW, { lat: 42.2124, lng: -83.3534 });
  assert.deepEqual(h.flightAirports.KLAS, { lat: 36.0803, lng: -115.1524 });
  assert.equal(h.MISSION_CLOCK_AIRPORT_STOPS.KDTW, 24);
  assert.equal(h.MISSION_CLOCK_AIRPORT_STOPS.KLAS, 26);
  const row = h.flightItinerary.find(({ flight: id }) => id === "DL766");
  assert.deepEqual(row, {
    date: "Oct 20",
    flight: "DL766",
    from: "KDTW",
    to: "KLAS",
    fromStop: 24,
    toStop: 26,
    time: "4:48 PM EDT - 6:07 PM PDT",
    airline: "Delta Air Lines"
  });
  assert.equal(h.scheduledFlightMarkerLeg({ ...flight, active: true, status: "IN TRANSIT" }), row);
  assert.doesNotMatch(candidate, /AA1360|American Airlines|KCMH|KLAX|Los Angeles airport/);
});

test("DL766 owns both exact boundaries and suppresses every other subject during the flight", () => {
  const h = harness();
  const departure = Date.parse("2026-10-20T16:48:00-04:00");
  const arrival = Date.parse("2026-10-20T18:07:00-07:00");
  const freshRunner = runner("2026-10-20T17:30:00-07:00", h.MISSION_JOURNEY.coordinates.losAngelesRace);
  assert.equal(h.missionJourneyDisplayStateAt(departure - 1, freshRunner), null);
  const atDeparture = h.missionJourneyDisplayStateAt(departure, freshRunner);
  assert.equal(atDeparture.phaseId, "flight-kdtw-to-klas");
  assert.equal(atDeparture.flight.from, "KDTW");
  assert.equal(atDeparture.flight.to, "KLAS");
  visible(h, atDeparture, "plane");
  visible(h, h.missionJourneyDisplayStateAt(arrival - 1, freshRunner), "plane");
  const atArrival = h.missionJourneyDisplayStateAt(arrival, noGarmin);
  assert.equal(atArrival.phaseId, "fontainebleau-las-vegas");
  assert.deepEqual(atArrival.position, { lat: 36.1374208, lng: -115.1592284 });
  visible(h, atArrival, "hotel");
});

test("the still-approved Los Angeles schedule can show only a qualified Garmin runner after landing", () => {
  const h = harness();
  const afterLanding = Date.parse("2026-10-20T18:08:00-07:00");
  const qualified = runner("2026-10-20T18:08:00-07:00", h.MISSION_JOURNEY.coordinates.losAngelesRace);
  const runDisplay = h.missionJourneyDisplayStateAt(afterLanding, qualified);
  assert.equal(runDisplay.phaseId, "los-angeles-run");
  visible(h, runDisplay, "runner");

  const previousRaceObservation = runner("2026-10-20T16:59:59-07:00", h.MISSION_JOURNEY.coordinates.losAngelesRace);
  visible(h, h.missionJourneyDisplayStateAt(afterLanding, previousRaceObservation), "hotel");
  const finish = Date.parse(h.MISSION_JOURNEY.losAngelesRaceEnd);
  visible(h, h.missionJourneyDisplayStateAt(finish, qualified), "hotel");
  visible(h, h.missionJourneyDisplayStateAt(finish + 1, runner(
    "2026-10-20T22:01:00-07:00", h.MISSION_JOURNEY.coordinates.losAngelesRace
  )), "hotel");
});

test("Las Vegas retains qualified Garmin positions for delayed updates through its scheduled finish", () => {
  const h = harness();
  const start = Date.parse(h.MISSION_JOURNEY.lasVegasRaceStart);
  const finish = Date.parse(h.MISSION_JOURNEY.lasVegasRaceEnd);
  const fix = runner(h.MISSION_JOURNEY.lasVegasRaceStart, h.MISSION_JOURNEY.coordinates.lasVegasRace);
  visible(h, h.missionJourneyDisplayStateAt(start - 1, fix), "hotel");
  const atStart = h.missionJourneyDisplayStateAt(start, fix);
  assert.equal(atStart.kind, "fresh");
  visible(h, atStart, "runner");
  const exactlyThirtyMinutes = h.missionJourneyDisplayStateAt(start + 30 * 60_000, fix);
  assert.equal(exactlyThirtyMinutes.kind, "fresh");
  assert.equal(exactlyThirtyMinutes.delayedUpdate, false);
  visible(h, exactlyThirtyMinutes, "runner");
  const delayed = h.missionJourneyDisplayStateAt(start + 31 * 60_000, fix);
  assert.equal(delayed.kind, "stale");
  assert.equal(delayed.delayedUpdate, true);
  assert.match(delayed.markerTitle, /last qualified runner position until the scheduled finish/);
  visible(h, delayed, "runner");
  visible(h, h.missionJourneyDisplayStateAt(finish - 1, fix), "runner");
  visible(h, h.missionJourneyDisplayStateAt(finish, fix), "hotel");
});

test("Arizona rejects stale prior-race observations and cannot reactivate after its finish", () => {
  const h = harness();
  const start = Date.parse(h.MISSION_JOURNEY.arizonaRaceStart);
  const finish = Date.parse(h.MISSION_JOURNEY.arizonaRaceEnd);
  const priorRace = runner("2026-10-21T15:29:00-07:00", h.MISSION_JOURNEY.coordinates.lasVegasRace);
  visible(h, h.missionJourneyDisplayStateAt(start, priorRace), "hotel");
  const qualified = runner(h.MISSION_JOURNEY.arizonaRaceStart, h.MISSION_JOURNEY.coordinates.willowBeachHooverDam);
  const active = h.missionJourneyDisplayStateAt(start, qualified);
  assert.equal(active.phaseId, "arizona-run");
  visible(h, active, "runner");
  const postFinish = runner("2026-10-21T23:01:00-07:00", h.MISSION_JOURNEY.coordinates.willowBeachHooverDam);
  visible(h, h.missionJourneyDisplayStateAt(finish, postFinish), "hotel");
  visible(h, h.missionJourneyDisplayStateAt(finish + 60_000, postFinish), "hotel");
});

test("all obsolete Las Vegas ground-travel phases resolve to the hotel and never the RV", () => {
  const h = harness();
  for (const instant of [
    "2026-10-20T22:01:00-07:00",
    "2026-10-21T15:30:00-07:00",
    "2026-10-21T16:50:00-07:00",
    "2026-10-21T23:00:00-07:00",
    "2026-10-22T00:50:00-07:00",
    "2026-10-22T04:59:59.999-07:00"
  ]) {
    const display = h.missionJourneyDisplayStateAt(Date.parse(instant), noGarmin);
    assert.equal(display.phaseId, "fontainebleau-las-vegas", instant);
    visible(h, display, "hotel");
  }
  assert.doesNotMatch(candidate, /losAngelesToFontainebleauLasVegas|lasVegasToArizona|arizonaToKlas/);
  assert.doesNotMatch(candidate, /missionLosAngelesOriginAt|missionJourneyTravelDisplay|missionLosAngelesDepartureOrigin/);
  assert.match(namedFunction(candidate, "setMissionGarminLocation"), /nextObservedMs >= currentObservedMs/);
  assert.doesNotMatch(candidate, /showRv:\s*true/);
});

test("the approved KLAS to KLIT flight is unchanged, wins at departure, and restores normal rules on arrival", () => {
  const h = harness();
  const flight = h.MISSION_SCHEDULED_FLIGHTS.find(({ from, to }) => from === "KLAS" && to === "KLIT");
  assert.deepEqual(flight, {
    flight: "TBD",
    operator: "Jet Excellence",
    from: "KLAS",
    to: "KLIT",
    fromStop: 26,
    toStop: 28,
    destinationLabel: "Little Rock airport",
    start: "2026-10-22T05:00:00-07:00",
    end: "2026-10-22T09:42:00-05:00"
  });
  const departure = Date.parse(flight.start);
  const arrival = Date.parse(flight.end);
  visible(h, h.missionJourneyDisplayStateAt(departure - 1, noGarmin), "hotel");
  visible(h, h.missionJourneyDisplayStateAt(departure, runner(
    "2026-10-22T05:00:00-07:00", h.MISSION_JOURNEY.coordinates.willowBeachHooverDam
  )), "plane");
  visible(h, h.missionJourneyDisplayStateAt(arrival - 1, noGarmin), "plane");
  assert.equal(h.missionJourneyDisplayStateAt(arrival, noGarmin), null);
  assert.equal(h.missionJourneyDisplayStateAt(arrival + 1, noGarmin), null);
});

test("Miami overrides and the definitive race clock remain unchanged", () => {
  const h = harness();
  const losAngeles = h.MISSION_CLOCK_SCHEDULE.find(({ n }) => n === 25);
  const lasVegas = h.MISSION_CLOCK_SCHEDULE.find(({ n }) => n === 26);
  const arizona = h.MISSION_CLOCK_SCHEDULE.find(({ n }) => n === 27);
  assert.equal(losAngeles.scheduledStart, h.MISSION_JOURNEY.losAngelesRunStart);
  assert.equal(lasVegas.scheduledStart, h.MISSION_JOURNEY.lasVegasRaceStart);
  assert.equal(arizona.scheduledStart, h.MISSION_JOURNEY.arizonaRaceStart);
  visible(h, h.missionJourneyDisplayStateAt(Date.parse("2026-10-23T21:00:00-04:00"), noGarmin), "hotel");
  visible(h, h.missionJourneyDisplayStateAt(Date.parse("2026-10-23T22:00:00-04:00"), noGarmin), "plane");
  visible(h, h.missionJourneyDisplayStateAt(Date.parse("2026-10-24T14:00:00-04:00"), noGarmin), "hotel");
  visible(h, h.missionJourneyDisplayStateAt(Date.parse("2026-10-24T16:21:00-04:00"), noGarmin), "plane");
  assert.equal(h.missionJourneyDisplayStateAt(Date.parse("2026-10-24T18:24:00-04:00"), noGarmin), null);
});

test("initial load, exact boundaries, and background resume are wired to repaint current state", () => {
  assert.match(candidate, /await Promise\.all\(\[trackingPromise, journeyStatePromise\]\)/);
  const boundaries = constStatement(candidate, "MISSION_JOURNEY_BOUNDARIES");
  for (const name of [
    "detroitFlightDeparture", "lasVegasFlightArrival", "losAngelesRaceEnd",
    "lasVegasRaceEnd", "arizonaRaceEnd", "arkansasFlightDeparture", "arkansasFlightArrival"
  ]) assert.match(boundaries, new RegExp(`MISSION_JOURNEY\\.${name}`));
  const scheduler = namedFunction(candidate, "createMissionAirportPlacementScheduler");
  assert.match(scheduler, /visibilitychange/);
  assert.match(scheduler, /onTransition\(Number\(now\(\)\)\)/);
  assert.match(scheduler, /schedule\(\)/);
});

test("unrelated feeds, polling intervals, flight schedule, and marker exclusivity stay intact", () => {
  assert.match(candidate, /const GARMIN_MIN_REFRESH_MS = 120_000/);
  assert.match(candidate, /const GARMIN_FRESH_MS = 30 \* 60_000/);
  assert.match(candidate, /const RV_REFRESH_MS = 120_000/);
  assert.match(candidate, /const JOURNEY_STATE_REFRESH_MS = 30_000/);
  assert.match(candidate, /const GARMIN_KML_MODULE_URL = "\/tracking-preview\/assets\/garmin-kml-af3a85bfc4b14a78\.mjs"/);
  assert.match(candidate, /const STRAVA_RACE_MODULE_URL = "\/assets\/strava-race-map\.mjs"/);
  assert.match(candidate, /const RV_LOCATION_ENDPOINT = "\/strava\/public\/tracking-status"/);
  assert.match(candidate, /flight: "N525CR"[\s\S]*flight: "DL1323"/);
  const h = harness();
  const samples = [
    h.missionJourneyDisplayStateAt(Date.parse("2026-10-20T16:49:00-04:00"), noGarmin),
    h.missionJourneyDisplayStateAt(Date.parse("2026-10-20T18:08:00-07:00"), noGarmin),
    h.missionJourneyDisplayStateAt(Date.parse("2026-10-21T10:31:00-07:00"), runner(
      "2026-10-21T10:31:00-07:00", h.MISSION_JOURNEY.coordinates.lasVegasRace
    )),
    h.missionJourneyDisplayStateAt(Date.parse("2026-10-22T05:01:00-07:00"), noGarmin),
    h.missionJourneyDisplayStateAt(Date.parse("2026-10-24T09:01:00-04:00"), noGarmin)
  ];
  for (const sample of samples) {
    assert.equal(Object.values(h.missionMarkerVisibility(sample, true)).filter(Boolean).length, 1);
  }
});

test("both production documents change only the tracker cache key", () => {
  const previous = readFileSync(new URL("../live-map-journey-overrides-release-2026-10-18-index.html", import.meta.url), "utf8");
  for (const name of [
    "live-map-dl766-las-vegas-release-2026-10-20-index.html",
    "live-map-dl766-las-vegas-release-2026-10-20-live-tracking.html"
  ]) {
    const html = readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
    assert.match(html, /\/assets\/tracker-base\.js\?v=20261020dl766-las-vegas/);
    assert.equal(
      html.replace("20261020dl766-las-vegas", "20261018scheduled-ends"),
      previous,
      name
    );
  }
});

test("the release manifest pins only the tracker and two route documents", () => {
  const manifest = JSON.parse(readFileSync(new URL(
    "../deploy/manifests/releases/live-map-dl766-las-vegas-2026-10-20.json",
    import.meta.url,
  ), "utf8"));
  assert.equal(manifest.deploymentType, "static");
  assert.equal(manifest.releaseType, "standard");
  assert.deepEqual(manifest.files.map(({ destination }) => destination), [
    "public_html/assets/tracker-base.js",
    "public_html/index.html",
    "public_html/live-tracking.html"
  ]);
  assert.deepEqual(manifest.validation.browserRoutes, ["/", "/live-tracking.html", "/live-tracking/"]);
  for (const file of manifest.files) {
    const bytes = readFileSync(new URL(`../${file.source}`, import.meta.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), file.expectedSha256, file.source);
  }
});
