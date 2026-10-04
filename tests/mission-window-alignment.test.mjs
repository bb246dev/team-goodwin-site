import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

import { raceWindowStatusAt } from "../strava-app/lib/race-window.mjs";

const START = "2026-10-09T09:00:00-04:00";
const END = "2026-11-01T23:59:59-05:00";
const START_MS = Date.parse(START);
const END_MS = Date.parse(END);
const candidateRoot = new URL(
  "../production-merge/mission-window-alignment-2026-09-09/",
  import.meta.url,
);
const trackerSource = readFileSync(
  new URL("public_html/assets/tracker-base.js", candidateRoot),
  "utf8",
);
const frontend = await import(
  "../production-merge/mission-window-alignment-2026-09-09/public_html/assets/strava-race-map.mjs"
);

function createClockHarness() {
  const values = Object.fromEntries([
    "countdown-days", "countdown-hours", "countdown-minutes", "countdown-seconds",
  ].map((id) => [id, { textContent: "" }]));
  const heading = { textContent: "" };
  const clock = {
    classList: { remove() {}, add() {} },
    dataset: {},
    setAttribute() {},
    closest: () => ({ querySelector: () => heading }),
  };
  const loading = { setAttribute() {} };
  const document = {
    getElementById: (id) => values[id],
    querySelector: (selector) => selector === "[data-countdown-clock]" ? clock : loading,
  };
  const from = trackerSource.indexOf("    function missionWindowStateAt");
  const to = trackerSource.indexOf("    let rsvpMobileMode", from);
  assert.ok(from >= 0 && to > from, "production clock logic must be extractable");
  const createFunctions = new Function(
    "startDate",
    "endDate",
    "document",
    `${trackerSource.slice(from, to)}; return { missionWindowStateAt, updateCountdown };`,
  );
  const functions = createFunctions(new Date(START), new Date(END), document);
  return {
    render(now) {
      const state = functions.updateCountdown(Date.parse(now));
      return {
        state,
        heading: heading.textContent,
        display: [
          values["countdown-days"].textContent,
          values["countdown-hours"].textContent,
          values["countdown-minutes"].textContent,
          values["countdown-seconds"].textContent,
        ].join(":"),
        dataState: clock.dataset.missionClockState,
      };
    },
  };
}

function staticFallbackProgress(nowMs) {
  if (nowMs < START_MS) return 0;
  return Math.max(0, Math.min(1, (nowMs - START_MS) / (END_MS - START_MS)));
}

function authoritativeStatus(active) {
  return {
    source: "api",
    active,
    raceWindowId: "ggma-2026",
    raceWindowStart: START,
    raceWindowEnd: END,
  };
}

test("all maintained and candidate runtimes encode the same authoritative window", () => {
  for (const source of [
    trackerSource,
    readFileSync(new URL("public_html/assets/strava-race-map.mjs", candidateRoot), "utf8"),
    readFileSync(new URL("goodwin-strava-api/lib/race-window.mjs", candidateRoot), "utf8"),
    readFileSync(new URL("../assets/strava-race-map.mjs", import.meta.url), "utf8"),
    readFileSync(new URL("../dist/assets/strava-race-map.mjs", import.meta.url), "utf8"),
    readFileSync(new URL("../strava-app/lib/race-window.mjs", import.meta.url), "utf8"),
    readFileSync(new URL("../dist/goodwin-strava-api/lib/race-window.mjs", import.meta.url), "utf8"),
    readFileSync(new URL("../source-html/live-tracking.html", import.meta.url), "utf8"),
    readFileSync(new URL("../dist/live-tracking.html", import.meta.url), "utf8"),
    readFileSync(new URL("../dist/live-tracking/index.html", import.meta.url), "utf8"),
  ]) {
    assert.match(source, /2026-10-09T09:00:00-04:00/);
    assert.match(source, /2026-11-01T23:59:59-05:00/);
    assert.doesNotMatch(source, /2026-10-09T(?:00:00:00|06:00:00)-04:00/);
  }
});

test("Mission Clock transitions from countdown to elapsed time and then completion", () => {
  const clock = createClockHarness();
  assert.deepEqual(clock.render("2026-10-09T08:59:59-04:00"), {
    state: "countdown", heading: "Countdown to race day", display: "00:00:00:01", dataState: "countdown",
  });
  assert.deepEqual(clock.render(START), {
    state: "active", heading: "RACE IS ON", display: "00:00:00:00", dataState: "active",
  });
  assert.deepEqual(clock.render("2026-10-09T09:00:01-04:00"), {
    state: "active", heading: "RACE IS ON", display: "00:00:00:01", dataState: "active",
  });
  assert.deepEqual(clock.render("2026-10-20T12:00:00-04:00"), {
    state: "active", heading: "RACE IS ON", display: "11:03:00:00", dataState: "active",
  });
  assert.deepEqual(clock.render("2026-11-01T01:30:00-04:00"), {
    state: "active", heading: "RACE IS ON", display: "22:16:30:00", dataState: "active",
  });
  assert.deepEqual(clock.render("2026-11-01T01:30:00-05:00"), {
    state: "active", heading: "RACE IS ON", display: "22:17:30:00", dataState: "active",
  });
  assert.deepEqual(clock.render("2026-11-01T23:59:59-05:00"), {
    state: "active", heading: "RACE IS ON", display: "23:15:59:59", dataState: "active",
  });
  assert.deepEqual(clock.render("2026-11-02T00:00:00-05:00"), {
    state: "complete", heading: "MISSION COMPLETE", display: "23:15:59:59", dataState: "complete",
  });
  assert.match(trackerSource, /initialMissionClockState !== "complete"/);
  assert.match(trackerSource, /window\.clearInterval\(missionClockTimer\)/);
});

test("race status, HAPN eligibility and static fallback agree at exact boundaries", () => {
  const cases = [
    ["2026-10-09T08:59:59-04:00", false, false, 0],
    [START, true, true, 0],
    ["2026-10-09T09:00:01-04:00", true, true, "started"],
    ["2026-11-01T01:30:00-04:00", true, true, "started"],
    ["2026-11-01T01:30:00-05:00", true, true, "started"],
    ["2026-11-01T23:59:58-05:00", true, true, "started"],
    [END, true, true, 1],
    ["2026-11-02T00:00:00-05:00", false, false, 1],
  ];
  for (const [timestamp, active, hapn, progress] of cases) {
    const nowMs = Date.parse(timestamp);
    assert.equal(raceWindowStatusAt(nowMs / 1000).raceWindowActive, active, timestamp);
    assert.equal(frontend.hapnLivePositioningEnabled(authoritativeStatus(active), nowMs), hapn, timestamp);
    const actualProgress = staticFallbackProgress(nowMs);
    if (progress === "started") assert.ok(actualProgress > 0 && actualProgress < 1, timestamp);
    else assert.equal(actualProgress, progress, timestamp);
  }
  assert.match(trackerSource, /pageNowMs < startDate\.getTime\(\)/);
  assert.match(trackerSource, /Math\.max\(0, Math\.min\(1, dateProgress\)\)/);
});

test("candidate HAPN poller makes no request before start or after mission completion", async () => {
  let nowMs = START_MS - 1_000;
  let authority = authoritativeStatus(false);
  let loads = 0;
  const poller = frontend.createPublicRvPoller({
    load: async () => { loads += 1; return { available: false }; },
    onPosition() {},
    onFallback() {},
    isEnabled: () => frontend.hapnLivePositioningEnabled(authority, nowMs),
    documentObject: { hidden: false, addEventListener() {}, removeEventListener() {} },
    setTimeoutImpl: () => 1,
    clearTimeoutImpl() {},
  });
  await poller.start();
  assert.equal(loads, 0);
  nowMs = START_MS;
  authority = authoritativeStatus(true);
  await poller.refresh();
  assert.equal(loads, 1);
  nowMs = END_MS + 1_000;
  authority = authoritativeStatus(false);
  await poller.refresh();
  assert.equal(loads, 1);
  poller.destroy();
});

test("absolute instants and DST-spanning duration are browser-timezone independent", () => {
  const expected = JSON.stringify([START_MS, END_MS, END_MS - START_MS]);
  for (const timezone of [
    "America/New_York", "Pacific/Honolulu", "America/Los_Angeles", "Europe/London", "Asia/Tokyo",
  ]) {
    const actual = execFileSync(process.execPath, [
      "-e",
      `process.stdout.write(JSON.stringify([Date.parse(${JSON.stringify(START)}),Date.parse(${JSON.stringify(END)}),Date.parse(${JSON.stringify(END)})-Date.parse(${JSON.stringify(START)})]))`,
    ], { encoding: "utf8", env: { ...process.env, TZ: timezone } });
    assert.equal(actual, expected, timezone);
  }
  assert.equal(END_MS - START_MS, (((23 * 24) + 15) * 60 * 60 + 59 * 60 + 59) * 1000);
});
