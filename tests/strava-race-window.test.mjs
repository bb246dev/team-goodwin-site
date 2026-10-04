import assert from "node:assert/strict";
import test from "node:test";
import {
  STRAVA_OPERATIONAL_WINDOWS,
  canInitiateStravaActivityFetch,
  operationalWindowAt,
  operationalWindowForActivityStart,
} from "../strava-app/lib/race-window.mjs";

const start = Date.parse("2026-10-09T09:00:00-04:00") / 1000;
const end = Date.parse("2026-11-01T23:59:59-05:00") / 1000;

test("GGMA uses the single configured offset-aware operational window", () => {
  assert.deepEqual(STRAVA_OPERATIONAL_WINDOWS, [{
    id: "ggma-2026",
    start: "2026-10-09T09:00:00-04:00",
    end: "2026-11-01T23:59:59-05:00",
  }]);
  assert.equal(start, Date.parse("2026-10-09T13:00:00Z") / 1000);
  assert.equal(end, Date.parse("2026-11-02T04:59:59Z") / 1000);
  assert.ok(Object.isFrozen(STRAVA_OPERATIONAL_WINDOWS));
  assert.ok(Object.isFrozen(STRAVA_OPERATIONAL_WINDOWS[0]));
});

test("Strava fetch gating is inclusive at both boundaries with no grace period", () => {
  assert.equal(operationalWindowAt(start - 1), null);
  assert.equal(operationalWindowAt(start)?.id, "ggma-2026");
  assert.equal(operationalWindowAt(end)?.id, "ggma-2026");
  assert.equal(operationalWindowAt(end + 1), null);
  assert.equal(canInitiateStravaActivityFetch(start), true);
  assert.equal(canInitiateStravaActivityFetch(end), true);
  assert.equal(canInitiateStravaActivityFetch(end + 1), false);
});

test("activity eligibility uses its actual offset-aware start timestamp", () => {
  assert.equal(operationalWindowForActivityStart("2026-10-09T12:59:59Z"), null);
  assert.equal(operationalWindowForActivityStart("2026-10-09T09:00:00-04:00")?.id, "ggma-2026");
  assert.equal(operationalWindowForActivityStart("2026-11-01T23:59:59-05:00")?.id, "ggma-2026");
  assert.equal(operationalWindowForActivityStart("2026-11-02T05:00:00Z"), null);
  assert.equal(operationalWindowForActivityStart("2026-10-15T12:00:00"), null);
  assert.equal(operationalWindowForActivityStart("invalid"), null);
});

test("an eligible activity cannot authorize a fetch after the backend window closes", () => {
  assert.equal(operationalWindowForActivityStart("2026-11-01T20:00:00-05:00")?.id, "ggma-2026");
  assert.equal(canInitiateStravaActivityFetch("2026-11-02T00:00:00-05:00"), false);
});
