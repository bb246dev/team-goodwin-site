import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  STATIC_AIRPORT_PLACEMENTS,
  createStaticAirportPlacementScheduler,
  scheduledAirportPlacementAt,
  scheduledAirportPlacementsAt,
} from "../assets/main-site-map-airport-overrides-2026-09-29/strava-race-map.mjs";

const baseRoot = new URL(
  "../production-merge/mission-window-alignment-2026-09-09/public_html/assets/",
  import.meta.url,
);
const candidateRoot = new URL(
  "../assets/main-site-map-airport-overrides-2026-09-29/",
  import.meta.url,
);
const baseTracker = readFileSync(new URL("tracker-base.js", baseRoot), "utf8");
const baseModule = readFileSync(new URL("strava-race-map.mjs", baseRoot), "utf8");
const candidateTracker = readFileSync(new URL("tracker-base.js", candidateRoot), "utf8");
const candidateModule = readFileSync(new URL("strava-race-map.mjs", candidateRoot), "utf8");
const hash = (value) => createHash("sha256").update(value).digest("hex");

function namedFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing function ${name}`);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`unterminated function ${name}`);
}

function block(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `missing block ${start}`);
  return source.slice(from, to);
}

test("candidate starts from the exact live main-site map assets", () => {
  assert.equal(hash(baseTracker), "a5cefc6b5da47c0a186c175779e571cca0dafde6b0356ce9e0a934158cf5065e");
  assert.equal(hash(baseModule), "bf93f69c291f96cd6a80602250d119584d2b4c01137fb1b23011e3c25a800c1c");
});

test("the main-site module declares exactly the four approved half-open airport windows", () => {
  assert.deepEqual(STATIC_AIRPORT_PLACEMENTS.map(({ subject, airportCode, start, end, position }) => ({
    subject, airportCode, start, end, position,
  })), [
    { subject: "will", airportCode: "HNL", start: "2026-10-09T21:11:00-10:00", end: "2026-10-09T23:00:00-10:00", position: { lat: 21.3187, lng: -157.9225 } },
    { subject: "will", airportCode: "ANC", start: "2026-10-10T14:00:00-08:00", end: "2026-10-10T15:51:00-08:00", position: { lat: 61.1743, lng: -149.9985 } },
    { subject: "rv", airportCode: "PDX", start: "2026-10-11T04:00:00-07:00", end: "2026-10-11T08:00:00-07:00", position: { lat: 45.5898, lng: -122.5951 } },
    { subject: "will", airportCode: "PDX", start: "2026-10-11T13:00:00-07:00", end: "2026-10-11T17:00:00-07:00", position: { lat: 45.5898, lng: -122.5951 } },
  ]);

  for (const placement of STATIC_AIRPORT_PLACEMENTS) {
    assert.equal(scheduledAirportPlacementAt(placement.subject, Date.parse(placement.start) - 1), null);
    assert.equal(scheduledAirportPlacementAt(placement.subject, Date.parse(placement.start))?.airportCode, placement.airportCode);
    assert.equal(scheduledAirportPlacementAt(placement.subject, Date.parse(placement.end) - 1)?.airportCode, placement.airportCode);
    assert.equal(scheduledAirportPlacementAt(placement.subject, Date.parse(placement.end)), null);
  }
  assert.deepEqual(scheduledAirportPlacementsAt(Date.parse("2026-10-11T04:00:00-07:00")), {
    will: null,
    rv: {
      subject: "rv", airportCode: "PDX", label: "Portland airport",
      start: "2026-10-11T04:00:00-07:00", end: "2026-10-11T08:00:00-07:00",
      position: { lat: 45.5898, lng: -122.5951 },
    },
  });
});

test("airport instants are independent of the browser timezone", () => {
  const expression = `process.stdout.write(JSON.stringify(${JSON.stringify(STATIC_AIRPORT_PLACEMENTS)}.map((p)=>[Date.parse(p.start),Date.parse(p.end)])))`;
  const expected = execFileSync(process.execPath, ["-e", expression], { encoding: "utf8", env: { ...process.env, TZ: "UTC" } });
  for (const timezone of ["Pacific/Honolulu", "America/Anchorage", "America/Los_Angeles", "Europe/London", "Asia/Tokyo"]) {
    assert.equal(execFileSync(process.execPath, ["-e", expression], {
      encoding: "utf8", env: { ...process.env, TZ: timezone },
    }), expected, timezone);
  }
});

test("the transition scheduler rerenders at starts and ends without gating provider polling", () => {
  let nowMs = Date.parse("2026-10-09T21:10:59-10:00");
  const timers = [];
  const cleared = [];
  const transitions = [];
  const scheduler = createStaticAirportPlacementScheduler({
    now: () => nowMs,
    setTimeoutImpl(callback, delay) {
      timers.push({ callback, delay });
      return timers.length;
    },
    clearTimeoutImpl(id) { cleared.push(id); },
    documentObject: { hidden: false, addEventListener() {}, removeEventListener() {} },
    onTransition(value) { transitions.push(value); },
  });
  scheduler.start();
  assert.equal(timers[0].delay, 1_000);
  nowMs = Date.parse("2026-10-09T21:11:00-10:00");
  timers[0].callback();
  assert.deepEqual(transitions, [nowMs]);
  assert.equal(timers[1].delay, Date.parse("2026-10-09T23:00:00-10:00") - nowMs);
  scheduler.stop();
  assert.ok(cleared.length >= 1);
  assert.doesNotMatch(candidateModule, /estimated|running[_ -]?window/i);
});

test("Strava, HAPN and flight tracking remain intact and independent of display overrides", () => {
  for (const name of [
    "loadPublicRaceSnapshot",
    "createPublicRacePoller",
    "loadPublicRvLocation",
    "hapnLivePositioningEnabled",
    "createPublicRvPoller",
  ]) assert.equal(namedFunction(candidateModule, name), namedFunction(baseModule, name), name);

  assert.equal(namedFunction(candidateTracker, "loadMissionTrackingStatus"), namedFunction(baseTracker, "loadMissionTrackingStatus"));
  assert.equal(
    block(candidateTracker, "    const flightAirports =", "    const RUN_WITH_WILL_FORM_URL"),
    block(baseTracker, "    const flightAirports =", "    const RUN_WITH_WILL_FORM_URL"),
  );
  assert.equal(
    block(candidateTracker, "        if (snapshot?.source === \"api\" && snapshot.status.active", "      })();"),
    block(baseTracker, "        if (snapshot?.source === \"api\" && snapshot.status.active", "      })();"),
  );
  assert.match(candidateTracker, /flight: \{ \.\.\.mapTrackingDefaults\.flight, \.\.\.\(window\.missionMapTracking\?\.flight \|\| window\.missionFlightTracking \|\| \{\}\) \}/);
  assert.match(candidateTracker, /const airportPoint = flightAirportPoint\(entity\.airportCode, centroids\)/);
  assert.match(candidateTracker, /runnerMarker\.dataset\.scheduledAirport = staticPlacements\.will\.airportCode/);
  assert.match(candidateTracker, /rvMarker\.dataset\.scheduledAirport = staticPlacements\.rv\.airportCode/);
  assert.match(candidateTracker, /!staticPlacements\.rv && missionHapnRv\.kind === "stale"/);
});
