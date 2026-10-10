import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const START = "2026-10-09T15:00:00-10:00";
const START_MS = Date.parse(START);
const trackerSource = readFileSync(
  new URL("../assets/releases/mission-clock-honolulu-start-2026-10-09/tracker-base.js", import.meta.url),
  "utf8",
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
  assert.ok(from >= 0 && to > from, "Mission Clock logic must be extractable");
  const createFunctions = new Function(
    "startDate",
    "endDate",
    "document",
    `${trackerSource.slice(from, to)}; return { missionWindowStateAt, updateCountdown };`,
  );
  const functions = createFunctions(new Date(START), new Date("2026-11-01T23:59:59-05:00"), document);
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

test("Mission Clock targets the confirmed 3:00 PM HST Honolulu start", () => {
  assert.match(trackerSource, /const MISSION_WINDOW_START = "2026-10-09T15:00:00-10:00";/);
  assert.doesNotMatch(trackerSource, /const MISSION_WINDOW_START = "2026-10-09T09:00:00-04:00";/);
  assert.equal(START_MS, Date.parse("2026-10-09T21:00:00-04:00"));
  assert.equal(START_MS, Date.parse("2026-10-10T01:00:00Z"));
});

test("Mission Clock shows less than one hour at 2:23 PM HST and transitions exactly at 3:00 PM", () => {
  const clock = createClockHarness();
  assert.deepEqual(clock.render("2026-10-09T14:23:00-10:00"), {
    state: "countdown",
    heading: "Countdown to race day",
    display: "00:00:37:00",
    dataState: "countdown",
  });
  assert.deepEqual(clock.render("2026-10-09T14:59:59-10:00"), {
    state: "countdown",
    heading: "Countdown to race day",
    display: "00:00:00:01",
    dataState: "countdown",
  });
  assert.deepEqual(clock.render(START), {
    state: "active",
    heading: "RACE IS ON",
    display: "00:00:00:00",
    dataState: "active",
  });
});

test("Honolulu start instant is browser-timezone independent", () => {
  for (const timezone of [
    "Pacific/Honolulu", "America/New_York", "America/Los_Angeles", "Europe/London", "Asia/Tokyo",
  ]) {
    const actual = execFileSync(process.execPath, [
      "-e",
      `process.stdout.write(String(Date.parse(${JSON.stringify(START)})))`,
    ], { encoding: "utf8", env: { ...process.env, TZ: timezone } });
    assert.equal(actual, String(START_MS), timezone);
  }
});

test("the corrected start also gates live RV polling", () => {
  const from = trackerSource.indexOf("    function missionRvFeedEnabled");
  const to = trackerSource.indexOf("    function exactMissionRvKeys", from);
  assert.ok(from >= 0 && to > from, "RV feed gate must be extractable");
  const createFunction = new Function(
    "startDate",
    "endDate",
    `${trackerSource.slice(from, to)}; return missionRvFeedEnabled;`,
  );
  const enabled = createFunction(new Date(START), new Date("2026-11-01T23:59:59-05:00"));
  assert.equal(enabled(START_MS - 1), false);
  assert.equal(enabled(START_MS), true);
});
