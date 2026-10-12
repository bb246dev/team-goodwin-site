import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const baselinePath = "assets/releases/live-map-single-status-marker-2026-10-11/tracker-base.js";
const candidatePath = "assets/releases/live-map-pdx-slc-landed-2026-10-11/tracker-base.js";
const baseline = read(baselinePath);
const candidate = read(candidatePath);
const baselineHome = read("single-status-marker-release-2026-10-11-index.html");
const baselineLive = read("single-status-marker-release-2026-10-11-live-tracking.html");
const candidateHome = read("pdx-slc-landed-release-2026-10-11-index.html");
const candidateLive = read("pdx-slc-landed-release-2026-10-11-live-tracking.html");
const manifest = JSON.parse(read("deploy/manifests/releases/live-map-pdx-slc-landed-2026-10-11.json"));

function namedFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing function ${name}`);
  let parameterDepth = 0;
  let sawParameters = false;
  let open = -1;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === "(") { parameterDepth += 1; sawParameters = true; }
    else if (source[index] === ")") parameterDepth -= 1;
    else if (source[index] === "{" && sawParameters && parameterDepth === 0) { open = index; break; }
  }
  assert.ok(open >= 0, `missing body for ${name}`);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`unterminated function ${name}`);
}

function constStatement(source, name) {
  const start = source.indexOf(`const ${name} =`);
  assert.ok(start >= 0, `missing constant ${name}`);
  const end = source.indexOf(";\n", start);
  assert.ok(end > start, `unterminated constant ${name}`);
  return source.slice(start, end + 1);
}

function priorityHarness() {
  return new Function(`
    const GARMIN_FRESH_MS = 10 * 60_000;
    ${constStatement(candidate, "MISSION_SCHEDULED_FLIGHTS")}
    ${namedFunction(candidate, "missionScheduledFlightAt")}
    ${namedFunction(candidate, "missionWillDisplayStateAt")}
    ${namedFunction(candidate, "missionMarkerVisibility")}
    return { MISSION_SCHEDULED_FLIGHTS, missionScheduledFlightAt, missionWillDisplayStateAt, missionMarkerVisibility };
  `)();
}

const landedAt = Date.parse("2026-10-11T20:13:00-06:00");
const justBeforeLanding = landedAt - 1;
const unavailableRunner = { kind: "unavailable", position: null, observedAt: null, trail: [] };
const staleRunner = {
  kind: "stale",
  position: { lat: 40.78, lng: -111.98 },
  observedAt: "2026-10-11T19:00:00-06:00",
  trail: [],
};
const invalidRunner = {
  kind: "fresh",
  position: { lat: Number.NaN, lng: null },
  observedAt: "invalid",
  trail: [],
};
const freshRunner = {
  kind: "fresh",
  position: { lat: 40.78, lng: -111.98 },
  observedAt: "2026-10-11T20:12:30-06:00",
  trail: [{ lat: 40.77, lng: -111.99 }],
};

test("PDX to SLC remains active until the actual landed time and is inactive at the boundary", () => {
  const h = priorityHarness();
  const flight = h.MISSION_SCHEDULED_FLIGHTS.find(({ from, to }) => from === "PDX" && to === "SLC");
  assert.equal(flight.end, "2026-10-11T20:13:00-06:00");
  assert.equal(h.missionScheduledFlightAt(justBeforeLanding)?.to, "SLC");
  assert.equal(h.missionScheduledFlightAt(landedAt), null);
  assert.equal(h.missionScheduledFlightAt(landedAt + 1), null);
});

test("immediately before landing the scheduled plane is the only selected marker", () => {
  const h = priorityHarness();
  const state = h.missionWillDisplayStateAt(justBeforeLanding, staleRunner);
  assert.equal(state.kind, "flight");
  assert.deepEqual(h.missionMarkerVisibility(state, true), {
    runner: false,
    plane: true,
    rv: false,
  });
});

test("at and after landing a non-running state falls through to the RV gate", () => {
  const h = priorityHarness();
  for (const runner of [unavailableRunner, staleRunner, invalidRunner]) {
    const state = h.missionWillDisplayStateAt(landedAt, runner);
    assert.notEqual(state.kind, "flight");
    assert.equal(state.showRunner, false);
    assert.deepEqual(h.missionMarkerVisibility(state, true), {
      runner: false,
      plane: false,
      rv: true,
    });
    assert.deepEqual(h.missionMarkerVisibility(state, false), {
      runner: false,
      plane: false,
      rv: false,
    });
  }
});

test("a fresh active runner still wins at the landed-time boundary", () => {
  const h = priorityHarness();
  const state = h.missionWillDisplayStateAt(landedAt, freshRunner);
  assert.equal(state.kind, "fresh");
  assert.deepEqual(h.missionMarkerVisibility(state, true), {
    runner: true,
    plane: false,
    rv: false,
  });
});

test("only the PDX to SLC end and its visible itinerary time change in tracker source", () => {
  const expected = baseline
    .replace(
      'start: "2026-10-11T17:15:00-07:00", end: "2026-10-11T20:10:00-06:00"',
      'start: "2026-10-11T17:15:00-07:00", end: "2026-10-11T20:13:00-06:00"',
    )
    .replace(
      'time: "5:15 PM - 8:10 PM", airline: "Delta Airlines"',
      'time: "5:15 PM - 8:13 PM", airline: "Delta Airlines"',
    );
  assert.equal(candidate, expected);
  for (const name of ["missionScheduledFlightAt", "missionWillDisplayStateAt", "missionMarkerVisibility", "renderMissionMap", "rvMapVisible"]) {
    assert.equal(sha256(namedFunction(candidate, name)), sha256(namedFunction(baseline, name)), name);
  }
});

test("both live production routes change only the tracker cache key", () => {
  const oldTag = '<script defer src="/assets/tracker-base.js?v=20261011single-status-marker"></script>';
  const newTag = '<script defer src="/assets/tracker-base.js?v=20261011pdx-slc-landed"></script>';
  assert.equal(candidateHome, baselineHome.replace(oldTag, newTag));
  assert.equal(candidateLive, baselineLive.replace(oldTag, newTag));
  assert.equal(candidateHome, candidateLive);
});

test("the standard release pins only the production tracker and its two cache-key documents", () => {
  assert.equal(manifest.releaseType, "standard");
  assert.deepEqual(manifest.protectedPathsApproved, ["public_html/assets/tracker-base.js"]);
  assert.deepEqual(manifest.files.map(({ source, destination, expectedSha256, expectedRemoteSha256 }) => ({
    source, destination, expectedSha256, expectedRemoteSha256,
  })), [
    {
      source: candidatePath,
      destination: "public_html/assets/tracker-base.js",
      expectedSha256: sha256(candidate),
      expectedRemoteSha256: sha256(baseline),
    },
    {
      source: "pdx-slc-landed-release-2026-10-11-index.html",
      destination: "public_html/index.html",
      expectedSha256: sha256(candidateHome),
      expectedRemoteSha256: sha256(baselineHome),
    },
    {
      source: "pdx-slc-landed-release-2026-10-11-live-tracking.html",
      destination: "public_html/live-tracking.html",
      expectedSha256: sha256(candidateLive),
      expectedRemoteSha256: sha256(baselineLive),
    },
  ]);
  assert.doesNotMatch(JSON.stringify(manifest.files), /garmin-feed|\.htaccess|strava-race-map\.mjs|tracker-base\.css/i);
});
