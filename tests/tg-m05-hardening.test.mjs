import assert from "node:assert/strict";
import test from "node:test";
import { handleStravaRequest, resumeWebhookEvents } from "../strava-app/lib/routes.mjs";
import { createMemoryStravaStore } from "./helpers/memory-strava-store.mjs";

function setup() {
  let seconds = Math.floor(Date.parse("2026-10-15T12:00:00-04:00") / 1000);
  const now = () => seconds;
  const store = createMemoryStravaStore(now);
  const env = {
    STRAVA_STORE: store,
    STRAVA_CLIENT_ID: "123456",
    STRAVA_CLIENT_SECRET: "test-only-client-secret",
    STRAVA_VERIFY_TOKEN: "test-only-webhook-verifier-0000000000",
    STRAVA_WEBHOOK_SUBSCRIPTION_ID: "123",
    STRAVA_ADMIN_TOKEN: "test-only-administrator-password-000000",
    STRAVA_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  };
  const logs = [];
  const tasks = [];
  const dependencies = {
    now,
    clientAddress: "203.0.113.10",
    logger: { info: (...values) => logs.push(values) },
    scheduleBackground(task, delay = 0) { tasks.push({ task, delay }); },
  };
  const request = (path, options = {}) => new Request(`https://goodwingoodge.com/api/strava/${path}`, options);
  const route = (path, options = {}, overrides = {}) => handleStravaRequest(
    request(path, options),
    overrides.env || env,
    { ...dependencies, ...overrides },
  );
  const event = (changes = {}) => ({
    object_type: "activity",
    aspect_type: "create",
    object_id: 987,
    owner_id: 456,
    event_time: now(),
    subscription_id: 123,
    ...changes,
  });
  const post = (body) => ({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  async function seedConnection(athleteId = "456") {
    const owner = "test-connection-lock-owner";
    assert.equal(await store.acquireLock(owner), true);
    await store.saveConnection({
      athlete_id: athleteId,
      athlete_name: "Test Athlete",
      encrypted_tokens: "test-only-unused-envelope",
      expires_at: now() + 3_600,
      scopes: JSON.stringify(["read", "activity:read_all"]),
      updated_at: now(),
    }, owner);
    await store.releaseLock(owner);
  }
  async function drainTasks() {
    while (tasks.length > 0) await tasks.shift().task();
  }
  return {
    env, store, logs, tasks, dependencies, now, route, event, post, seedConnection, drainTasks,
    advance: (value) => { seconds += value; },
  };
}

test("valid subscription events are durably deduplicated across concurrent deliveries", async () => {
  const s = setup();
  await s.seedConnection();
  let processed = 0;
  const overrides = { processWebhookActivity: async () => { processed += 1; } };
  const payload = s.event();
  const responses = await Promise.all([
    s.route("webhook", s.post(payload), overrides),
    s.route("webhook", s.post(payload), overrides),
  ]);
  assert.deepEqual(responses.map((response) => response.status), [200, 200]);
  assert.deepEqual(await responses[0].json(), { accepted: true });
  assert.equal(s.store.inspectWebhookEvents().length, 1);
  const initialTasks = s.tasks.splice(0);
  await Promise.all(initialTasks.map(({ task }) => task()));
  await s.drainTasks();
  assert.equal(processed, 1);
  assert.equal(s.store.inspectWebhookEvents()[0].processing_status, "succeeded");
  const delayed = await s.route("webhook", s.post(payload), overrides);
  assert.equal(delayed.status, 200);
  assert.equal(s.tasks.length, 0);
  assert.equal(processed, 1);
});

test("subscription configuration and athlete ownership fail closed before scheduling or fetching", async () => {
  const s = setup();
  await s.seedConnection();
  let processed = 0;
  const processWebhookActivity = async () => { processed += 1; };
  for (const env of [
    { ...s.env, STRAVA_WEBHOOK_SUBSCRIPTION_ID: undefined },
    { ...s.env, STRAVA_WEBHOOK_SUBSCRIPTION_ID: "not-an-id" },
  ]) {
    const response = await s.route("webhook", s.post(s.event()), { env, processWebhookActivity });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { accepted: true });
  }
  assert.equal((await s.route("webhook", s.post(s.event({ subscription_id: 999 })), {
    processWebhookActivity,
  })).status, 200);
  assert.equal((await s.route("webhook", s.post(s.event({ owner_id: 999 })), {
    processWebhookActivity,
  })).status, 200);
  assert.equal(s.tasks.length, 0);
  assert.equal(s.store.inspectWebhookEvents().length, 0);
  assert.equal(processed, 0);
  assert.match(JSON.stringify(s.logs), /config_unavailable/);
  assert.match(JSON.stringify(s.logs), /wrong_subscription_ignored/);
  assert.match(JSON.stringify(s.logs), /wrong_athlete_ignored/);
});

test("newer activity events win and stale events never invoke processing", async () => {
  const s = setup();
  await s.seedConnection();
  const processed = [];
  const overrides = { processWebhookActivity: async (activityId) => { processed.push(activityId); } };
  const newerTime = s.now() - 10;
  assert.equal((await s.route("webhook", s.post(s.event({ aspect_type: "update", event_time: newerTime })), overrides)).status, 200);
  await s.drainTasks();
  assert.equal((await s.route("webhook", s.post(s.event({ event_time: newerTime - 60 })), overrides)).status, 200);
  await s.drainTasks();
  assert.deepEqual(processed, ["987"]);
  const state = s.store.inspectWebhookActivityState()[0][1];
  assert.equal(state.latest_event_time, newerTime);
  assert.equal(state.latest_aspect_rank, 2);
  assert.match(JSON.stringify(s.logs), /stale_ignored/);
});

test("update after create is serialized and a later delete removes public eligibility", async () => {
  const s = setup();
  await s.seedConnection();
  s.store.setRaceSchedule([{
    id: "ggma-2026-01", race_number: 1, race_date: "2026-10-15",
    state: "Maine", state_code: "ME", city: "Portland", status: "scheduled",
  }]);
  s.store.setRaceCandidate({
    activity_id: "987",
    athlete_id: "456",
    operational_window_id: "ggma-2026",
    activity_start_at: s.now() - 100,
    distance_meters: 42_195,
    classification_status: "included",
    scheduled_marathon_id: "ggma-2026-01",
    scheduled_state_code: "ME",
    source_updated_at: s.now() - 100,
  }, { matched: true });
  let processed = 0;
  const overrides = { processWebhookActivity: async () => { processed += 1; } };
  const createTime = s.now() - 30;
  await s.route("webhook", s.post(s.event({ event_time: createTime })), overrides);
  await s.drainTasks();
  await s.route("webhook", s.post(s.event({ aspect_type: "update", event_time: createTime + 10 })), overrides);
  await s.drainTasks();
  await s.route("webhook", s.post(s.event({ aspect_type: "delete", event_time: createTime + 20 })), overrides);
  await s.drainTasks();
  assert.equal(processed, 2);
  const candidate = s.store.inspectRaceCandidates()[0];
  assert.equal(candidate.classification_status, "excluded");
  assert.equal(candidate.scheduled_marathon_id, null);
  assert.equal(candidate.exclusion_reason, "strava_activity_deleted");
  const races = await s.store.listPublicRaces(true);
  assert.equal(races[0].status, "scheduled");
  assert.equal(races[0].activity, undefined);
});

test("delete events remain safe outside the fetch window while create/update events do not fetch", async () => {
  const s = setup();
  await s.seedConnection();
  s.advance(30 * 86_400);
  let processed = 0;
  const overrides = { processWebhookActivity: async () => { processed += 1; } };
  await s.route("webhook", s.post(s.event({ aspect_type: "update" })), overrides);
  assert.equal(s.tasks.length, 0);
  await s.route("webhook", s.post(s.event({ aspect_type: "delete" })), overrides);
  assert.equal(s.tasks.length, 1);
  await s.drainTasks();
  assert.equal(processed, 0);
});

test("an expired processing lease is resumed on Passenger restart without a duplicate delivery", async () => {
  const s = setup();
  await s.seedConnection();
  let processed = 0;
  const overrides = { processWebhookActivity: async () => { processed += 1; } };
  const payload = s.event();
  await s.route("webhook", s.post(payload), overrides);
  const key = s.store.inspectWebhookEvents()[0].event_key;
  assert.equal((await s.store.claimWebhookEvent(key, "abandoned-worker", s.now())).status, "claimed");
  s.tasks.length = 0;
  s.advance(61);
  assert.equal(await resumeWebhookEvents(s.env, { ...s.dependencies, ...overrides }), 1);
  assert.equal(s.tasks.length, 1);
  await s.drainTasks();
  assert.equal(processed, 1);
  assert.equal(s.store.inspectWebhookEvents()[0].processing_status, "succeeded");
});

test("bounded busy retries cross the activity lease and safely resume without a restart", async () => {
  const s = setup();
  await s.seedConnection();
  let processed = 0;
  const overrides = { processWebhookActivity: async () => { processed += 1; } };
  await s.route("webhook", s.post(s.event()), overrides);
  const firstKey = s.store.inspectWebhookEvents()[0].event_key;
  assert.equal((await s.store.claimWebhookEvent(firstKey, "stalled-worker", s.now())).status, "claimed");
  s.tasks.length = 0;
  await s.route("webhook", s.post(s.event({ aspect_type: "update", event_time: s.now() + 1 })), overrides);
  while (s.tasks.length > 0) {
    const { task, delay } = s.tasks.shift();
    s.advance(Math.ceil(delay / 1_000));
    await task();
  }
  assert.equal(processed, 1);
  assert.equal(s.store.inspectWebhookActivityState()[0][1].latest_aspect_rank, 2);
});

test("failed background work is logged generically and retried on a bounded schedule", async () => {
  const s = setup();
  await s.seedConnection();
  let attempts = 0;
  await s.route("webhook", s.post(s.event()), {
    processWebhookActivity: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("private provider detail must not be logged");
    },
  });
  await s.drainTasks();
  assert.equal(attempts, 2);
  assert.equal(s.store.inspectWebhookEvents()[0].processing_status, "succeeded");
  const logs = JSON.stringify(s.logs);
  assert.match(logs, /strava_webhook_activity_failed/);
  assert.match(logs, /strava_webhook_activity_succeeded/);
  assert.doesNotMatch(logs, /private provider detail/);
});

test("webhook acknowledgement precedes deferred activity work", async () => {
  const s = setup();
  await s.seedConnection();
  let began = false;
  const response = await s.route("webhook", s.post(s.event()), {
    processWebhookActivity: async () => { began = true; },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { accepted: true });
  assert.equal(began, false);
  assert.equal(s.tasks.length, 1);
  await s.drainTasks();
  assert.equal(began, true);
});

test("valid-looking webhook bursts are bounded across shared Passenger processes", async () => {
  const s = setup();
  await s.seedConnection();
  const overridesA = { clientAddress: "203.0.113.20", processWebhookActivity: async () => {} };
  const overridesB = { clientAddress: "203.0.113.21", processWebhookActivity: async () => {} };
  for (let index = 0; index < 120; index += 1) {
    const response = await s.route(
      "webhook",
      s.post(s.event({ object_id: 10_000 + index })),
      index % 2 ? overridesA : overridesB,
    );
    assert.equal(response.status, 200);
  }
  assert.equal(s.tasks.length, 120);
  const limited = await s.route("webhook", s.post(s.event({ object_id: 20_000 })), overridesA);
  assert.equal(limited.status, 200);
  assert.deepEqual(await limited.json(), { accepted: true });
  assert.equal(s.tasks.length, 120);
  assert.equal(s.store.inspectWebhookEvents().length, 120);
  assert.match(JSON.stringify(s.logs), /strava_webhook_rate_limit_triggered/);
  s.advance(61);
  await s.route("webhook", s.post(s.event({ object_id: 20_001 })), overridesB);
  assert.equal(s.tasks.length, 121);
});

test("administrator authentication is shared, throttled, recoverable, and never logs credentials", async () => {
  const s = setup();
  await s.seedConnection();
  const valid = { Authorization: `Basic ${btoa(`strava:${s.env.STRAVA_ADMIN_TOKEN}`)}` };
  assert.equal((await s.route("status")).status, 401);
  assert.equal((await s.route("status", { headers: valid })).status, 200);

  const wrong = { Authorization: `Basic ${btoa("strava:wrong-password")}` };
  const sharedStoreProcessA = { clientAddress: "198.51.100.7" };
  const sharedStoreProcessB = { clientAddress: "198.51.100.7" };
  for (let index = 0; index < 10; index += 1) {
    const response = await s.route("status", { headers: wrong }, index % 2 ? sharedStoreProcessA : sharedStoreProcessB);
    assert.equal(response.status, 401, index);
  }
  const limited = await s.route("status", { headers: wrong }, sharedStoreProcessA);
  assert.equal(limited.status, 429);
  const limitedBody = await limited.text();
  assert.equal(limitedBody, '{"error":"rate_limited"}');
  assert.equal(limited.headers.get("retry-after"), "300");
  assert.doesNotMatch(JSON.stringify(s.logs), new RegExp(s.env.STRAVA_ADMIN_TOKEN));
  assert.doesNotMatch(limitedBody, /wrong-password|authorization/i);

  assert.equal((await s.route("status", { headers: valid }, sharedStoreProcessB)).status, 200);
  assert.equal(s.store.inspectAdminAuthFailures().length, 0);
  for (let index = 0; index < 11; index += 1) {
    await s.route("status", { headers: wrong }, sharedStoreProcessA);
  }
  s.advance(301);
  assert.equal((await s.route("status", { headers: wrong }, sharedStoreProcessB)).status, 401);
});

test("bounded webhook/admin bodies and query strings fail safely without secret leakage", async () => {
  const s = setup();
  const oversizedWebhook = await s.route("webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ padding: "x".repeat(17_000) }),
  });
  assert.equal(oversizedWebhook.status, 413);
  assert.deepEqual(await oversizedWebhook.json(), { error: "strava_webhook_too_large" });
  const malformedWebhook = await s.route("webhook", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{",
  });
  assert.equal(malformedWebhook.status, 400);
  const longQuery = await s.route(`status?value=${"x".repeat(4_100)}`);
  assert.equal(longQuery.status, 414);
  const valid = { Authorization: `Basic ${btoa(`strava:${s.env.STRAVA_ADMIN_TOKEN}`)}` };
  const oversizedAdmin = await s.route("candidates/987/assign", {
    method: "POST",
    headers: { ...valid, "Content-Type": "application/json" },
    body: JSON.stringify({ raceId: "ggma-2026-01", padding: "x".repeat(4_100) }),
  });
  assert.equal(oversizedAdmin.status, 413);
  const combined = JSON.stringify([
    await malformedWebhook.text(), await longQuery.text(), await oversizedAdmin.text(), s.logs,
  ]);
  for (const secret of [s.env.STRAVA_ADMIN_TOKEN, s.env.STRAVA_VERIFY_TOKEN, s.env.STRAVA_CLIENT_SECRET]) {
    assert.doesNotMatch(combined, new RegExp(secret));
  }
});
