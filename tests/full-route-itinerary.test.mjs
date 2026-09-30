import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

const expected = `
1|2026-10-09|Hawaii|Honolulu
2|2026-10-10|Alaska|Anchorage
3|2026-10-10|Oregon|Portland
4|2026-10-11|Washington|Vancouver
5|2026-10-11|Utah|Salt Lake City
6|2026-10-12|Idaho|Idaho Falls
7|2026-10-12|Montana|Bozeman
8|2026-10-13|North Dakota|Bowman
9|2026-10-13|South Dakota|Keystone
10|2026-10-14|Wyoming|Sundance
11|2026-10-14|Nebraska|Morrill
12|2026-10-15|Colorado|Denver
13|2026-10-15|New Mexico|Albuquerque
14|2026-10-16|Texas|Dallas
15|2026-10-16|Oklahoma|Afton
16|2026-10-17|Kansas|Kansas City
17|2026-10-17|Missouri|Kansas City
18|2026-10-18|Iowa|Decorah
19|2026-10-18|Minnesota|Eitzen
20|2026-10-18|Wisconsin|De Soto
21|2026-10-19|Illinois|Chicago
22|2026-10-19|Indiana|South Bend
23|2026-10-20|Michigan|Sturgis
24|2026-10-20|Ohio|Columbus
25|2026-10-20|California|Los Angeles
26|2026-10-21|Nevada|Las Vegas
27|2026-10-21|Arizona|Willow Beach / Hoover Dam
28|2026-10-22|Arkansas|Little Rock
29|2026-10-22|Louisiana|Shreveport
30|2026-10-23|Mississippi|Meridian
31|2026-10-23|Alabama|Tuscaloosa
32|2026-10-24|Florida|Miami
33|2026-10-24|Georgia|Atlanta
34|2026-10-25|South Carolina|Greenville
35|2026-10-25|North Carolina|Asheville
36|2026-10-25|Tennessee|Pigeon Forge
37|2026-10-26|Virginia|Norton
38|2026-10-26|Kentucky|Pikeville
39|2026-10-27|West Virginia|Hazelton
40|2026-10-27|Maryland|Elkton
41|2026-10-27|Delaware|Glasgow
42|2026-10-28|Pennsylvania|Philadelphia
43|2026-10-28|New Jersey|Teterboro
44|2026-10-29|Connecticut|Stamford
45|2026-10-29|Rhode Island|Providence
46|2026-10-30|Massachusetts|Boston
47|2026-10-30|Vermont|Brattleboro
48|2026-10-31|New Hampshire|Portsmouth
49|2026-10-31|Maine|Kittery
50|2026-11-01|New York|New York City
`.trim().split("\n").map((line) => {
  const [number, date, state, city] = line.split("|");
  return { number: Number(number), date, state, city };
});

const displayDate = (date) => {
  const [, month, day] = date.match(/^2026-(\d{2})-(\d{2})$/);
  return `${month === "10" ? "Oct" : "Nov"} ${Number(day)}`;
};

test("the canonical schedule seed exactly matches the approved 50-run path", () => {
  for (const path of [
    "strava-app/seeds/001_ggma_2026_race_schedule_mysql.sql",
    "dist/goodwin-strava-api/seeds/001_ggma_2026_race_schedule_mysql.sql",
  ]) {
    const actual = [...read(path).matchAll(
      /\('ggma-2026-\d{2}',\s*'ggma-2026',\s*(\d+),\s*'([^']+)',\s*'([^']+)',\s*'[A-Z]{2}',\s*'([^']+)'/g,
    )].map((match) => ({
      number: Number(match[1]), date: match[2], state: match[3], city: match[4],
    }));
    assert.deepEqual(actual, expected, path);
  }
});

test("the production homepage route asset exactly matches the approved 50-run path", () => {
  for (const path of [
    "assets/releases/full-route-itinerary-2026-09-30/tracker-base.js",
    "source-html/live-tracking.html",
    "dist/live-tracking.html",
  ]) {
    const actual = [...read(path).matchAll(
      /\{ n: (\d+), state: "([^"]+)", abbr: "[A-Z]{2}", city: "([^"]+)", date: "([^"]+)"/g,
    )].slice(0, 50).map((match) => ({
      number: Number(match[1]), date: match[4], state: match[2], city: match[3],
    }));
    assert.deepEqual(actual, expected.map((stop) => ({ ...stop, date: displayDate(stop.date) })), path);
  }
});

test("the maintained and built client bundles preserve the corrected numbered route", () => {
  for (const path of ["assets/index-BE9Jl0ji.js", "dist/assets/index-BE9Jl0ji.js"]) {
    const actual = [...read(path).matchAll(
      /\{n:(\d+),state:"([^"]+)",city:"([^"]+)",date:"([^"]+)"/g,
    )].slice(0, 50).map((match) => ({
      number: Number(match[1]), date: match[4], state: match[2], city: match[3],
    }));
    assert.deepEqual(actual, expected.map((stop) => ({ ...stop, date: displayDate(stop.date) })), path);
  }
});

test("the tracking-status route metadata preserves the same 1-50 state and city order", () => {
  for (const path of ["api/tracking-status.mjs", "dist/api/tracking-status.mjs"]) {
    const actual = [...read(path).matchAll(
      /\{ n: (\d+), state: "([^"]+)", city: "([^"]+)", lat:/g,
    )].map((match) => ({ number: Number(match[1]), state: match[2], city: match[3] }));
    assert.deepEqual(actual, expected.map(({ number, state, city }) => ({ number, state, city })), path);
  }
});

test("the production fifty-runs page exactly matches the approved 50-run path", () => {
  const page = read("fifty-runs-full-route-2026-09-30.html");
  const actual = [...page.matchAll(
    /<span class="stop-number">(\d+)<\/span><span class="stop-date">([^<]+)<\/span><strong class="stop-state">([^<]+)<\/strong><span class="stop-city">([^<]+)<\/span>/g,
  )].map((match) => ({
    number: Number(match[1]), date: match[2], state: match[3], city: match[4],
  }));
  assert.deepEqual(actual, expected.map((stop) => ({ ...stop, date: displayDate(stop.date) })));

  for (const path of ["dist/fifty-runs.html", "dist/fifty-runs/index.html"]) {
    const built = [...read(path).matchAll(
      /<article class="state"><strong>([^<]+)<\/strong><span>([^|<]+) \| ([^<]+)<\/span><\/article>/g,
    )].map((match, index) => ({
      number: index + 1, date: match[3], state: match[1], city: match[2],
    }));
    assert.deepEqual(built, expected.map((stop) => ({ ...stop, date: displayDate(stop.date) })), path);
  }
});

test("the three maintained week pages collectively match the approved 50-run path", () => {
  for (const paths of [
    [1, 2, 3].map((week) => `source-html/week-${week}.raw.html`),
    [1, 2, 3].map((week) => `dist/week-${week}.html`),
    [1, 2, 3].map((week) => `dist/week-${week}/index.html`),
  ]) {
    const pages = paths.map(read).join("\n");
    const actual = [...pages.matchAll(
      /<article class="stop"><div class="date">([^<]+)<\/div><div class="city">([^<]+)<\/div><div class="state">([^<]+)<\/div><\/article>/g,
    )].map((match, index) => ({
      number: index + 1, date: match[1], state: match[3], city: match[2],
    }));
    assert.deepEqual(actual, expected.map((stop) => ({ ...stop, date: displayDate(stop.date) })), paths.join(", "));
  }
});

test("route-only release sources do not add display times", () => {
  const sources = [
    "assets/releases/full-route-itinerary-2026-09-30/tracker-base.js",
    "fifty-runs-full-route-2026-09-30.html",
    "week-2-full-route-2026-09-30.html",
    "week-3-full-route-2026-09-30.html",
  ];
  for (const path of sources) {
    const current = read(path);
    const baseline = read(path
      .replace("full-route-itinerary-2026-09-30", "route-dates-2026-09-30")
      .replace("full-route-2026-09-30", "route-dates-2026-09-30"));
    assert.equal((current.match(/\b\d{1,2}:\d{2}\s*(?:AM|PM)\b/gi) || []).length,
      (baseline.match(/\b\d{1,2}:\d{2}\s*(?:AM|PM)\b/gi) || []).length, path);
  }
});
