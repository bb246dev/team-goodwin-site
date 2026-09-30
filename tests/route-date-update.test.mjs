import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { joinPublicRaces as joinMaintainedRaces } from "../assets/strava-race-map.mjs";
import { joinPublicRaces as joinReleaseRaces } from "../assets/releases/route-dates-2026-09-30/strava-race-map.mjs";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

function scheduleFixture() {
  const staticStops = Array.from({ length: 50 }, (_, index) => ({
    n: index + 1,
    state: `State ${index + 1}`,
    city: `City ${index + 1}`,
    date: "Oct 9",
    lat: 30 + index / 100,
    lng: -100 + index / 100,
  }));
  const publicRaces = staticStops.map((stop) => ({
    raceNumber: stop.n,
    raceId: `ggma-2026-${String(stop.n).padStart(2, "0")}`,
    date: "2026-10-09",
    state: stop.state,
    city: stop.city,
    status: "scheduled",
    activity: null,
  }));
  publicRaces[25].date = "2026-10-21";
  publicRaces[26].date = "2026-10-21";
  publicRaces[42].date = "2026-10-29";
  publicRaces[43].date = "2026-10-29";
  return { staticStops, publicRaces };
}

test("maintained and production map joins correct only the two revised route dates", () => {
  const { staticStops, publicRaces } = scheduleFixture();
  for (const join of [joinMaintainedRaces, joinReleaseRaces]) {
    const races = join(staticStops, publicRaces);
    assert.deepEqual(
      [races[25].date, races[25].isoDate, races[26].date, races[42].date, races[42].isoDate, races[43].date],
      ["Oct 20", "2026-10-20", "Oct 21", "Oct 28", "2026-10-28", "Oct 29"],
    );
  }
});

test("all maintained itinerary sources contain the revised dates and preserve controls", () => {
  const sources = [
    "source-html/fifty-runs.raw.html",
    "source-html/week-2.raw.html",
    "source-html/week-3.raw.html",
    "source-html/live-tracking.html",
    "assets/releases/route-dates-2026-09-30/tracker-base.js",
    "fifty-runs-route-dates-2026-09-30.html",
    "week-2-route-dates-2026-09-30.html",
    "week-3-route-dates-2026-09-30.html",
  ].map(read).join("\n");

  assert.match(sources, /city: "Los Angeles", date: "Oct 20"/);
  assert.match(sources, /city: "Teterboro", date: "Oct 28"/);
  assert.match(sources, /city: "Las Vegas", date: "Oct 21"/);
  assert.match(sources, /city: "Stamford", date: "Oct 29"/);
  assert.match(sources, /city: "Greenville", date: "Oct 25"/);
  assert.match(sources, /city: "Asheville", date: "Oct 25"/);
  assert.doesNotMatch(sources, /city: "Los Angeles", date: "Oct 21"/);
  assert.doesNotMatch(sources, /city: "Teterboro", date: "Oct 29"/);
  assert.doesNotMatch(sources, /Oct 21<\/span><strong class="stop-state">California<\/strong><span class="stop-city">Los Angeles/);
  assert.doesNotMatch(sources, /Oct 29<\/span><strong class="stop-state">New Jersey<\/strong><span class="stop-city">Teterboro/);
  assert.doesNotMatch(sources, /<div class="date">Oct 21<\/div><div class="city">Los Angeles/);
  assert.doesNotMatch(sources, /<div class="date">Oct 29<\/div><div class="city">Teterboro/);
  assert.doesNotMatch(sources, /Los Angeles \| Oct 21/);
  assert.doesNotMatch(sources, /Teterboro \| Oct 29/);
});

test("the backend seed records the revised dates while preserving nearby controls", () => {
  const seed = read("strava-app/seeds/001_ggma_2026_race_schedule_mysql.sql");
  assert.match(seed, /26, '2026-10-20', 'California',[^\n]*'Los Angeles'/);
  assert.match(seed, /27, '2026-10-21', 'Nevada',[^\n]*'Las Vegas'/);
  assert.match(seed, /43, '2026-10-28', 'New Jersey',[^\n]*'Teterboro'/);
  assert.match(seed, /44, '2026-10-29', 'Connecticut',[^\n]*'Stamford'/);
  assert.match(seed, /34, '2026-10-25', 'South Carolina',[^\n]*'Greenville'/);
  assert.match(seed, /35, '2026-10-25', 'North Carolina',[^\n]*'Asheville'/);
});
