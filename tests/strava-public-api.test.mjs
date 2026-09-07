import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { startInitializedApplication } from "../strava-app/app.js";
import { createMySqlStravaStore } from "../strava-app/lib/mysql-store.mjs";
import { handleStravaRequest } from "../strava-app/lib/routes.mjs";
import { createMemoryStravaStore } from "./helpers/memory-strava-store.mjs";

const seed = readFileSync(
  new URL("../strava-app/seeds/001_ggma_2026_race_schedule_mysql.sql", import.meta.url),
  "utf8",
);
const schedule = [...seed.matchAll(
  /\('ggma-2026-(\d{2})',\s*'ggma-2026',\s*(\d+),\s*'([^']+)',\s*'([^']+)',\s*'([A-Z]{2})',\s*'([^']+)'/g,
)].map((match) => ({
  id: `ggma-2026-${match[1]}`,
  race_number: Number(match[2]),
  race_date: match[3],
  state: match[4],
  state_code: match[5],
  city: match[6],
  status: "scheduled",
}));

const beforeWindow = Math.floor(Date.parse("2026-10-09T03:59:59Z") / 1000);
const duringWindow = Math.floor(Date.parse("2026-10-09T12:00:00Z") / 1000);
const afterWindow = Math.floor(Date.parse("2026-11-02T05:00:00Z") / 1000);

function populatedStore() {
  const store = createMemoryStravaStore(() => duringWindow);
  store.setRaceSchedule(schedule);
  const activity = {
    athlete_id: "41740194",
    operational_window_id: "ggma-2026",
    activity_start_at: duringWindow,
    activity_local_date: "2026-10-09",
    activity_type: "Run",
    distance_meters: 42_195.2,
    moving_time_seconds: 10_800,
    elapsed_time_seconds: 11_040,
    elevation_gain_meters: 184.5,
    summary_polyline: "_p~iF~ps|U_ulLnnqC",
    start_latitude: 21.3069,
    start_longitude: -157.8583,
    end_latitude: 21.3156,
    end_longitude: -157.8721,
    source_updated_at: duringWindow,
    created_at: duringWindow,
    updated_at: duringWindow,
    reviewed_by: "private-admin-field",
    exclusion_reason: "private-review-note",
    encrypted_tokens: "never-public-token-material",
  };
  store.setRaceCandidate({
    ...activity,
    activity_id: "111111111",
    classification_status: "included",
    scheduled_marathon_id: "ggma-2026-01",
    scheduled_state_code: "HI",
  }, { matched: true });
  store.setRaceCandidate({
    ...activity,
    activity_id: "222222222",
    classification_status: "pending",
    scheduled_marathon_id: "ggma-2026-02",
    scheduled_state_code: "AK",
  }, { matched: true });
  store.setRaceCandidate({
    ...activity,
    activity_id: "333333333",
    classification_status: "excluded",
    scheduled_marathon_id: "ggma-2026-03",
    scheduled_state_code: "WA",
  }, { matched: true });
  return store;
}

async function route(store, pathname, now, origin) {
  return handleStravaRequest(new Request(`https://goodwingoodge.com/api/strava/${pathname}`, {
    headers: origin ? { Origin: origin } : {},
  }), { STRAVA_STORE: store }, { now: () => now });
}

async function runningApplication(t, store, now) {
  const application = startInitializedApplication({
    env: {
      PORT: "0",
      IP: "127.0.0.1",
      STRAVA_ADMIN_TOKEN: "test-only-public-api-admin-token-000000",
    },
    store,
    now: () => now,
    fetchImpl: async () => { throw new Error("public routes must not call Strava"); },
    logger: { info() {} },
  });
  if (!application.server.listening) {
    await new Promise((resolve) => application.server.once("listening", resolve));
  }
  t.after(async () => {
    await new Promise((resolve) => application.server.close(resolve));
    await application.close();
  });
  return `http://127.0.0.1:${application.server.address().port}`;
}

test("public schedule returns exactly 50 ordered races and only an included matched activity", async () => {
  const response = await route(populatedStore(), "public/races", duringWindow, "https://goodwingoodge.com");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.races.length, 50);
  assert.deepEqual(body.races.map((race) => race.raceNumber),
    Array.from({ length: 50 }, (_, index) => index + 1));
  assert.deepEqual(body.races[0], {
    raceNumber: 1,
    raceId: "ggma-2026-01",
    date: "2026-10-09",
    state: "Hawaii",
    city: "Honolulu",
    status: "completed",
    activity: {
      stravaActivityId: "111111111",
      startTime: "2026-10-09T12:00:00.000Z",
      distanceMeters: 42_195.2,
      movingTimeSeconds: 10_800,
      elapsedTimeSeconds: 11_040,
      elevationGainMeters: 184.5,
      summaryPolyline: "_p~iF~ps|U_ulLnnqC",
      startLatLng: [21.3069, -157.8583],
      endLatLng: [21.3156, -157.8721],
    },
  });
  assert.equal(body.races[1].status, "scheduled");
  assert.equal(body.races[1].activity, undefined);
  assert.equal(body.races[2].status, "scheduled");
  assert.equal(body.races[2].activity, undefined);
  const serialized = JSON.stringify(body);
  for (const privateValue of [
    "222222222", "333333333", "private-admin-field", "private-review-note", "never-public-token-material",
  ]) assert.ok(!serialized.includes(privateValue));
  assert.equal(response.headers.get("access-control-allow-origin"), "https://goodwingoodge.com");
  assert.equal(response.headers.get("access-control-allow-credentials"), null);
  assert.match(response.headers.get("cache-control"), /max-age=20/);
});

test("public status hides pre-race activities and preserves completed historical results", async () => {
  const store = populatedStore();
  const preRaces = await route(store, "public/races", beforeWindow);
  const preBody = await preRaces.json();
  assert.equal(preBody.races.some((race) => Object.hasOwn(race, "activity")), false);
  assert.equal(preBody.races.some((race) => race.status === "completed"), false);
  assert.match(preRaces.headers.get("cache-control"), /max-age=300/);

  const preStatus = await route(store, "public/race-status", beforeWindow);
  assert.deepEqual(await preStatus.json(), {
    active: false,
    raceWindowId: "ggma-2026",
    raceWindowStart: "2026-10-09T00:00:00-04:00",
    raceWindowEnd: "2026-11-01T23:59:59-05:00",
    completedRaces: 0,
    totalRaces: 50,
  });

  const activeStatus = await route(store, "public/race-status", duringWindow);
  assert.deepEqual(await activeStatus.json(), {
    active: true,
    raceWindowId: "ggma-2026",
    raceWindowStart: "2026-10-09T00:00:00-04:00",
    raceWindowEnd: "2026-11-01T23:59:59-05:00",
    completedRaces: 1,
    totalRaces: 50,
  });

  const historicalStatus = await route(store, "public/race-status", afterWindow);
  assert.deepEqual(await historicalStatus.json(), {
    active: false,
    raceWindowId: "ggma-2026",
    raceWindowStart: "2026-10-09T00:00:00-04:00",
    raceWindowEnd: "2026-11-01T23:59:59-05:00",
    completedRaces: 1,
    totalRaces: 50,
  });
  const historicalRaces = await route(store, "public/races", afterWindow);
  assert.equal((await historicalRaces.json()).races[0].status, "completed");
});

test("public endpoints support retained and stripped cPanel mounts with restricted CORS", async (t) => {
  const base = await runningApplication(t, populatedStore(), duringWindow);
  for (const path of [
    "/strava/public/races", "/public/races",
    "/strava/public/race-status", "/public/race-status",
  ]) {
    const response = await fetch(`${base}${path}`, { headers: { Origin: "https://goodwingoodge.com" } });
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get("access-control-allow-origin"), "https://goodwingoodge.com");
    assert.notEqual(response.headers.get("cache-control"), null);
  }
  const crossOrigin = await fetch(`${base}/strava/public/races`, {
    headers: { Origin: "https://untrusted.example" },
  });
  assert.equal(crossOrigin.status, 200);
  assert.equal(crossOrigin.headers.get("access-control-allow-origin"), null);
  assert.notEqual(crossOrigin.headers.get("access-control-allow-origin"), "*");
  const admin = await fetch(`${base}/strava/candidates`, {
    headers: { Origin: "https://goodwingoodge.com" },
  });
  assert.equal(admin.status, 401);
  assert.equal(admin.headers.get("access-control-allow-origin"), null);
  assert.equal((await fetch(`${base}/strava/public/races/111111111`)).status, 404);
});

test("MySQL public query is parameterized and joins only included matched candidates", async () => {
  const calls = [];
  const pool = {
    async execute(sql, parameters) {
      calls.push({ sql, parameters });
      return [[{
        race_id: "ggma-2026-01", race_number: 1, race_date: "2026-10-09",
        state: "Hawaii", city: "Honolulu", strava_activity_id: null,
      }], []];
    },
    async getConnection() { throw new Error("unused"); },
  };
  const races = await createMySqlStravaStore(pool).listPublicRaces(true);
  assert.deepEqual(races, [{
    raceNumber: 1, raceId: "ggma-2026-01", date: "2026-10-09",
    state: "Hawaii", city: "Honolulu", status: "scheduled",
  }]);
  assert.deepEqual(calls[0].parameters, ["included", "ggma-2026", "ggma-2026"]);
  assert.match(calls[0].sql, /strava_race_activity_matches/);
  assert.match(calls[0].sql, /candidate\.classification_status = \?/);
  assert.match(calls[0].sql, /candidate\.scheduled_marathon_id = match_row\.scheduled_marathon_id/);
  assert.doesNotMatch(calls[0].sql, /SELECT\s+\*/i);
});

test("MySQL candidate persistence writes every public activity summary field", async () => {
  const calls = [];
  const connection = {
    async beginTransaction() {},
    async execute(sql, parameters) {
      calls.push({ sql, parameters });
      return [{ affectedRows: 1 }, []];
    },
    async commit() {},
    async rollback() {},
    release() {},
  };
  const pool = {
    async execute() { throw new Error("unused"); },
    async getConnection() { return connection; },
  };
  const candidate = {
    activity_id: "111111111", athlete_id: "41740194", operational_window_id: "ggma-2026",
    activity_start_at: duringWindow, activity_local_date: "2026-10-09", activity_type: "Run",
    distance_meters: 42_195.2, moving_time_seconds: 10_800, elapsed_time_seconds: 11_040,
    elevation_gain_meters: 184.5, summary_polyline: "_p~iF~ps|U_ulLnnqC",
    start_latitude: 21.3069, start_longitude: -157.8583,
    end_latitude: 21.3156, end_longitude: -157.8721, source_updated_at: duringWindow,
  };
  await createMySqlStravaStore(pool).saveRaceActivityCandidate(
    candidate,
    { classificationStatus: "pending" },
    duringWindow,
  );
  assert.equal(calls.length, 1);
  for (const field of ["moving_time_seconds", "elapsed_time_seconds", "elevation_gain_meters", "summary_polyline"]) {
    assert.match(calls[0].sql, new RegExp(field));
  }
  assert.equal((calls[0].sql.match(/\?/g) || []).length, calls[0].parameters.length);
  for (const value of [10_800, 11_040, 184.5, "_p~iF~ps|U_ulLnnqC"]) {
    assert.ok(calls[0].parameters.includes(value));
  }
});
