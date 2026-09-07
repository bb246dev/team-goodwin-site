import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  MARATHON_AUTO_MATCH_MAX_METERS,
  MARATHON_AUTO_MATCH_MIN_METERS,
  MARATHON_CANDIDATE_MAX_METERS,
  MARATHON_CANDIDATE_MIN_METERS,
  matchRaceActivityCandidate,
  processRaceActivityCandidate,
  qualifiesForPublicRaceData,
} from "../strava-app/lib/race-matching.mjs";
import { createMemoryStravaStore } from "./helpers/memory-strava-store.mjs";

const seed = readFileSync(
  new URL("../strava-app/seeds/001_ggma_2026_race_schedule_mysql.sql", import.meta.url),
  "utf8",
);
const races = [...seed.matchAll(
  /\('ggma-2026-(\d{2})',\s*'ggma-2026',\s*(\d+),\s*'([^']+)',\s*'([^']+)',\s*'([A-Z]{2})',\s*'([^']+)'/g,
)].map((match) => ({
  id: `ggma-2026-${match[1]}`,
  race_number: Number(match[2]),
  race_date: match[3],
  state: match[4],
  state_code: match[5],
  city: match[6],
  latitude: null,
  longitude: null,
  status: "scheduled",
}));

function activity(overrides = {}) {
  return {
    id: "1001",
    athlete: { id: 456 },
    start_date: "2026-10-17T15:00:00Z",
    start_date_local: "2026-10-17T10:00:00",
    type: "Run",
    distance: 42_300,
    ...overrides,
  };
}

test("the live-site seed contains exactly the unique race sequence 1 through 50", () => {
  assert.equal(races.length, 50);
  assert.deepEqual(races.map((race) => race.race_number), Array.from({ length: 50 }, (_, index) => index + 1));
  assert.equal(new Set(races.map((race) => race.id)).size, 50);
});

test("Hawaii is race 1 on October 9 and New York is race 50 on November 1", () => {
  assert.deepEqual(races[0], {
    id: "ggma-2026-01", race_number: 1, race_date: "2026-10-09",
    state: "Hawaii", state_code: "HI", city: "Honolulu",
    latitude: null, longitude: null, status: "scheduled",
  });
  assert.deepEqual(races[49], {
    id: "ggma-2026-50", race_number: 50, race_date: "2026-11-01",
    state: "New York", state_code: "NY", city: "New York City",
    latitude: null, longitude: null, status: "scheduled",
  });
});

test("published Kansas City and Arizona location wording is preserved", () => {
  assert.deepEqual(
    races.slice(15, 17).map(({ race_number, state, city }) => ({ race_number, state, city })),
    [
      { race_number: 16, state: "Kansas", city: "Kansas City" },
      { race_number: 17, state: "Missouri", city: "Kansas City" },
    ],
  );
  assert.equal(races[24].city, "Willow Beach / Hoover Dam");
});

test("same-day races remain ambiguous without geographic evidence", () => {
  assert.equal(races.filter((race) => race.race_date === "2026-10-10").length, 2);
  assert.equal(races.filter((race) => race.race_date === "2026-10-17").length, 3);
  assert.equal(races.filter((race) => race.race_date === "2026-10-25").length, 3);
  const result = matchRaceActivityCandidate(activity(), races);
  assert.equal(result.classificationStatus, "pending");
  assert.equal(result.reason, "geographic_confirmation_required");
  assert.deepEqual(result.candidateRaceIds, ["ggma-2026-16", "ggma-2026-17", "ggma-2026-18"]);
});

test("state and city evidence confidently select one race on a three-race day", () => {
  const result = matchRaceActivityCandidate(activity({
    location_state: "Kansas",
    location_city: "Kansas City",
  }), races);
  assert.equal(result.classificationStatus, "included");
  assert.equal(result.raceId, "ggma-2026-16");
  assert.equal(result.stateCode, "KS");
  assert.deepEqual(result.candidateRaceIds, ["ggma-2026-16"]);
});

test("marathon distance tolerance keeps uncertain recordings pending for review", () => {
  assert.deepEqual(
    [MARATHON_CANDIDATE_MIN_METERS, MARATHON_CANDIDATE_MAX_METERS],
    [38_000, 47_000],
  );
  assert.deepEqual(
    [MARATHON_AUTO_MATCH_MIN_METERS, MARATHON_AUTO_MATCH_MAX_METERS],
    [40_000, 45_000],
  );
  for (const distance of [37_999, 39_999, 45_001, 47_001]) {
    const result = matchRaceActivityCandidate(activity({
      distance,
      location_state: "Kansas",
      location_city: "Kansas City",
    }), races);
    assert.equal(result.classificationStatus, "pending", String(distance));
  }
});

test("one race and one activity cannot acquire multiple active matches", async () => {
  let now = Math.floor(Date.parse("2026-10-17T15:30:00Z") / 1000);
  const store = createMemoryStravaStore(() => now);
  store.setRaceSchedule(races);
  await store.acquireLock("test-owner");
  await store.saveConnection({
    athlete_id: "456", athlete_name: "Will", encrypted_tokens: "unused",
    expires_at: now + 3600, scopes: "[]", updated_at: now,
  }, "test-owner");

  const first = await processRaceActivityCandidate(store, activity({
    location_state: "Kansas", location_city: "Kansas City",
  }), now);
  assert.equal(first.raceId, "ggma-2026-16");
  const second = await processRaceActivityCandidate(store, activity({
    id: "1002", location_state: "Kansas", location_city: "Kansas City",
  }), now + 1);
  assert.equal(second.classificationStatus, "pending");
  assert.equal(store.inspectRaceCandidates().filter((candidate) => candidate.classification_status === "included").length, 1);
  assert.equal(await store.assignRaceCandidate("1002", "ggma-2026-16", now + 2), false);
  assert.equal(await store.assignRaceCandidate("1001", "ggma-2026-17", now + 2), false);
});

test("an in-window activity cannot be ingested after the backend window closes", async () => {
  const now = Math.floor(Date.parse("2026-11-02T05:00:00Z") / 1000);
  const store = createMemoryStravaStore(() => now);
  store.setRaceSchedule(races);
  await assert.rejects(
    processRaceActivityCandidate(store, activity(), now),
    { code: "strava_operational_window_closed" },
  );
  assert.equal(store.inspectRaceCandidates().length, 0);
});

test("only included candidates attached to one race qualify for public output", () => {
  assert.equal(qualifiesForPublicRaceData({ classification_status: "pending" }), false);
  assert.equal(qualifiesForPublicRaceData({ classification_status: "included" }), false);
  assert.equal(qualifiesForPublicRaceData({
    classification_status: "included",
    scheduled_marathon_id: "ggma-2026-16",
    scheduled_state_code: "KS",
  }), true);
});

test("MariaDB-compatible match schema enforces one included activity per scheduled race", () => {
  const migration = readFileSync(
    new URL("../strava-app/migrations/004_ggma_race_schedule_mysql.sql", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(migration, /GENERATED\s+ALWAYS/i);
  assert.match(migration, /PRIMARY KEY \(scheduled_marathon_id\)/);
  assert.match(migration, /UNIQUE KEY strava_race_activity_matches_activity \(activity_id\)/);
});

test("MariaDB repair migration is idempotent across the likely partial state", () => {
  const repair = readFileSync(
    new URL("../strava-app/migrations/004b_ggma_race_schedule_mariadb_repair.sql", import.meta.url),
    "utf8",
  );
  assert.match(repair, /CREATE TABLE IF NOT EXISTS ggma_race_schedule/);
  assert.match(repair, /DROP COLUMN IF EXISTS included_scheduled_marathon_id/);
  assert.match(repair, /ADD COLUMN IF NOT EXISTS activity_local_date/);
  assert.match(repair, /ADD INDEX IF NOT EXISTS strava_race_candidates_local_date/);
  assert.match(repair, /CREATE TABLE IF NOT EXISTS strava_race_activity_matches/);
  assert.doesNotMatch(repair, /GENERATED\s+ALWAYS/i);
});

test("the MariaDB migration chain declares every candidate column used by the runtime", () => {
  const runtimeColumns = [
    "activity_id", "athlete_id", "operational_window_id", "activity_start_at",
    "activity_local_date", "activity_type", "distance_meters", "moving_time_seconds",
    "elapsed_time_seconds", "elevation_gain_meters", "summary_polyline", "start_latitude",
    "start_longitude", "end_latitude", "end_longitude", "classification_status",
    "scheduled_marathon_id", "scheduled_state_code", "match_confidence", "match_method",
    "exclusion_reason", "reviewed_at", "reviewed_by", "source_updated_at", "created_at", "updated_at",
  ];
  const migrationNames = [
    "003_strava_race_activity_candidates_mysql.sql",
    "004b_ggma_race_schedule_mariadb_repair.sql",
    "005_strava_candidate_runtime_fields_mariadb.sql",
  ];
  const migrationSql = migrationNames.map((name) => readFileSync(
    new URL(`../strava-app/migrations/${name}`, import.meta.url),
    "utf8",
  )).join("\n");
  const declaredColumns = new Set(
    [...migrationSql.matchAll(/^\s*(?:ADD COLUMN IF NOT EXISTS\s+)?([a-z][a-z0-9_]*)\s+(?:BIGINT|VARCHAR|CHAR|DATE|DECIMAL|INT|TEXT)\b/gim)]
      .map((match) => match[1]),
  );
  const runtimeSource = readFileSync(
    new URL("../strava-app/lib/mysql-store.mjs", import.meta.url),
    "utf8",
  );
  for (const field of runtimeColumns) {
    assert.match(runtimeSource, new RegExp(`\\b${field}\\b`), `runtime reference for ${field}`);
    assert.ok(declaredColumns.has(field), `migration declaration for ${field}`);
  }

  const preContinuationSql = migrationNames.slice(0, 2).map((name) => readFileSync(
    new URL(`../strava-app/migrations/${name}`, import.meta.url),
    "utf8",
  )).join("\n");
  const preContinuationColumns = new Set(
    [...preContinuationSql.matchAll(/^\s*(?:ADD COLUMN IF NOT EXISTS\s+)?([a-z][a-z0-9_]*)\s+(?:BIGINT|VARCHAR|CHAR|DATE|DECIMAL|INT|TEXT)\b/gim)]
      .map((match) => match[1]),
  );
  assert.deepEqual(
    runtimeColumns.filter((field) => !preContinuationColumns.has(field)),
    ["moving_time_seconds", "elapsed_time_seconds", "elevation_gain_meters", "summary_polyline"],
  );

  const continuation = readFileSync(
    new URL("../strava-app/migrations/005_strava_candidate_runtime_fields_mariadb.sql", import.meta.url),
    "utf8",
  );
  for (const field of ["moving_time_seconds", "elapsed_time_seconds", "elevation_gain_meters", "summary_polyline"]) {
    assert.match(continuation, new RegExp(`ADD COLUMN IF NOT EXISTS ${field}`));
  }
  assert.doesNotMatch(continuation, /GENERATED\s+ALWAYS|DROP\s+(?:TABLE|COLUMN)|DELETE\s+FROM|UPDATE\s+/i);
});
