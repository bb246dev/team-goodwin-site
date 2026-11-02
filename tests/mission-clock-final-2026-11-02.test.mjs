import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const previousTracker = read("assets/releases/rsvp-map-schedule-2026-10-29/tracker-base.js");
const tracker = read("assets/releases/mission-clock-final-2026-11-02/tracker-base.js");
const previousEnd = "2026-11-01T23:59:59-05:00";
const confirmedEnd = "2026-11-01T13:16:34-05:00";

test("the completed mission clock shows the official confirmed duration", () => {
  const start = Date.parse("2026-10-09T15:00:00-10:00");
  const end = Date.parse(confirmedEnd);
  const elapsed = end - start;

  assert.equal(Math.floor(elapsed / 86_400_000), 22);
  assert.equal(Math.floor((elapsed % 86_400_000) / 3_600_000), 17);
  assert.equal(Math.floor((elapsed % 3_600_000) / 60_000), 16);
  assert.equal(Math.floor((elapsed % 60_000) / 1_000), 34);
  assert.match(tracker, new RegExp(`MISSION_WINDOW_END = "${confirmedEnd}"`));
});

test("the tracker change is limited to the confirmed mission end time", () => {
  assert.equal(
    tracker,
    previousTracker.replace(
      `MISSION_WINDOW_END = "${previousEnd}"`,
      `MISSION_WINDOW_END = "${confirmedEnd}"`,
    ),
  );
});

test("both public entry pages change only the tracker cache key", () => {
  for (const page of ["index", "live-tracking"]) {
    const previous = read(`rsvp-map-schedule-release-2026-10-29-${page}.html`);
    const candidate = read(`mission-clock-final-release-2026-11-02-${page}.html`);
    assert.equal(
      candidate.replace("20261102mission-clock-final", "20261029rsvp-map-schedule"),
      previous,
    );
  }
});
