import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { joinPublicRaces as joinMaintainedRaces } from "../assets/strava-race-map.mjs";
import { joinPublicRaces as joinReleaseRaces } from "../assets/releases/full-route-itinerary-2026-09-30/strava-race-map.mjs";

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

test("maintained and production map joins apply the corrected itinerary records", () => {
  const { staticStops, publicRaces } = scheduleFixture();
  for (const join of [joinMaintainedRaces, joinReleaseRaces]) {
    const races = join(staticStops, publicRaces);
    assert.deepEqual(
      [18, 19, 23, 25, 26, 27, 41, 43, 45].map((raceNumber) => {
        const { n, date, isoDate, state, city } = races[raceNumber - 1];
        return { n, date, isoDate, state, city };
      }),
      [
        { n: 18, date: "Oct 18", isoDate: "2026-10-18", state: "Iowa", city: "Decorah" },
        { n: 19, date: "Oct 18", isoDate: "2026-10-18", state: "Minnesota", city: "Eitzen" },
        { n: 23, date: "Oct 20", isoDate: "2026-10-20", state: "Michigan", city: "Sturgis" },
        { n: 25, date: "Oct 20", isoDate: "2026-10-20", state: "California", city: "Los Angeles" },
        { n: 26, date: "Oct 21", isoDate: "2026-10-21", state: "Nevada", city: "Las Vegas" },
        { n: 27, date: "Oct 21", isoDate: "2026-10-21", state: "Arizona", city: "Willow Beach / Hoover Dam" },
        { n: 41, date: "Oct 27", isoDate: "2026-10-27", state: "Delaware", city: "Glasgow" },
        { n: 43, date: "Oct 28", isoDate: "2026-10-28", state: "New Jersey", city: "Teterboro" },
        { n: 45, date: "Oct 29", isoDate: "2026-10-29", state: "Rhode Island", city: "Providence" },
      ],
    );
  }
});

test("all maintained itinerary sources contain the revised dates and preserve controls", () => {
  const sources = [
    "source-html/fifty-runs.raw.html",
    "source-html/week-2.raw.html",
    "source-html/week-3.raw.html",
    "source-html/live-tracking.html",
    "source-html/week-1.raw.html",
    "assets/releases/full-route-itinerary-2026-09-30/tracker-base.js",
    "fifty-runs-full-route-2026-09-30.html",
    "week-2-full-route-2026-09-30.html",
    "week-3-full-route-2026-09-30.html",
  ].map(read).join("\n");

  assert.match(sources, /n: 18, state: "Iowa", abbr: "IA", city: "Decorah", date: "Oct 18"/);
  assert.match(sources, /n: 19, state: "Minnesota", abbr: "MN", city: "Eitzen", date: "Oct 18"/);
  assert.match(sources, /n: 23, state: "Michigan", abbr: "MI", city: "Sturgis", date: "Oct 20"/);
  assert.match(sources, /n: 25, state: "California", abbr: "CA", city: "Los Angeles", date: "Oct 20"/);
  assert.match(sources, /n: 26, state: "Nevada", abbr: "NV", city: "Las Vegas", date: "Oct 21"/);
  assert.match(sources, /n: 27, state: "Arizona", abbr: "AZ", city: "Willow Beach \/ Hoover Dam", date: "Oct 21"/);
  assert.match(sources, /n: 41, state: "Delaware", abbr: "DE", city: "Glasgow", date: "Oct 27"/);
  assert.match(sources, /city: "Teterboro", date: "Oct 28"/);
  assert.match(sources, /n: 45, state: "Rhode Island", abbr: "RI", city: "Providence", date: "Oct 29"/);
  assert.match(sources, /city: "Stamford", date: "Oct 29"/);
  assert.match(sources, /city: "Greenville", date: "Oct 25"/);
  assert.match(sources, /city: "Asheville", date: "Oct 25"/);
  assert.doesNotMatch(sources, /Minneapolis|Lansing/);
});

test("the backend seed records the corrected itinerary while preserving controls", () => {
  const seed = read("strava-app/seeds/001_ggma_2026_race_schedule_mysql.sql");
  assert.match(seed, /18, '2026-10-18', 'Iowa',[^\n]*'Decorah'/);
  assert.match(seed, /19, '2026-10-18', 'Minnesota',[^\n]*'Eitzen'/);
  assert.match(seed, /23, '2026-10-20', 'Michigan',[^\n]*'Sturgis'/);
  assert.match(seed, /25, '2026-10-20', 'California',[^\n]*'Los Angeles'/);
  assert.match(seed, /26, '2026-10-21', 'Nevada',[^\n]*'Las Vegas'/);
  assert.match(seed, /27, '2026-10-21', 'Arizona',[^\n]*'Willow Beach \/ Hoover Dam'/);
  assert.match(seed, /41, '2026-10-27', 'Delaware',[^\n]*'Glasgow'/);
  assert.match(seed, /43, '2026-10-28', 'New Jersey',[^\n]*'Teterboro'/);
  assert.match(seed, /45, '2026-10-29', 'Rhode Island',[^\n]*'Providence'/);
  assert.match(seed, /44, '2026-10-29', 'Connecticut',[^\n]*'Stamford'/);
  assert.match(seed, /34, '2026-10-25', 'South Carolina',[^\n]*'Greenville'/);
  assert.match(seed, /35, '2026-10-25', 'North Carolina',[^\n]*'Asheville'/);
});
