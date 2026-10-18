import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const baselinePath = "assets/releases/live-map-garmin-30m-freshness-2026-10-15/tracker-base.js";
const candidatePath = "assets/releases/mission-clock-race-schedule-2026-10-18/tracker-base.js";
const baseline = read(baselinePath);
const candidate = read(candidatePath);
const candidateHomePath = "mission-clock-race-schedule-release-2026-10-18-index.html";
const candidateLivePath = "mission-clock-race-schedule-release-2026-10-18-live-tracking.html";
const candidateHome = read(candidateHomePath);
const candidateLive = read(candidateLivePath);
const manifest = JSON.parse(read("deploy/manifests/releases/mission-clock-race-schedule-2026-10-18.json"));

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

function clockHarness() {
  return new Function(`
    const startDate = new Date("2026-10-09T15:00:00-10:00");
    const endDate = new Date("2026-11-01T23:59:59-05:00");
    ${constStatement(candidate, "MISSION_CLOCK_SCHEDULE")}
    ${namedFunction(candidate, "missionWindowStateAt")}
    ${namedFunction(candidate, "missionClockCurrentRaceAt")}
    ${namedFunction(candidate, "missionClockSubtextAt")}
    return { MISSION_CLOCK_SCHEDULE, missionClockCurrentRaceAt, missionClockSubtextAt };
  `)();
}

function assertTransition(clock, scheduledStart, previousLabel, currentLabel) {
  const start = Date.parse(scheduledStart);
  assert.equal(clock.missionClockSubtextAt(start - 1), previousLabel, `${scheduledStart} immediately before`);
  assert.equal(clock.missionClockSubtextAt(start), currentLabel, `${scheduledStart} exactly at`);
  assert.equal(clock.missionClockSubtextAt(start + 1), currentLabel, `${scheduledStart} immediately after`);
}

test("the definitive clock schedule has 50 ordered, timezone-aware race starts", () => {
  const { MISSION_CLOCK_SCHEDULE: schedule } = clockHarness();
  assert.equal(schedule.length, 50);
  assert.deepEqual(schedule.map(({ n }) => n), Array.from({ length: 50 }, (_, index) => index + 1));
  for (const [index, race] of schedule.entries()) {
    assert.match(race.scheduledStart, /^2026-(?:10|11)-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
    assert.doesNotThrow(() => new Intl.DateTimeFormat("en-US", { timeZone: race.timezone }).format(new Date(race.scheduledStart)));
    assert.ok(Number.isFinite(Date.parse(race.scheduledStart)), `race ${race.n} start parses`);
    if (index > 0) {
      assert.ok(Date.parse(race.scheduledStart) > Date.parse(schedule[index - 1].scheduledStart), `race ${race.n} follows race ${race.n - 1}`);
    }
  }
  assert.deepEqual(schedule.slice(17, 20), [
    { n: 18, state: "Iowa", city: "Decorah", scheduledStart: "2026-10-18T04:00:00-05:00", timezone: "America/Chicago" },
    { n: 19, state: "Minnesota", city: "Eitzen", scheduledStart: "2026-10-18T12:00:00-05:00", timezone: "America/Chicago" },
    { n: 20, state: "Wisconsin", city: "De Soto", scheduledStart: "2026-10-18T19:30:00-05:00", timezone: "America/Chicago" },
  ]);
  assert.deepEqual(schedule.slice(22, 27).map(({ n, state, city, scheduledStart }) => ({ n, state, city, scheduledStart })), [
    { n: 23, state: "Ohio", city: "Lyons", scheduledStart: "2026-10-20T00:00:00-04:00" },
    { n: 24, state: "Michigan", city: "Lambertville", scheduledStart: "2026-10-20T05:15:00-04:00" },
    { n: 25, state: "California", city: "Los Angeles", scheduledStart: "2026-10-20T17:00:00-07:00" },
    { n: 26, state: "Nevada", city: "Las Vegas", scheduledStart: "2026-10-21T10:30:00-07:00" },
    { n: 27, state: "Arizona", city: "Willow Beach / Hoover Dam", scheduledStart: "2026-10-21T18:00:00-07:00" },
  ]);
});

test("the mission clock changes at the exact start of all three October 18 races", () => {
  const clock = clockHarness();
  assertTransition(clock, "2026-10-18T04:00:00-05:00", "Current: Missouri · Kansas City", "Current: Iowa · Decorah");
  assertTransition(clock, "2026-10-18T12:00:00-05:00", "Current: Iowa · Decorah", "Current: Minnesota · Eitzen");
  assertTransition(clock, "2026-10-18T19:30:00-05:00", "Current: Minnesota · Eitzen", "Current: Wisconsin · De Soto");
});

test("explicit offsets make the label independent of the viewer timezone", () => {
  const clock = clockHarness();
  const equivalentInstants = [
    "2026-10-18T12:00:00-05:00",
    "2026-10-18T17:00:00Z",
    "2026-10-18T18:00:00+01:00",
    "2026-10-19T02:00:00+09:00",
  ];
  for (const instant of equivalentInstants) {
    assert.equal(clock.missionClockSubtextAt(Date.parse(instant)), "Current: Minnesota · Eitzen", instant);
  }
  assertTransition(clock, "2026-11-01T07:00:00-05:00", "Current: Maine · Kittery", "Current: New York · New York City");
});

test("completion counts, status gaps, Garmin data, and flight windows cannot override the scheduled label", () => {
  const clock = clockHarness();
  const texasCompletedWithThirteenTotal = {
    completedRaces: 13,
    totalRaces: 50,
    races: [{ n: 14, state: "Texas", city: "Dallas", status: "completed" }],
  };
  const freshGarmin = { kind: "fresh", position: { lat: 32.7767, lng: -96.797 }, observedAt: "2026-10-18T12:30:00-05:00" };
  const delayedStatusLabel = clock.missionClockSubtextAt(
    Date.parse("2026-10-18T13:00:00-05:00"),
    texasCompletedWithThirteenTotal,
    freshGarmin,
  );
  assert.equal(delayedStatusLabel, "Current: Minnesota · Eitzen");
  assert.equal(clock.missionClockSubtextAt(Date.parse("2026-10-18T13:00:00-05:00"), null, null), delayedStatusLabel);
  assert.equal(
    clock.missionClockSubtextAt(Date.parse("2026-10-20T20:00:00-07:00"), texasCompletedWithThirteenTotal, freshGarmin),
    "Current: California · Los Angeles",
    "an active scheduled flight does not replace the race schedule label",
  );
  const source = namedFunction(candidate, "missionClockSubtextAt");
  assert.doesNotMatch(source, /completedRaces|missionScheduledFlightAt|missionPostFlightPlacementAt|missionGarminRunner|routeStops/);
  assert.doesNotMatch(candidate, /function missionClockCompletedRaces|function missionClockFallbackStopAt|function missionClockStopForAirport/);
});

test("countdown and completion copy keep the existing mission behavior", () => {
  const clock = clockHarness();
  assert.equal(clock.missionClockSubtextAt(Date.parse("2026-10-09T14:59:59-10:00")), "October 9, 2026 · Honolulu");
  assert.equal(clock.missionClockSubtextAt(Date.parse("2026-10-09T15:00:00-10:00")), "Current: Hawaii · Honolulu");
  assert.equal(clock.missionClockSubtextAt(Date.parse("2026-11-01T23:59:59-05:00")), "Current: New York · New York City");
  assert.equal(clock.missionClockSubtextAt(Date.parse("2026-11-02T00:00:00-05:00")), "50 states complete · New York City");
});

test("initial load, async status refreshes, and the one-second timer all render from the clock schedule", () => {
  assert.match(candidate, /const initialMissionClockState = updateCountdown\(\)/);
  assert.match(candidate, /window\.setInterval\(\(\) => \{\s*if \(updateCountdown\(\) === "complete"\)/);
  assert.match(candidate, /subtext\.textContent = missionClockSubtextAt\(nowMs\)/);
  assert.match(namedFunction(candidate, "applyMissionRaceSnapshot"), /routeStops = snapshot\.races[\s\S]*updateCountdown\(\)/);
  assert.equal(
    namedFunction(candidate, "missionClockSubtextAt").includes("MISSION_CLOCK_SCHEDULE"),
    false,
    "the label uses the dedicated resolver rather than an async route array",
  );
  assert.match(namedFunction(candidate, "missionClockCurrentRaceAt"), /schedule = MISSION_CLOCK_SCHEDULE/);
});

test("map markers, feeds, flights, refresh intervals, and elapsed timer code remain unchanged", () => {
  for (const name of [
    "staticRouteStops", "MISSION_SCHEDULED_FLIGHTS", "MISSION_CLOCK_AIRPORT_STOPS",
    "GARMIN_MIN_REFRESH_MS", "GARMIN_FRESH_MS", "RV_REFRESH_MS",
  ]) assert.equal(sha256(constStatement(candidate, name)), sha256(constStatement(baseline, name)), name);
  for (const name of [
    "missionScheduledFlightAt", "missionPostFlightPlacementAt", "missionWillDisplayStateAt",
    "missionMarkerVisibility", "validMissionGarminFix", "setMissionGarminLocation",
    "createMissionGarminPoller", "missionGarminTrailPoints", "appendStaticFlightLegs",
    "scheduledFlightMarkerLeg", "appendFlightMarker", "rvMapVisible", "validMissionRvFix",
    "setMissionHapnLocation", "appendImageMarker", "renderMissionMap", "applyMissionRaceSnapshot",
    "updateCountdown",
  ]) assert.equal(sha256(namedFunction(candidate, name)), sha256(namedFunction(baseline, name)), name);
});

test("both public page documents change only the tracker cache key", () => {
  const baselineHome = read("garmin-30m-freshness-release-2026-10-15-index.html");
  const baselineLive = read("garmin-30m-freshness-release-2026-10-15-live-tracking.html");
  const oldTag = '<script defer src="/assets/tracker-base.js?v=20261015garmin-30m-freshness"></script>';
  const newTag = '<script defer src="/assets/tracker-base.js?v=20261018mission-clock-race-schedule"></script>';
  assert.equal(candidateHome, baselineHome.replace(oldTag, newTag));
  assert.equal(candidateLive, baselineLive.replace(oldTag, newTag));
  assert.equal(candidateHome, candidateLive);
});

test("the standard release manifest pins only the tracker and two page documents", () => {
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
      source: candidateHomePath,
      destination: "public_html/index.html",
      expectedSha256: sha256(candidateHome),
      expectedRemoteSha256: sha256(read("garmin-30m-freshness-release-2026-10-15-index.html")),
    },
    {
      source: candidateLivePath,
      destination: "public_html/live-tracking.html",
      expectedSha256: sha256(candidateLive),
      expectedRemoteSha256: sha256(read("garmin-30m-freshness-release-2026-10-15-live-tracking.html")),
    },
  ]);
  assert.doesNotMatch(JSON.stringify(manifest.files), /garmin-feed|\.htaccess|strava-race-map\.mjs|tracker-base\.css/i);
});
