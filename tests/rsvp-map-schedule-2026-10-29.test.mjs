import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const trackerPath = "assets/releases/rsvp-map-schedule-2026-10-29/tracker-base.js";
const mapPath = "assets/releases/rsvp-map-schedule-2026-10-29/strava-race-map.mjs";
const tracker = read(trackerPath);
const previousTracker = read("assets/releases/rsvp-route-refresh-2026-10-27/tracker-base.js");
const mapModule = read(mapPath);
const previousMapModule = read("assets/releases/rsvp-route-refresh-2026-10-27/strava-race-map.mjs");

const approved = [
  [39, "Oct 27", "West Virginia", "WV", "Hazelton"],
  [40, "Oct 27", "Maryland", "MD", "Friendsville"],
  [41, "Oct 27", "Pennsylvania", "PA", "Markleysburg"],
  [42, "Oct 28", "Delaware", "DE", "Glasgow"],
  [43, "Oct 28", "New Jersey", "NJ", "Pennsville Township"],
  [44, "Oct 29", "Connecticut", "CT", "Putnam"],
  [45, "Oct 29", "Rhode Island", "RI", "Burrillville"],
  [46, "Oct 30", "Massachusetts", "MA", "Boston"],
  [47, "Oct 30", "New Hampshire", "NH", "Portsmouth"],
  [48, "Oct 31", "Maine", "ME", "Kittery"],
  [49, "Oct 31", "Vermont", "VT", "Springfield"],
  [50, "Nov 1", "New York", "NY", "New York City"],
].map(([n, date, state, abbr, city]) => ({ n, date, state, abbr, city }));

const finalSchedule = [
  [46, "Massachusetts", "Boston", "2026-10-30T10:00:00-04:00", 42.3601, -71.0589],
  [47, "New Hampshire", "Portsmouth", "2026-10-30T17:00:00-04:00", 43.0718, -70.7626],
  [48, "Maine", "Kittery", "2026-10-31T06:30:00-04:00", 43.0895, -70.7448],
  [49, "Vermont", "Springfield", "2026-10-31T14:00:00-04:00", 43.29664, -72.48187],
  [50, "New York", "New York City", "2026-11-01T07:00:00-05:00", 40.7128, -74.006],
].map(([n, state, city, scheduledStart, lat, lng]) => ({
  n, state, city, scheduledStart, timezone: "America/New_York", lat, lng,
}));

function staticStops(source) {
  return [...source.matchAll(
    /\{ n: (\d+), state: "([^"]+)", abbr: "([A-Z]{2})", city: "([^"]+)", date: "([^"]+)"(?:, scheduledStart: "([^"]+)", timezone: "([^"]+)")?, lat: (-?\d+(?:\.\d+)?), lng: (-?\d+(?:\.\d+)?) \}/g,
  )].map((match) => ({
    n: Number(match[1]),
    state: match[2],
    abbr: match[3],
    city: match[4],
    date: match[5],
    scheduledStart: match[6],
    timezone: match[7],
    lat: Number(match[8]),
    lng: Number(match[9]),
  }));
}

function missionClockRows(source) {
  return [...source.matchAll(
    /Object\.freeze\(\{ n: (\d+), state: "([^"]+)", city: "([^"]+)", scheduledStart: "([^"]+)", timezone: "([^"]+)" \}\)/g,
  )].map((match) => ({
    n: Number(match[1]), state: match[2], city: match[3], scheduledStart: match[4], timezone: match[5],
  }));
}

function replaceBlock(source, startText, endText, marker) {
  const start = source.indexOf(startText);
  const end = source.indexOf(endText, start);
  assert.ok(start >= 0 && end > start, `${startText} block is present`);
  return `${source.slice(0, start)}${marker}${source.slice(end)}`;
}

test("the RSVP list exactly matches the October 29 schedule", () => {
  const rows = staticStops(tracker).filter(({ n }) => n >= 39)
    .map(({ n, date, state, abbr, city }) => ({ n, date, state, abbr, city }));
  assert.deepEqual(rows, approved);
  assert.doesNotMatch(
    tracker.slice(tracker.indexOf("const staticRouteStops ="), tracker.indexOf("const MISSION_CLOCK_SCHEDULE =")),
    /Stratham|Brattleboro/,
  );
});

test("the final five map markers have the approved times and coordinates", () => {
  const rows = staticStops(tracker).filter(({ n }) => n >= 46)
    .map(({ n, state, city, scheduledStart, timezone, lat, lng }) => ({
      n, state, city, scheduledStart, timezone, lat, lng,
    }));
  assert.deepEqual(rows, finalSchedule);
});

test("the mission clock follows the same final-five schedule", () => {
  const rows = missionClockRows(tracker).filter(({ n }) => n >= 46);
  assert.deepEqual(rows, finalSchedule.map(({ lat, lng, ...row }) => row));
});

test("live race data is overridden with the same RSVP dates, cities, and order", async () => {
  const moduleUrl = new URL(`../${mapPath}?test=${Date.now()}`, import.meta.url);
  const { joinPublicRaces } = await import(moduleUrl);
  const sourceStops = staticStops(tracker);
  const staleApiRows = sourceStops.map((stop) => ({
    raceNumber: stop.n,
    raceId: `ggma-2026-${String(stop.n).padStart(2, "0")}`,
    date: stop.n === 39 ? "2026-10-27" : stop.n === 50 ? "2026-11-01" : "2026-10-31",
    state: stop.n === 39 || stop.n === 50 ? stop.state : `Old State ${stop.n}`,
    city: stop.n === 39 || stop.n === 50 ? stop.city : `Old City ${stop.n}`,
    status: "scheduled",
  }));
  const joined = joinPublicRaces(sourceStops, staleApiRows)
    .filter(({ n }) => n >= 39)
    .map(({ n, date, state, city, abbr }) => ({ n, date, state, city, abbr }));
  assert.deepEqual(joined, approved);
});

test("the RSVP URL and release cache keys remain scoped", () => {
  const functionSource = tracker.slice(
    tracker.indexOf("function getRunWithWillUrl"),
    tracker.indexOf("function getRunAnalyticsPayload"),
  );
  assert.match(functionSource, /run_id: getRunWithWillId\(stop\)/);
  assert.match(functionSource, /city: stop\.city/);
  assert.match(functionSource, /state: stop\.state/);
  assert.match(functionSource, /date: stop\.date/);
  assert.match(tracker, /STRAVA_RACE_MODULE_URL = "\/assets\/strava-race-map\.mjs\?v=20261029rsvp-map-schedule"/);
});

test("the tracker changes are limited to route data, mission timing, and the cache key", () => {
  const normalize = (source, cacheKey) => {
    let normalized = source.replace(cacheKey, "/assets/strava-race-map.mjs");
    normalized = replaceBlock(
      normalized,
      "    const staticRouteStops = [",
      "    const MISSION_CLOCK_SCHEDULE =",
      "<APPROVED-ROUTE-UPDATE>",
    );
    return replaceBlock(
      normalized,
      "    const MISSION_CLOCK_SCHEDULE =",
      "    let routeStops = staticRouteStops;",
      "<APPROVED-MISSION-SCHEDULE-UPDATE>",
    );
  };
  assert.equal(
    normalize(tracker, "/assets/strava-race-map.mjs?v=20261029rsvp-map-schedule"),
    normalize(previousTracker, "/assets/strava-race-map.mjs?v=20261027rsvp-route-refresh"),
  );
});

test("the race-map change is limited to itinerary overrides", () => {
  const normalize = (source) => replaceBlock(
    source,
    "const ROUTE_ITINERARY_OVERRIDES =",
    "// Main-site display overrides only.",
    "<APPROVED-ROUTE-OVERRIDES>",
  );
  assert.equal(normalize(mapModule), normalize(previousMapModule));
});

test("both public entry pages change only the tracker cache key", () => {
  for (const page of ["index", "live-tracking"]) {
    const candidate = read(`rsvp-map-schedule-release-2026-10-29-${page}.html`);
    const previous = read(`rsvp-route-refresh-release-2026-10-27-${page}.html`);
    assert.equal(
      candidate.replace("20261029rsvp-map-schedule", "20261027rsvp-route-refresh"),
      previous,
    );
  }
});
