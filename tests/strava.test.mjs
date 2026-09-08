import assert from "node:assert/strict";
import test from "node:test";
import { handleStravaRequest } from "../strava-app/lib/routes.mjs";
import { createStravaService, getStravaConnectionStatus, STRAVA_CALLBACK_URL } from "../strava-app/lib/service.mjs";
import { createStravaStore } from "../strava-app/lib/store.mjs";
import { decryptTokens, tokenEncryptionKey } from "../strava-app/lib/security.mjs";
import { createMemoryStravaStore } from "./helpers/memory-strava-store.mjs";

function setup(t) {
  let seconds = Math.floor(Date.now() / 1000);
  const now = () => seconds;
  const store = createMemoryStravaStore(now);
  const env = {
    STRAVA_STORE: store, STRAVA_CLIENT_ID: "123456", STRAVA_CLIENT_SECRET: "test-only-client-secret",
    STRAVA_VERIFY_TOKEN: "test-only-webhook-verifier-0000000000",
    STRAVA_WEBHOOK_SUBSCRIPTION_ID: "123",
    STRAVA_ADMIN_TOKEN: "test-only-administrator-password-000000",
    STRAVA_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  };
  const admin = { Authorization: `Basic ${btoa(`strava:${env.STRAVA_ADMIN_TOKEN}`)}` };
  const calls = [];
  let tokenPayload = {
    access_token: "test-only-access-token", refresh_token: "test-only-refresh-token",
    expires_at: now() + 21600, athlete: { id: 456, firstname: "Test", lastname: "Athlete" },
  };
  const dependencies = {
    now, logger: { info: (...args) => calls.push({ log: args }) },
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return Response.json(tokenPayload);
    },
  };
  const request = (path, options = {}) => new Request(`https://goodwingoodge.com/api/strava/${path}`, options);
  const route = (path, options = {}, deps = dependencies) => handleStravaRequest(request(path, options), env, deps);
  async function begin() {
    const response = await route("connect", { headers: admin });
    assert.equal(response.status, 302);
    return {
      response, state: new URL(response.headers.get("location")).searchParams.get("state"),
      cookie: response.headers.get("set-cookie").split(";")[0],
    };
  }
  async function createConnectionLink() {
    const response = await route("connect-link", { method: "POST", headers: admin });
    assert.equal(response.status, 201);
    const url = new URL(await response.text());
    return { response, url, token: url.searchParams.get("token") };
  }
  async function callback(flow, query = {}) {
    const params = new URLSearchParams({ state: flow.state, code: "test-only-authorization-code", scope: "read,activity:read_all", ...query });
    return route(`callback?${params}`, { headers: { Cookie: flow.cookie } });
  }
  const service = () => createStravaService(env, dependencies);
  const seed = () => service().connect("test-only-code", ["read", "activity:read_all"]);
  return { env, store, admin, calls, dependencies, now, request, route, begin, createConnectionLink,
    callback, service, seed,
    advance: (amount) => { seconds += amount; },
    setTime: (value) => { seconds = Math.floor(Date.parse(value) / 1000); },
    payload: (value) => { tokenPayload = value; },
  };
}

test("connect and status require administrator credentials, not query-string secrets", async (t) => {
  const s = setup(t);
  for (const path of ["connect", "status", `connect?token=${s.env.STRAVA_ADMIN_TOKEN}`]) {
    const response = await s.route(path);
    assert.equal(response.status, 401);
    assert.match(response.headers.get("www-authenticate"), /Basic/);
    assert.equal(response.headers.get("cache-control"), "no-store, private");
  }
  assert.equal((await s.route("connect-link", { method: "POST" })).status, 401);
  assert.equal((await s.route(`connect-link?token=${s.env.STRAVA_ADMIN_TOKEN}`, { method: "POST" })).status, 401);
  assert.equal(s.store.states.size, 0);
});

test("administrator creates a hashed 24-hour athlete connection link without exposing admin credentials", async (t) => {
  const s = setup(t);
  const generated = await s.createConnectionLink();
  assert.equal(generated.url.origin, "https://goodwingoodge.com");
  assert.equal(generated.url.pathname, "/strava/connect-athlete");
  assert.match(generated.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(generated.response.headers.get("content-type"), "text/plain; charset=utf-8");
  assert.equal(generated.response.headers.get("cache-control"), "no-store, private");
  assert.equal(generated.response.headers.get("access-control-allow-origin"), null);
  assert.ok(!generated.url.href.includes(s.env.STRAVA_ADMIN_TOKEN));
  const stored = JSON.stringify(s.store.inspectConnectionLinks());
  assert.ok(!stored.includes(generated.token));
  assert.ok(!stored.includes(s.env.STRAVA_ADMIN_TOKEN));
  assert.match(s.store.inspectConnectionLinks()[0].token_hash, /^[A-Za-z0-9+/]{43}=$/);
  assert.equal(s.store.inspectConnectionLinks()[0].expires_at, s.now() + 86_400);
});

test("remote athlete link is atomically single-use and preserves the normal OAuth callback flow", async (t) => {
  const s = setup(t);
  const generated = await s.createConnectionLink();
  const attempts = await Promise.all([
    s.route(`connect-athlete?token=${generated.token}`),
    s.route(`connect-athlete?token=${generated.token}`),
  ]);
  assert.deepEqual(attempts.map((response) => response.status).sort(), [302, 400]);
  const response = attempts.find((candidate) => candidate.status === 302);
  const authorize = new URL(response.headers.get("location"));
  const flow = {
    response,
    state: authorize.searchParams.get("state"),
    cookie: response.headers.get("set-cookie").split(";")[0],
  };
  assert.equal(authorize.origin + authorize.pathname, "https://www.strava.com/oauth/authorize");
  assert.equal(authorize.searchParams.get("redirect_uri"), STRAVA_CALLBACK_URL);
  assert.equal(authorize.searchParams.get("scope"), "read,activity:read_all");
  assert.equal(authorize.searchParams.get("token"), null);
  assert.equal(s.store.inspectConnectionLinks().length, 0);
  assert.equal(await s.callback(flow).then((callback) => callback.status), 200);
  assert.equal(s.store.inspectConnection().athlete_id, "456");
});

test("invalid, duplicated and expired athlete links fail without creating OAuth state", async (t) => {
  const s = setup(t);
  for (const path of [
    "connect-athlete",
    "connect-athlete?token=invalid",
    `connect-athlete?token=${"a".repeat(43)}&token=${"b".repeat(43)}`,
  ]) {
    const response = await s.route(path);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "strava_connection_link_invalid" });
  }
  const generated = await s.createConnectionLink();
  s.advance(86_401);
  const expired = await s.route(`connect-athlete?token=${generated.token}`);
  assert.equal(expired.status, 400);
  assert.deepEqual(await expired.json(), { error: "strava_connection_link_invalid" });
  assert.equal(s.store.states.size, 0);
  assert.equal(s.calls.length, 0);
});

test("connect uses the exact OAuth URL, random browser-bound state and secure cookies", async (t) => {
  const s = setup(t);
  const flow = await s.begin();
  const url = new URL(flow.response.headers.get("location"));
  assert.equal(url.origin + url.pathname, "https://www.strava.com/oauth/authorize");
  assert.equal(url.searchParams.get("client_id"), s.env.STRAVA_CLIENT_ID);
  assert.equal(url.searchParams.get("redirect_uri"), STRAVA_CALLBACK_URL);
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("approval_prompt"), "auto");
  assert.equal(url.searchParams.get("scope"), "read,activity:read_all");
  assert.match(flow.state, /^[A-Za-z0-9_-]{43}$/);
  assert.match(flow.response.headers.get("set-cookie"), /Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=600/);
  assert.match(flow.cookie, /^__Host-/);
  const stored = JSON.stringify([...s.store.states.values()]);
  assert.ok(!stored.includes(flow.state));
  assert.ok(!stored.includes(flow.cookie.split("=")[1]));
  assert.ok(!url.href.includes(s.env.STRAVA_CLIENT_SECRET));
  assert.notEqual(flow.state, (await s.begin()).state);
});

test("connect fails closed without storage, app credentials or encryption", async (t) => {
  const s = setup(t);
  for (const key of ["STRAVA_STORE", "STRAVA_CLIENT_ID", "STRAVA_CLIENT_SECRET", "STRAVA_ADMIN_TOKEN", "STRAVA_TOKEN_ENCRYPTION_KEY"]) {
    const env = { ...s.env, [key]: undefined };
    const response = await handleStravaRequest(s.request("connect", { headers: s.admin }), env, s.dependencies);
    assert.equal(response.status, 503, key);
    assert.equal(response.headers.get("location"), null);
  }
  assert.equal(s.calls.length, 0);
});

test("OAuth and administrator routes reject unexpected origins", async (t) => {
  const s = setup(t);
  const response = await handleStravaRequest(new Request("https://preview.example/api/strava/connect", { headers: s.admin }), s.env);
  assert.equal(response.status, 400);
  const athlete = await handleStravaRequest(
    new Request(`https://preview.example/api/strava/connect-athlete?token=${"a".repeat(43)}`),
    s.env,
  );
  assert.equal(athlete.status, 400);
});

test("callback rejects missing/wrong/duplicate state, wrong browser and expired state before token exchange", async (t) => {
  const s = setup(t);
  const flow = await s.begin();
  const invalid = [
    await s.route("callback?code=example"),
    await s.callback(flow, { state: "invalid" }),
    await s.callback({ ...flow, cookie: "" }),
    await s.callback({ ...flow, cookie: flow.cookie + "; " + flow.cookie }),
    await s.route(`callback?state=${flow.state}&state=${flow.state}`, { headers: { Cookie: flow.cookie } }),
  ];
  const other = await s.begin();
  invalid.push(await s.callback({ ...flow, cookie: other.cookie }));
  s.advance(601);
  invalid.push(await s.callback(flow));
  for (const response of invalid) {
    assert.equal(response.status, 400);
    assert.match(response.headers.get("set-cookie"), /Max-Age=0/);
  }
  assert.equal(s.calls.length, 0);
});

test("authorization denial consumes state, preserves credentials, and never reflects errors", async (t) => {
  const s = setup(t);
  await s.seed();
  const previous = s.store.inspectConnection();
  s.calls.length = 0;
  const flow = await s.begin();
  const response = await s.callback(flow, { error: "<script>untrusted</script>" });
  assert.equal(response.status, 400);
  const text = await response.text();
  assert.match(text, /declined or cancelled/);
  assert.ok(!text.includes("<script>"));
  assert.deepEqual(s.store.inspectConnection(), previous);
  assert.equal((await s.callback(flow)).status, 400);
  assert.equal(s.calls.length, 0);
});

test("missing code and missing/partial scopes fail before exchange", async (t) => {
  const s = setup(t);
  for (const query of [{ code: "" }, { scope: "" }, { scope: "read,activity:read" }]) {
    assert.equal((await s.callback(await s.begin(), query)).status, 400);
  }
  assert.equal(s.calls.length, 0);
});

test("successful callback encrypts credentials, stores identity/scopes, clears cookie and rejects replay", async (t) => {
  const s = setup(t);
  const flow = await s.begin();
  const response = await s.callback(flow);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "Strava is connected. You can close this page.");
  assert.match(response.headers.get("set-cookie"), /Max-Age=0/);
  const row = s.store.inspectConnection();
  assert.equal(row.athlete_id, "456");
  assert.equal(row.athlete_name, "Test Athlete");
  assert.match(row.encrypted_tokens, /^v1\./);
  assert.ok(!JSON.stringify(row).includes("test-only-access-token"));
  assert.ok(!JSON.stringify(row).includes("test-only-refresh-token"));
  const tokens = await decryptTokens(await tokenEncryptionKey(s.env), row.athlete_id, row.encrypted_tokens);
  assert.equal(tokens.refresh_token, "test-only-refresh-token");
  assert.equal(s.calls[0].url, "https://www.strava.com/oauth/token");
  assert.equal(s.calls[0].options.body.get("client_secret"), s.env.STRAVA_CLIENT_SECRET);
  assert.equal(s.calls[0].options.body.get("code"), "test-only-authorization-code");
  assert.equal(s.calls[0].options.redirect, "error");
  assert.equal((await s.callback(flow)).status, 400);
  assert.equal(s.calls.length, 1);
});

test("protected status returns safe metadata and actual expiration, without token refresh", async (t) => {
  const s = setup(t);
  assert.deepEqual(await getStravaConnectionStatus(s.env), { connected: false });
  await s.seed();
  const count = s.calls.length;
  s.advance(21601);
  const response = await s.route("status", { headers: s.admin });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.deepEqual(Object.keys(data).sort(), [
    "connected", "athleteId", "athleteName", "tokenExpiresAt", "tokenExpired", "scopes",
    "raceWindowActive", "raceWindowId", "raceWindowStart", "raceWindowEnd",
  ].sort());
  assert.equal(data.tokenExpired, true);
  assert.deepEqual(data.scopes, ["read", "activity:read_all"]);
  assert.equal(s.calls.length, count);
});

async function statusAt(timestamp) {
  const s = setup();
  return s.route("status", { headers: s.admin }, {
    ...s.dependencies,
    now: () => Math.floor(Date.parse(timestamp) / 1000),
  }).then((response) => response.json());
}

test("protected status reports the race window inactive before it starts", async () => {
  const status = await statusAt("2026-10-09T03:59:59Z");
  assert.deepEqual(status, {
    connected: false,
    raceWindowActive: false,
    raceWindowId: "ggma-2026",
    raceWindowStart: "2026-10-09T00:00:00-04:00",
    raceWindowEnd: "2026-11-01T23:59:59-05:00",
  });
});

test("protected status reports the race window active during the window", async () => {
  const status = await statusAt("2026-10-15T12:00:00-04:00");
  assert.equal(status.raceWindowActive, true);
});

test("protected status reports the race window inactive after it ends", async () => {
  const status = await statusAt("2026-11-02T05:00:00Z");
  assert.equal(status.raceWindowActive, false);
});

test("pending candidate review and assignment remain administrator-only", async () => {
  const s = setup();
  const race = {
    id: "ggma-2026-16", race_number: 16, race_date: "2026-10-17",
    state: "Kansas", state_code: "KS", city: "Kansas City", status: "scheduled",
  };
  s.store.setRaceSchedule([race]);
  await s.store.saveRaceActivityCandidate({
    activity_id: "987654321", athlete_id: "456", operational_window_id: "ggma-2026",
    activity_start_at: Math.floor(Date.parse("2026-10-17T15:00:00Z") / 1000),
    activity_local_date: "2026-10-17", activity_type: "Run", distance_meters: 42_250,
    start_latitude: null, start_longitude: null, end_latitude: null, end_longitude: null,
    source_updated_at: s.now(),
  }, { classificationStatus: "pending" }, s.now());

  assert.equal((await s.route("candidates")).status, 401);
  const review = await s.route("candidates", { headers: s.admin });
  assert.equal(review.status, 200);
  const reviewData = await review.json();
  assert.equal(reviewData.candidates.length, 1);
  assert.equal(reviewData.races.length, 1);

  const assignment = await s.route("candidates/987654321/assign", {
    method: "POST",
    headers: { ...s.admin, "Content-Type": "application/json" },
    body: JSON.stringify({ raceId: "ggma-2026-16" }),
  });
  assert.equal(assignment.status, 200);
  assert.deepEqual(await assignment.json(), {
    assigned: true, activityId: "987654321", raceId: "ggma-2026-16",
  });
  assert.equal((await s.route("candidates", { headers: s.admin }).then((response) => response.json())).candidates.length, 0);
});

test("fresh tokens are reused without requests; expired tokens rotate durably", async (t) => {
  const s = setup(t);
  await s.seed();
  assert.equal(await s.service().getAccessToken(), "test-only-access-token");
  assert.equal(s.calls.length, 1);
  s.advance(21601);
  s.payload({ access_token: "test-only-access-2", refresh_token: "test-only-refresh-2", expires_at: s.now() + 21600 });
  assert.equal(await s.service().getAccessToken(), "test-only-access-2");
  assert.equal(s.calls[1].options.body.get("refresh_token"), "test-only-refresh-token");
  assert.equal(s.calls[1].options.body.get("grant_type"), "refresh_token");
  s.advance(21601);
  s.payload({ access_token: "test-only-access-3", refresh_token: "test-only-refresh-3", expires_at: s.now() + 21600 });
  assert.equal(await s.service().getAccessToken(), "test-only-access-3");
  assert.equal(s.calls[2].options.body.get("refresh_token"), "test-only-refresh-2");
  const row = s.store.inspectConnection();
  assert.ok(!row.encrypted_tokens.includes("test-only-refresh-3"));
  assert.equal((await decryptTokens(await tokenEncryptionKey(s.env), row.athlete_id, row.encrypted_tokens)).refresh_token, "test-only-refresh-3");
});

test("refresh begins five minutes before expiry", async (t) => {
  const s = setup(t);
  await s.seed();
  s.advance(21300);
  s.payload({ access_token: "test-early", refresh_token: "test-rotated", expires_at: s.now() + 21600 });
  assert.equal(await s.service().getAccessToken(), "test-early");
  assert.equal(s.calls.length, 2);
});

test("concurrent services cannot exchange the same refresh token twice", async (t) => {
  const s = setup(t);
  await s.seed();
  s.advance(21601);
  let resume;
  let started;
  const entered = new Promise((resolve) => { started = resolve; });
  s.dependencies.fetchImpl = async () => {
    started();
    await new Promise((resolve) => { resume = resolve; });
    return Response.json({ access_token: "test-concurrent-access", refresh_token: "test-concurrent-refresh", expires_at: s.now() + 21600 });
  };
  const first = s.service().getAccessToken();
  await entered;
  await assert.rejects(s.service().getAccessToken(), { code: "strava_connection_busy" });
  resume();
  assert.equal(await first, "test-concurrent-access");
  assert.equal(await s.service().getAccessToken(), "test-concurrent-access");
});

test("expired lease holders cannot save over a newer lease", async (t) => {
  const s = setup(t);
  await s.seed();
  const store = createStravaStore(s.env);
  assert.equal(await store.acquireLock("old-owner"), true);
  s.store.expireLock();
  assert.equal(await store.acquireLock("new-owner"), true);
  const row = await store.getConnection();
  await assert.rejects(store.saveConnection({ ...row, encrypted_tokens: "stale-write" }, "old-owner"), { code: "strava_connection_changed" });
  await store.releaseLock("old-owner");
  assert.equal(s.store.inspectLock().owner, "new-owner");
});

test("transient persistence failure retries the rotated tokens without exchanging again", async (t) => {
  const s = setup(t);
  await s.seed();
  s.advance(21601);
  s.payload({ access_token: "test-retry-access", refresh_token: "test-retry-refresh", expires_at: s.now() + 21600 });
  let saves = 0;
  s.store.failNextSaves(1);
  const originalSave = s.store.saveConnection;
  s.store.saveConnection = async (...args) => { saves += 1; return originalSave(...args); };
  assert.equal(await s.service().getAccessToken(), "test-retry-access");
  assert.equal(s.calls.length, 2);
  assert.equal(saves, 2);
});

test("failed refresh leaves existing credentials intact and errors disclose no provider body", async (t) => {
  const s = setup(t);
  await s.seed();
  s.advance(21601);
  const before = s.store.inspectConnection();
  s.dependencies.fetchImpl = async () => Response.json({ error: "test-secret-in-provider-body" }, { status: 400 });
  await assert.rejects(s.service().getAccessToken(), { code: "strava_reauthorization_required" });
  assert.deepEqual(s.store.inspectConnection(), before);
  assert.equal(s.store.inspectLock(), null);
  const response = await s.callback(await s.begin());
  assert.equal(response.status, 502);
  assert.ok(!(await response.text()).includes("test-secret-in-provider-body"));
});

test("invalid or incomplete token responses are never persisted", async (t) => {
  const s = setup(t);
  for (const payload of [null, {}, { access_token: "test", expires_at: s.now() + 600 },
    { access_token: "test", refresh_token: "test", expires_at: s.now() - 1 },
    { access_token: "test", refresh_token: "test", expires_at: 8_640_000_001 }]) {
    s.payload(payload);
    assert.equal((await s.callback(await s.begin())).status, 502);
  }
  assert.deepEqual(await getStravaConnectionStatus(s.env), { connected: false });
});

test("an existing athlete may reconnect but a different athlete cannot replace them", async (t) => {
  const s = setup(t);
  await s.seed();
  s.payload({ access_token: "test-new", refresh_token: "test-new-refresh", expires_at: s.now() + 21600,
    athlete: { id: 456, firstname: "Updated", lastname: "Name" } });
  assert.equal((await s.callback(await s.begin())).status, 200);
  const before = s.store.inspectConnection();
  s.payload({ access_token: "test-other", refresh_token: "test-other-refresh", expires_at: s.now() + 21600,
    athlete: { id: 789, firstname: "Other" } });
  assert.equal((await s.callback(await s.begin())).status, 409);
  assert.deepEqual(s.store.inspectConnection(), before);
});

test("encryption authenticates the athlete and rejects tampering or a changed key", async (t) => {
  const s = setup(t);
  await s.seed();
  const row = await createStravaStore(s.env).getConnection();
  const key = await tokenEncryptionKey(s.env);
  await assert.rejects(decryptTokens(key, "different-athlete", row.encrypted_tokens), { code: "strava_credentials_unavailable" });
  const wrongKey = await tokenEncryptionKey({ STRAVA_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 8).toString("base64") });
  await assert.rejects(decryptTokens(wrongKey, row.athlete_id, row.encrypted_tokens), { code: "strava_credentials_unavailable" });
});

test("authenticated requests stay on Strava and never follow redirects", async (t) => {
  const s = setup(t);
  await s.seed();
  const seen = [];
  s.dependencies.fetchImpl = async (url, options) => {
    seen.push({ url: String(url), options });
    return Response.json({ id: 456 });
  };
  assert.deepEqual(await s.service().request("/athlete"), { id: 456 });
  assert.equal(seen[0].url, "https://www.strava.com/api/v3/athlete");
  assert.equal(seen[0].options.headers.get("Authorization"), "Bearer test-only-access-token");
  assert.equal(seen[0].options.redirect, "error");
  await assert.rejects(s.service().request("/activities/987"), { code: "strava_operational_window_closed" });
  for (const path of ["https://evil.example", "//evil.example", "/athlete/../../../oauth/token", "/athlete?access_token=x", "/athlete\\evil"]) {
    await assert.rejects(s.service().request(path), { code: "strava_invalid_api_path" });
  }
  assert.equal(seen.length, 1);
});

test("activity API requests cannot begin after the operational window closes", async (t) => {
  const s = setup(t);
  const raceTime = Date.parse("2026-10-15T12:00:00-04:00") / 1000;
  s.advance(raceTime - s.now());
  s.payload({
    access_token: "test-only-access-token",
    refresh_token: "test-only-refresh-token",
    expires_at: raceTime + 21600,
    athlete: { id: 456, firstname: "Test", lastname: "Athlete" },
  });
  await s.seed();
  s.calls.length = 0;
  assert.deepEqual(await s.service().request("/activities/987"), {
    access_token: "test-only-access-token",
    refresh_token: "test-only-refresh-token",
    expires_at: raceTime + 21600,
    athlete: { id: 456, firstname: "Test", lastname: "Athlete" },
  });
  assert.equal(s.calls.length, 1);
  s.advance(Date.parse("2026-11-02T00:00:00-05:00") / 1000 - s.now());
  await assert.rejects(s.service().request("/activities/987"), { code: "strava_operational_window_closed" });
  await assert.rejects(s.service().request("/athlete/activities"), { code: "strava_operational_window_closed" });
  assert.equal(s.calls.length, 1);
});

test("webhook verification returns the exact JSON challenge", async (t) => {
  const s = setup(t);
  const params = new URLSearchParams({ "hub.mode": "subscribe", "hub.verify_token": s.env.STRAVA_VERIFY_TOKEN, "hub.challenge": "challenge-123" });
  const response = await s.route(`webhook?${params}`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /application\/json/);
  assert.deepEqual(await response.json(), { "hub.challenge": "challenge-123" });
  for (const key of ["hub.mode", "hub.verify_token", "hub.challenge"]) {
    const changed = new URLSearchParams(params);
    changed.set(key, key === "hub.challenge" ? "" : "wrong");
    assert.equal((await s.route(`webhook?${changed}`)).status, 403);
  }
  params.append("hub.verify_token", s.env.STRAVA_VERIFY_TOKEN);
  assert.equal((await s.route(`webhook?${params}`)).status, 403);
});

const event = { object_type: "activity", aspect_type: "create", object_id: 987, owner_id: 456, event_time: 1788430000, subscription_id: 123 };
const post = (body) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("webhook POST acknowledges immediately and logs only allowlisted metadata", async (t) => {
  const s = setup(t);
  const raceNow = () => Date.parse("2026-10-15T12:00:00-04:00") / 1000;
  const inWindow = { ...s.dependencies, now: raceNow };
  const response = await s.route(
    "webhook",
    post({ ...event, updates: { title: "private title", access_token: "test-secret" }, refresh_token: "test-secret" }),
    inWindow,
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { accepted: true });
  assert.deepEqual(s.calls, [
    { log: ["strava_webhook_received", {
      object_type: "activity", aspect_type: "create", object_id: 987,
    }] },
    { log: ["strava_webhook_wrong_athlete_ignored", { object_id: 987 }] },
  ]);
  assert.doesNotMatch(JSON.stringify(s.calls), /private title|test-secret|refresh_token|access_token/);
  assert.equal(s.store.inspectConnection(), null);
  assert.equal((await s.route("webhook", post(event), {
    now: raceNow,
    logger: { info() { throw new Error("logger failure"); } },
  })).status, 200);
});

test("activity webhooks outside the operational window are acknowledged and ignored", async (t) => {
  const s = setup(t);
  for (const current of [
    Date.parse("2026-10-08T23:59:59-04:00") / 1000,
    Date.parse("2026-11-02T00:00:00-05:00") / 1000,
  ]) {
    const calls = [];
    const response = await s.route("webhook", post(event), {
      now: () => current,
      logger: { info: (...values) => calls.push(values) },
      fetchImpl: async () => { throw new Error("Strava must not be fetched outside the operational window"); },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { accepted: true });
    assert.deepEqual(calls, [
      ["strava_webhook_received", { object_type: "activity", aspect_type: "create", object_id: 987 }],
      ["strava_webhook_window_closed_ignored", { object_id: 987 }],
    ]);
  }
});

test("an in-window activity webhook schedules fetch, validation and candidate matching", async () => {
  const s = setup();
  s.setTime("2026-10-17T15:00:00Z");
  s.payload({
    access_token: "test-only-access-token", refresh_token: "test-only-refresh-token",
    expires_at: s.now() + 21_600,
    athlete: { id: 456, firstname: "Test", lastname: "Athlete" },
  });
  await s.seed();
  s.store.setRaceSchedule([{
    id: "ggma-2026-16", race_number: 16, race_date: "2026-10-17",
    state: "Kansas", state_code: "KS", city: "Kansas City",
    latitude: null, longitude: null, status: "scheduled",
  }]);
  let backgroundTask;
  const dependencies = {
    ...s.dependencies,
    scheduleBackground(task) { backgroundTask = task; },
    async fetchImpl(url) {
      assert.equal(String(url), "https://www.strava.com/api/v3/activities/987");
      return Response.json({
        id: 987, athlete: { id: 456 }, type: "Run", distance: 42_300,
        moving_time: 10_800, elapsed_time: 11_040, total_elevation_gain: 184.5,
        map: { summary_polyline: "_p~iF~ps|U_ulLnnqC" },
        start_latlng: [39.0997, -94.5786], end_latlng: [39.1097, -94.5686],
        start_date: "2026-10-17T15:00:00Z",
        start_date_local: "2026-10-17T10:00:00",
        location_state: "Kansas", location_city: "Kansas City",
      });
    },
  };
  const response = await s.route("webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      object_type: "activity", aspect_type: "create", object_id: 987,
      owner_id: 456, subscription_id: 123, event_time: s.now(),
    }),
  }, dependencies);
  assert.equal(response.status, 200);
  assert.equal(typeof backgroundTask, "function");
  await backgroundTask();
  const candidate = s.store.inspectRaceCandidates()[0];
  assert.equal(candidate.classification_status, "included");
  assert.equal(candidate.scheduled_marathon_id, "ggma-2026-16");
  assert.equal(candidate.moving_time_seconds, 10_800);
  assert.equal(candidate.elapsed_time_seconds, 11_040);
  assert.equal(candidate.elevation_gain_meters, 184.5);
  assert.equal(candidate.summary_polyline, "_p~iF~ps|U_ulLnnqC");
});

test("an in-window webhook for another owner cannot trigger a Strava fetch", async () => {
  const s = setup();
  s.setTime("2026-10-17T15:00:00Z");
  s.payload({
    access_token: "test-only-access-token", refresh_token: "test-only-refresh-token",
    expires_at: s.now() + 21_600,
    athlete: { id: 456, firstname: "Test", lastname: "Athlete" },
  });
  await s.seed();
  let backgroundTask;
  let fetched = false;
  const response = await s.route("webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      object_type: "activity", aspect_type: "create", object_id: 987,
      owner_id: 999, subscription_id: 123, event_time: s.now(),
    }),
  }, {
    ...s.dependencies,
    scheduleBackground(task) { backgroundTask = task; },
    async fetchImpl() { fetched = true; return Response.json({}); },
  });
  assert.equal(response.status, 200);
  assert.equal(backgroundTask, undefined);
  assert.equal(fetched, false);
  assert.equal(s.store.inspectRaceCandidates().length, 0);
});

test("webhook POST validates type, fields, malformed JSON and bounded body size", async (t) => {
  const s = setup(t);
  for (const body of [null, [], {}, { ...event, object_type: "unknown" }, { ...event, aspect_type: "unknown" },
    { ...event, owner_id: "456" }, { ...event, object_id: -1 }, { ...event, event_time: 1.5 },
    { ...event, subscription_id: undefined }, { ...event, updates: [] }]) {
    assert.equal((await s.route("webhook", post(body))).status, 400);
  }
  assert.equal((await s.route("webhook", { ...post(event), body: "{" })).status, 400);
  assert.equal((await s.route("webhook", { ...post(event), headers: { "Content-Type": "text/plain" } })).status, 415);
  assert.equal((await s.route("webhook", post({ ...event, large: "x".repeat(17000) }))).status, 413);
  assert.equal(s.calls.length, 0);
});

test("methods and unknown endpoints are rejected", async (t) => {
  const s = setup(t);
  for (const path of ["connect", "callback", "status", "webhook"]) {
    const response = await s.route(path, { method: "DELETE" });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), path === "webhook" ? "GET, POST" : "GET");
  }
  const athleteConnect = await s.route("connect-athlete", { method: "DELETE" });
  assert.equal(athleteConnect.status, 405);
  assert.equal(athleteConnect.headers.get("allow"), "GET");
  const connectionLink = await s.route("connect-link", { method: "GET" });
  assert.equal(connectionLink.status, 405);
  assert.equal(connectionLink.headers.get("allow"), "POST");
  assert.equal((await s.route("unknown")).status, 404);
});
