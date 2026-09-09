import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import siteWorker from "../dist/server/index.js";
import { startInitializedApplication } from "../strava-app/app.js";
import { createMySqlPool, createMySqlStravaStore } from "../strava-app/lib/mysql-store.mjs";
import { hashSecret } from "../strava-app/lib/security.mjs";
import { createMemoryStravaStore } from "./helpers/memory-strava-store.mjs";

const siteWorkerSource = readFileSync(new URL("../dist/server/index.js", import.meta.url), "utf8");

const env = {
  STRAVA_CLIENT_ID: "123456",
  STRAVA_CLIENT_SECRET: "test-only-client-secret",
  STRAVA_VERIFY_TOKEN: "test-only-webhook-verifier-0000000000",
  STRAVA_WEBHOOK_SUBSCRIPTION_ID: "123",
  STRAVA_ADMIN_TOKEN: "test-only-administrator-password-000000",
  STRAVA_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
};
const publicDiagnosticFields = [
  "server", "configLoaded", "mysqlModuleLoaded", "mysqlPoolCreated",
  "databaseReachable", "stravaConfigValid", "startupErrorCategory",
  "database", "encryptionKeyChars", "encryptionKeyDecodedBytes", "encryptionKeyEndsWithPadding",
];

async function assertGenericHealth(base, path, expectedStatus, expectedBody) {
  const response = await fetch(`${base}${path}`);
  assert.equal(response.status, expectedStatus, path);
  assert.equal(response.headers.get("cache-control"), "no-store", path);
  assert.equal(response.headers.get("content-security-policy"), "default-src 'none'; frame-ancestors 'none'; base-uri 'none'", path);
  assert.equal(response.headers.get("referrer-policy"), "no-referrer", path);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff", path);
  const body = await response.json();
  assert.deepEqual(body, expectedBody, path);
  for (const field of publicDiagnosticFields) assert.equal(Object.hasOwn(body, field), false, `${path}: ${field}`);
}

async function runningApplication(t, suppliedStore) {
  const store = suppliedStore || createMemoryStravaStore(() => Math.floor(Date.now() / 1000));
  const application = startInitializedApplication({
    env: { ...env, PORT: "0", IP: "127.0.0.1" },
    store,
    logger: { info() {} },
  });
  const { server } = application;
  if (!server.listening) await new Promise((resolve) => server.once("listening", resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await application.close();
  });
  return `http://127.0.0.1:${server.address().port}`;
}

function createConnectionLinkPool() {
  const links = new Map();
  const states = new Map();

  const execute = async (sql, parameters = []) => {
    const statement = sql.replace(/\s+/g, " ").trim();
    if (statement.startsWith("SELECT 1 FROM ")) return [[], []];
    if (statement === "DELETE FROM strava_connection_links WHERE expires_at <= ?") {
      let affectedRows = 0;
      for (const [hash, link] of links) {
        if (link.expires_at <= parameters[0]) {
          links.delete(hash);
          affectedRows += 1;
        }
      }
      return [{ affectedRows }, []];
    }
    if (statement.startsWith("INSERT INTO strava_connection_links ")) {
      const [tokenHash, expiresAt, createdAt] = parameters;
      links.set(tokenHash, { token_hash: tokenHash, expires_at: expiresAt, created_at: createdAt });
      return [{ affectedRows: 1 }, []];
    }
    if (statement === "DELETE FROM strava_connection_links WHERE token_hash = ? AND expires_at > ? LIMIT 1") {
      const [tokenHash, current] = parameters;
      const link = links.get(tokenHash);
      if (!link || link.expires_at <= current) return [{ affectedRows: 0 }, []];
      links.delete(tokenHash);
      return [{ affectedRows: 1 }, []];
    }
    if (statement.startsWith("INSERT INTO strava_oauth_states ")) {
      const [stateHash, browserHash, expiresAt] = parameters;
      states.set(stateHash, { state_hash: stateHash, browser_hash: browserHash, expires_at: expiresAt });
      return [{ affectedRows: 1 }, []];
    }
    throw new Error(`Unexpected test SQL: ${statement}`);
  };

  const pool = {
    execute,
    async getConnection() {
      let backup = null;
      return {
        async beginTransaction() {
          backup = { links: structuredClone(links), states: structuredClone(states) };
        },
        execute,
        async commit() { backup = null; },
        async rollback() {
          if (!backup) return;
          links.clear();
          states.clear();
          for (const [key, value] of backup.links) links.set(key, value);
          for (const [key, value] of backup.states) states.set(key, value);
          backup = null;
        },
        release() {},
      };
    },
    async end() {},
  };
  return { pool, links, states };
}

test("Namecheap website build remains separate from the Strava Node application", async () => {
  for (const path of ["connect", "status", "callback", "webhook"]) {
    assert.equal((await siteWorker.fetch(new Request(`https://goodwingoodge.com/api/strava/${path}`), {})).status, 404);
  }
  const response = await siteWorker.fetch(new Request("https://goodwingoodge.com/api/tracking-status?progress=0.5&now=2026-10-10T12:00:00Z"), {});
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "public, max-age=0, s-maxage=60, stale-while-revalidate=120");
  const body = await response.json();
  assert.equal(body.progress, 0.5);
  assert.equal("rvStatus" in body, false);
  assert.doesNotMatch(siteWorkerSource, /HAPN_(?:CLIENT_ID|CLIENT_SECRET|DEVICE_IMEI)|publicHapnRvStatus|iotgps|usehapn/);
});

test("app.js serves generic health plus visible and Passenger-stripped mount paths", async (t) => {
  const base = await runningApplication(t);
  const authorization = `Basic ${Buffer.from(`strava:${env.STRAVA_ADMIN_TOKEN}`).toString("base64")}`;
  for (const path of ["/api/strava/status", "/strava/status"]) {
    const protectedResponse = await fetch(`${base}${path}`);
    assert.equal(protectedResponse.status, 401);
    assert.equal(protectedResponse.headers.get("access-control-allow-origin"), null);
    const response = await fetch(`${base}${path}`, { headers: { Authorization: authorization } });
    assert.equal(response.status, 200);
    const status = await response.json();
    assert.equal(status.connected, false);
    assert.equal(typeof status.raceWindowActive, "boolean");
    assert.equal(status.raceWindowId, "ggma-2026");
    assert.equal(status.raceWindowStart, "2026-10-09T00:00:00-04:00");
    assert.equal(status.raceWindowEnd, "2026-11-01T23:59:59-05:00");
  }
  await assertGenericHealth(base, "/strava/health", 200, { status: "ok" });
  await assertGenericHealth(base, "/health", 200, { status: "ok" });
  assert.equal((await fetch(`${base}/api/health`)).status, 404);

  for (const path of ["/api/strava/public/tracking-status", "/strava/public/tracking-status"]) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { available: false });
    assert.equal(response.headers.get("access-control-allow-origin"), null);
    const rejected = await fetch(`${base}${path}`, { method: "POST" });
    assert.equal(rejected.status, 405);
    assert.equal(rejected.headers.get("allow"), "GET");
  }
  for (const path of [
    "/health-startup", "/api/health-startup",
    "/node-test/health-startup", "/strava/health-startup",
  ]) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 404, path);
    const body = await response.json();
    assert.deepEqual(body, { error: "not_found" }, path);
    for (const field of publicDiagnosticFields) assert.equal(Object.hasOwn(body, field), false, `${path}: ${field}`);
  }
});

test("public health returns only generic unavailable when the database check fails", async (t) => {
  const store = createMemoryStravaStore(() => Math.floor(Date.now() / 1000));
  store.ping = async () => { throw new Error("test-only database failure"); };
  const base = await runningApplication(t, store);
  await assertGenericHealth(base, "/strava/health", 503, { status: "unavailable" });
  await assertGenericHealth(base, "/health", 503, { status: "unavailable" });
});

test("candidate administration rejects unauthenticated cPanel mount requests", async (t) => {
  const store = createMemoryStravaStore(() => Math.floor(Date.now() / 1000));
  store.setRaceSchedule([{
    id: "ggma-2026-01",
    race_number: 1,
    state_code: "ME",
    status: "scheduled",
  }]);
  await store.saveRaceActivityCandidate({
    activity_id: "987654321",
    operational_window_id: "ggma-2026",
    athlete_id: "24680",
    activity_name: "Sensitive test candidate",
    activity_type: "Run",
    sport_type: "Run",
    start_date_utc: "2026-10-09T12:00:00.000Z",
    start_date_local: "2026-10-09T08:00:00",
    timezone: "America/New_York",
    distance_meters: 42195,
    moving_time_seconds: 14400,
    elapsed_time_seconds: 15000,
  }, { classificationStatus: "pending" }, 1_791_547_200);

  const base = await runningApplication(t, store);
  for (const path of ["/strava/candidates", "/candidates", "/api/strava/candidates"]) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 401, path);
    assert.equal(response.headers.get("www-authenticate"),
      'Basic realm="Goodwin Strava administration", charset="UTF-8"');
    assert.deepEqual(await response.json(), { error: "unauthorized" });
  }

  for (const credentials of [
    "strava:deliberately-wrong-password",
    `${"wrong-user"}:${env.STRAVA_ADMIN_TOKEN}`,
  ]) {
    const response = await fetch(`${base}/strava/candidates`, {
      headers: { Authorization: `Basic ${Buffer.from(credentials).toString("base64")}` },
    });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "unauthorized" });
  }

  const assignment = await fetch(`${base}/strava/candidates/987654321/assign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ raceId: "ggma-2026-01" }),
  });
  assert.equal(assignment.status, 401);
  assert.deepEqual(await assignment.json(), { error: "unauthorized" });
  assert.equal(store.inspectRaceCandidates()[0].classification_status, "pending");

  const authorization = `Basic ${Buffer.from(`strava:${env.STRAVA_ADMIN_TOKEN}`).toString("base64")}`;
  const authorized = await fetch(`${base}/strava/candidates`, {
    headers: { Authorization: authorization },
  });
  assert.equal(authorized.status, 200);
  const body = await authorized.json();
  assert.equal(body.candidates.length, 1);
  assert.equal(body.candidates[0].activity_id, "987654321");
});

test("final cPanel mount generates and redeems a remote athlete connection link", async (t) => {
  const base = await runningApplication(t);
  const authorization = `Basic ${Buffer.from(`strava:${env.STRAVA_ADMIN_TOKEN}`).toString("base64")}`;
  const generated = await fetch(`${base}/strava/connect-link`, {
    method: "POST",
    headers: { Authorization: authorization },
  });
  assert.equal(generated.status, 201);
  const url = await generated.text();
  assert.equal(new URL(url).pathname, "/strava/connect-athlete");
  assert.equal(generated.headers.get("content-type"), "text/plain; charset=utf-8");
  const token = new URL(url).searchParams.get("token");
  const redeemed = await fetch(`${base}/strava/connect-athlete?token=${token}`, {
    redirect: "manual",
  });
  assert.equal(redeemed.status, 302);
  const authorizationUrl = new URL(redeemed.headers.get("location"));
  assert.equal(authorizationUrl.searchParams.get("redirect_uri"), "https://goodwingoodge.com/strava/callback");
  const replay = await fetch(`${base}/strava/connect-athlete?token=${token}`, { redirect: "manual" });
  assert.equal(replay.status, 400);
  assert.deepEqual(await replay.json(), { error: "strava_connection_link_invalid" });
  const callback = new URL(`${base}/strava/callback`);
  callback.searchParams.set("state", authorizationUrl.searchParams.get("state"));
  callback.searchParams.set("error", "access_denied");
  const declined = await fetch(callback, {
    headers: { Cookie: redeemed.headers.get("set-cookie").split(";")[0] },
  });
  assert.equal(declined.status, 400);
  assert.match(await declined.text(), /declined or cancelled/);
});

test("generated URL token round-trips once through the MySQL store adapter", async (t) => {
  const database = createConnectionLinkPool();
  const store = createMySqlStravaStore(database.pool);
  const base = await runningApplication(t, store);
  const authorization = `Basic ${Buffer.from(`strava:${env.STRAVA_ADMIN_TOKEN}`).toString("base64")}`;
  const generated = await fetch(`${base}/strava/connect-link`, {
    method: "POST",
    headers: { Authorization: authorization },
  });
  assert.equal(generated.status, 201);
  const returnedUrl = await generated.text();
  assert.equal(returnedUrl.trim(), returnedUrl);
  const parsed = new URL(returnedUrl);
  const token = parsed.searchParams.get("token");
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(parsed.searchParams.toString(), `token=${token}`);
  assert.equal(database.links.size, 1);
  assert.ok(database.links.has(await hashSecret(token)));
  assert.ok(!JSON.stringify([...database.links.values()]).includes(token));

  const first = await fetch(`${base}${parsed.pathname}${parsed.search}`, { redirect: "manual" });
  assert.equal(first.status, 302);
  assert.equal(database.links.size, 0);
  assert.equal(database.states.size, 1);
  const replay = await fetch(`${base}${parsed.pathname}${parsed.search}`, { redirect: "manual" });
  assert.equal(replay.status, 400);
  assert.deepEqual(await replay.json(), { error: "strava_connection_link_invalid" });
  assert.equal(database.states.size, 1);
});

test("webhook verification accepts retained, stripped and internal paths without CORS", async (t) => {
  const base = await runningApplication(t);
  const params = new URLSearchParams({
    "hub.mode": "subscribe",
    "hub.verify_token": env.STRAVA_VERIFY_TOKEN,
    "hub.challenge": "test-challenge",
  });
  for (const path of ["/strava/webhook", "/webhook", "/api/strava/webhook"]) {
    const response = await fetch(`${base}${path}?${params}`, {
      headers: { Origin: "https://goodwingoodge.com" },
    });
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get("content-type"), /application\/json/);
    assert.deepEqual(await response.json(), { "hub.challenge": "test-challenge" });
    assert.equal(response.headers.get("access-control-allow-origin"), null);
  }
  const invalid = new URLSearchParams(params);
  invalid.set("hub.verify_token", "deliberately-wrong-token");
  assert.equal((await fetch(`${base}/strava/webhook?${invalid}`)).status, 403);
});

test("webhook POST accepts the retained final cPanel mount path", async (t) => {
  const base = await runningApplication(t);
  const response = await fetch(`${base}/strava/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      object_type: "activity",
      aspect_type: "create",
      object_id: 987,
      owner_id: 456,
      subscription_id: 123,
      event_time: 1788430000,
    }),
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /application\/json/);
  assert.deepEqual(await response.json(), { accepted: true });
});

test("same-origin future public namespace stays empty without CORS or Strava access", async (t) => {
  const base = await runningApplication(t);
  for (const origin of ["https://goodwingoodge.com", "https://evil.example"]) {
    const response = await fetch(`${base}/api/public/tracking`, { headers: { Origin: origin } });
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "not_found" });
    assert.equal(response.headers.get("access-control-allow-origin"), null);
    assert.equal(response.headers.get("access-control-allow-credentials"), null);
  }
});

test("cPanel source declares Node 22, one dependency and the MySQL migration", () => {
  const manifest = JSON.parse(readFileSync(new URL("../strava-app/package.json", import.meta.url), "utf8"));
  assert.equal(manifest.main, "passenger.cjs");
  assert.equal(manifest.engines.node, "22.x");
  assert.deepEqual(Object.keys(manifest.dependencies), ["mysql2"]);
  const migrations = [
    "001_strava_oauth_mysql.sql",
    "002_strava_connection_links_mysql.sql",
    "003_strava_race_activity_candidates_mysql.sql",
    "004_ggma_race_schedule_mysql.sql",
    "004b_ggma_race_schedule_mariadb_repair.sql",
    "005_strava_candidate_runtime_fields_mariadb.sql",
  ]
    .map((name) => readFileSync(new URL(`../strava-app/migrations/${name}`, import.meta.url), "utf8"))
    .join("\n");
  for (const table of [
    "strava_connection", "strava_oauth_states", "strava_refresh_lock",
    "strava_connection_links", "strava_race_activity_candidates",
    "ggma_race_schedule", "strava_race_activity_matches",
  ]) {
    assert.match(migrations, new RegExp(table));
  }
  assert.ok((migrations.match(/ENGINE=InnoDB/g) || []).length >= 8);
  assert.match(migrations, /operational_window_id = 'ggma-2026'/);
  assert.match(migrations, /classification_status IN \('pending', 'included', 'excluded'\)/);
  assert.match(migrations, /classification_status <> 'included'/);
  assert.match(migrations, /PRIMARY KEY \(scheduled_marathon_id\)/);
  assert.match(migrations, /UNIQUE KEY strava_race_activity_matches_activity \(activity_id\)/);
  assert.doesNotMatch(
    readFileSync(new URL("../strava-app/migrations/004_ggma_race_schedule_mysql.sql", import.meta.url), "utf8"),
    /GENERATED\s+ALWAYS/i,
  );
  assert.ok(!migrations.includes("INSERT INTO"));
});

test("MySQL configuration requires every cPanel database variable", async () => {
  const values = {
    MYSQL_HOST: "localhost", MYSQL_PORT: "3306", MYSQL_DATABASE: "example_db",
    MYSQL_USER: "example_user", MYSQL_PASSWORD: "test-only-password",
  };
  for (const key of Object.keys(values)) {
    assert.throws(() => createMySqlPool({ ...values, [key]: "" }), { code: "strava_not_configured" });
  }
  assert.throws(() => createMySqlPool({ ...values, MYSQL_PORT: "70000" }), { code: "strava_storage_unavailable" });
  const pool = createMySqlPool(values);
  await pool.end();
});

test("server-only Strava modules stay out of the public static export", () => {
  for (const name of ["mysql-store.mjs", "race-matching.mjs", "race-window.mjs", "routes.mjs", "service.mjs", "store.mjs", "security.mjs"]) {
    assert.equal(existsSync(new URL(`../dist/api/${name}`, import.meta.url)), false);
  }
});
