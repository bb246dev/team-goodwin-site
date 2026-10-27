import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const trackerPath = "assets/releases/rsvp-route-refresh-2026-10-27/tracker-base.js";
const mapPath = "assets/releases/rsvp-route-refresh-2026-10-27/strava-race-map.mjs";
const tracker = read(trackerPath);
const previousTracker = read("assets/releases/live-map-dl766-las-vegas-2026-10-20/tracker-base.js");
const mapModule = read(mapPath);
const previousMapModule = read("assets/releases/full-route-itinerary-2026-09-30/strava-race-map.mjs");

const approved = [
  [39, "Oct 27", "West Virginia", "WV", "Hazelton"],
  [40, "Oct 27", "Maryland", "MD", "Friendsville"],
  [41, "Oct 27", "Pennsylvania", "PA", "Markleysburg"],
  [42, "Oct 28", "Delaware", "DE", "Glasgow"],
  [43, "Oct 28", "New Jersey", "NJ", "Pennsville Township"],
  [44, "Oct 29", "Connecticut", "CT", "Putnam"],
  [45, "Oct 29", "Rhode Island", "RI", "Burrillville"],
  [46, "Oct 30", "Massachusetts", "MA", "Boston"],
  [47, "Oct 30", "New Hampshire", "NH", "Stratham"],
  [48, "Oct 30", "Maine", "ME", "Kittery"],
  [49, "Oct 31", "Vermont", "VT", "Brattleboro"],
  [50, "Nov 1", "New York", "NY", "New York City"],
].map(([n, date, state, abbr, city]) => ({ n, date, state, abbr, city }));

function staticStops(source) {
  return [...source.matchAll(
    /\{ n: (\d+), state: "([^"]+)", abbr: "([A-Z]{2})", city: "([^"]+)", date: "([^"]+)"[^\n]*\}/g,
  )].map((match) => ({
    n: Number(match[1]), state: match[2], abbr: match[3], city: match[4], date: match[5],
  }));
}

function replaceBlock(source, startText, endText) {
  const start = source.indexOf(startText);
  const end = source.indexOf(endText, start);
  assert.ok(start >= 0 && end > start, `${startText} block is present`);
  return `${source.slice(0, start)}<APPROVED-ROUTE-UPDATE>${source.slice(end)}`;
}

test("the RSVP list exactly matches the approved October 27 through November 1 order", () => {
  assert.deepEqual(staticStops(tracker).filter(({ n }) => n >= 39), approved);
  assert.doesNotMatch(
    tracker.slice(tracker.indexOf("const staticRouteStops ="), tracker.indexOf("const MISSION_CLOCK_SCHEDULE =")),
    /Elkton|Philadelphia|Teterboro|Stamford|Providence|Portsmouth/,
  );
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

test("the RSVP URL still prefills only run id, city, state, and date", () => {
  const functionSource = tracker.slice(
    tracker.indexOf("function getRunWithWillUrl"),
    tracker.indexOf("function getRunAnalyticsPayload"),
  );
  assert.match(functionSource, /run_id: getRunWithWillId\(stop\)/);
  assert.match(functionSource, /city: stop\.city/);
  assert.match(functionSource, /state: stop\.state/);
  assert.match(functionSource, /date: stop\.date/);
  assert.match(tracker, /STRAVA_RACE_MODULE_URL = "\/assets\/strava-race-map\.mjs\?v=20261027rsvp-route-refresh"/);
});

test("the tracker changes are limited to the approved route block and cache key", () => {
  const normalizedCandidate = replaceBlock(
    tracker.replace("/assets/strava-race-map.mjs?v=20261027rsvp-route-refresh", "/assets/strava-race-map.mjs"),
    "    const staticRouteStops = [",
    "    const MISSION_CLOCK_SCHEDULE =",
  );
  const normalizedPrevious = replaceBlock(
    previousTracker,
    "    const staticRouteStops = [",
    "    const MISSION_CLOCK_SCHEDULE =",
  );
  assert.equal(normalizedCandidate, normalizedPrevious);
});

test("the race-map change is limited to itinerary overrides", () => {
  const normalizedCandidate = replaceBlock(
    mapModule,
    "const ROUTE_ITINERARY_OVERRIDES =",
    "// Main-site display overrides only.",
  );
  const normalizedPrevious = replaceBlock(
    previousMapModule,
    "const ROUTE_ITINERARY_OVERRIDES =",
    "// Main-site display overrides only.",
  );
  assert.equal(normalizedCandidate, normalizedPrevious);
});

test("both public entry pages change only the tracker cache key", () => {
  for (const page of ["index", "live-tracking"]) {
    const candidate = read(`rsvp-route-refresh-release-2026-10-27-${page}.html`);
    const previous = read(`live-map-dl766-las-vegas-release-2026-10-20-${page}.html`);
    assert.equal(
      candidate.replace("20261027rsvp-route-refresh", "20261020dl766-las-vegas"),
      previous,
    );
  }
});
