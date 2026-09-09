import assert from "node:assert/strict";
import test from "node:test";
import {
  HAPN_STATUS_RESPONSE_MAX_BYTES,
  HapnError,
  hapnConfiguration,
  normalizeHapnRvStatus,
  publicHapnRvStatus,
  resetHapnTokenCacheForTests,
} from "../integrations/hapn/hapn-tracking-core.mjs";
import {
  createHapnPublicRateLimiter,
  handleHapnPublicRequest,
} from "../strava-app/lib/hapn-route.mjs";

const env = {
  HAPN_CLIENT_ID: "hapn-test-client",
  HAPN_CLIENT_SECRET: "hapn-test-secret",
  HAPN_DEVICE_IMEI: "868239050345326",
  HAPN_STALE_AFTER_SECONDS: "900",
  HAPN_RETENTION_SECONDS: "21600",
};
const now = new Date("2026-10-10T12:05:00.000Z");

function tokenResponse(accessToken = "test-access-token", options = {}) {
  return new Response(JSON.stringify({ access_token: accessToken, token_type: "Bearer", expires_in: 3600 }), {
    status: options.status || 200,
    headers: { "Content-Type": options.contentType || "application/json" },
  });
}

function statusPayload(overrides = {}) {
  return {
    success: true,
    message: "ok",
    result: {
      imei: env.HAPN_DEVICE_IMEI,
      latitude: "40.830864",
      longitude: "-74.117069",
      speed: "12.5",
      azimuth: "87",
      batteryPercentage: "82",
      sendTime: "2026-10-10T12:00:00.000Z",
      created: "2026-10-10T12:00:03.000Z",
      gpsUTCTime: "20261010120000",
      address: "A private street address",
      appUrl: "https://app.gethapn.com/private-device-link",
      deviceTypeId: 12,
      gpsAccuracy: "3",
      cellId: "0154C201",
      messageId: "fixture-message-id",
      reportType: "0",
      clientId: 606609,
      odoMileage: "409.1",
      hoursOfOperation: "10.01",
      reportId: "fixture-report-id",
      ...overrides,
    },
  };
}

function statusResponse(overrides = {}, options = {}) {
  return new Response(JSON.stringify(statusPayload(overrides)), {
    status: options.status || 200,
    headers: { "Content-Type": options.contentType || "application/json" },
  });
}

function successfulFetch(calls = []) {
  return async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return String(url).includes("oauth2/token") ? tokenResponse() : statusResponse();
  };
}

test.beforeEach(() => resetHapnTokenCacheForTests());

test("HAPN OAuth and fixed device status become the minimal public RV projection", async () => {
  const calls = [];
  const result = await publicHapnRvStatus({ env, fetchImpl: successfulFetch(calls), now });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "https://auth.usehapn.com/oauth2/token");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.redirect, "error");
  assert.equal(calls[1].url, `https://api.iotgps.io/v1/devices/${env.HAPN_DEVICE_IMEI}/status`);
  assert.equal(calls[1].options.redirect, "error");
  assert.equal(calls[1].options.headers.Authorization, "Bearer test-access-token");
  assert.deepEqual(result, {
    available: true,
    stale: false,
    observedAt: "2026-10-10T12:00:00.000Z",
    position: { lat: 40.831, lng: -74.117 },
  });
  assert.doesNotMatch(
    JSON.stringify(result),
    /hapn|configured|868239050345326|private street|private-device-link|deviceTypeId|gpsAccuracy|cellId|messageId|reportType|clientId|odoMileage|hoursOfOperation|reportId/i,
  );
});

test("tokens and concurrent status reads are coalesced, with one bounded 401 refresh", async () => {
  let auth = 0;
  let status = 0;
  const fetchImpl = async (url) => {
    if (String(url).includes("oauth2/token")) return tokenResponse(`token-${++auth}`);
    status += 1;
    return status === 1
      ? new Response("{}", { status: 401, headers: { "Content-Type": "application/json" } })
      : statusResponse();
  };
  const [first, second] = await Promise.all([
    publicHapnRvStatus({ env, fetchImpl, now }),
    publicHapnRvStatus({ env, fetchImpl, now }),
  ]);
  assert.deepEqual(first, second);
  assert.equal(first.available, true);
  assert.equal(auth, 2);
  assert.equal(status, 2);
});

test("configuration is all-or-nothing and includes bounded freshness, retention and precision", () => {
  assert.equal(hapnConfiguration({}), null);
  assert.throws(() => hapnConfiguration({ HAPN_CLIENT_ID: "partial" }), { code: "hapn_not_configured" });
  assert.throws(() => hapnConfiguration({ ...env, HAPN_DEVICE_IMEI: "wrong" }), { code: "hapn_not_configured" });
  assert.throws(() => hapnConfiguration({ ...env, HAPN_STALE_AFTER_SECONDS: "10" }), { code: "hapn_invalid_stale_window" });
  assert.throws(() => hapnConfiguration({ ...env, HAPN_RETENTION_SECONDS: "100" }), { code: "hapn_invalid_retention_window" });
  assert.throws(() => hapnConfiguration({ ...env, HAPN_PUBLIC_COORDINATE_DECIMALS: "6" }), { code: "hapn_invalid_coordinate_precision" });
});

test("documented provider metadata is tolerated but never enters the normalized projection", () => {
  const options = { expectedImei: env.HAPN_DEVICE_IMEI, now };
  const normalized = normalizeHapnRvStatus(statusPayload({ futureProviderMetadata: { ignored: true } }), options);
  assert.deepEqual(normalized, {
    available: true,
    stale: false,
    observedAt: "2026-10-10T12:00:00.000Z",
    position: { lat: 40.831, lng: -74.117 },
  });
  assert.deepEqual(Object.keys(normalized), ["available", "stale", "observedAt", "position"]);
});

test("required identity, coordinates and timestamps remain strictly validated", () => {
  const options = { expectedImei: env.HAPN_DEVICE_IMEI, now };
  assert.throws(() => normalizeHapnRvStatus(statusPayload({ imei: "868239050345327" }), options), { code: "hapn_device_mismatch" });
  assert.throws(() => normalizeHapnRvStatus(statusPayload({ imei: 868239050345326 }), options), { code: "hapn_device_mismatch" });
  assert.throws(() => normalizeHapnRvStatus(statusPayload({ latitude: 91 }), options), { code: "hapn_invalid_coordinates" });
  assert.throws(() => normalizeHapnRvStatus(statusPayload({ longitude: [] }), options), { code: "hapn_invalid_coordinates" });
  const missingLatitude = statusPayload();
  delete missingLatitude.result.latitude;
  assert.throws(() => normalizeHapnRvStatus(missingLatitude, options), { code: "hapn_invalid_status_response" });
  const missingLongitude = statusPayload();
  delete missingLongitude.result.longitude;
  assert.throws(() => normalizeHapnRvStatus(missingLongitude, options), { code: "hapn_invalid_status_response" });
  assert.throws(() => normalizeHapnRvStatus(statusPayload({ sendTime: "not-a-time" }), options), { code: "hapn_invalid_timestamp" });
  assert.throws(() => normalizeHapnRvStatus(statusPayload({ sendTime: "2026-10-10T12:11:00Z" }), options), { code: "hapn_future_timestamp" });
  assert.throws(() => normalizeHapnRvStatus({ success: true, result: [] }, options), { code: "hapn_invalid_status_response" });
});

test("stale coordinates expire at the explicit retention ceiling", () => {
  const options = { expectedImei: env.HAPN_DEVICE_IMEI, now, staleAfterSeconds: 900, retentionSeconds: 3600 };
  const stale = normalizeHapnRvStatus(statusPayload({ sendTime: "2026-10-10T11:30:00Z" }), options);
  assert.equal(stale.available, true);
  assert.equal(stale.stale, true);
  const expired = normalizeHapnRvStatus(statusPayload({ sendTime: "2026-10-10T10:00:00Z" }), options);
  assert.deepEqual(expired, { available: false });
});

test("failure retains the last valid projection only until retention expiry", async () => {
  await publicHapnRvStatus({ env, fetchImpl: successfulFetch(), now });
  const failedFetch = async () => { throw new Error("fixture failure"); };
  const retained = await publicHapnRvStatus({ env, fetchImpl: failedFetch, now: new Date("2026-10-10T12:20:00Z") });
  assert.equal(retained.available, true);
  assert.equal(retained.stale, true);
  const expired = await publicHapnRvStatus({ env, fetchImpl: failedFetch, now: new Date("2026-10-10T19:00:01Z") });
  assert.deepEqual(expired, { available: false });
});

test("oversized, wrong-content-type, malformed JSON and redirect responses are rejected", async () => {
  const cases = [
    async (url) => String(url).includes("oauth2/token") ? tokenResponse() : new Response("x".repeat(HAPN_STATUS_RESPONSE_MAX_BYTES + 1), { headers: { "Content-Type": "application/json" } }),
    async (url) => String(url).includes("oauth2/token") ? tokenResponse() : statusResponse({}, { contentType: "text/plain" }),
    async (url) => String(url).includes("oauth2/token") ? tokenResponse() : new Response("{not-json", { headers: { "Content-Type": "application/json" } }),
    async (url, options) => {
      if (String(url).includes("oauth2/token")) return tokenResponse();
      assert.equal(options.redirect, "error");
      return new Response("", { status: 302, headers: { Location: "https://unapproved.example/status" } });
    },
  ];
  for (const fetchImpl of cases) {
    resetHapnTokenCacheForTests();
    assert.deepEqual(await publicHapnRvStatus({ env, fetchImpl, now }), { available: false });
  }
});

test("the cPanel public endpoint is GET-only, same-origin and generic", async () => {
  const response = await handleHapnPublicRequest(
    new Request("https://goodwingoodge.com/api/strava/public/tracking-status"),
    env,
    { fetchImpl: successfulFetch(), now: () => now },
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
  assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
  assert.ok(Number(response.headers.get("content-length") || 0) < 32 * 1024 || (await response.clone().text()).length < 32 * 1024);
  const body = await response.json();
  assert.deepEqual(Object.keys(body), ["available", "stale", "observedAt", "position"]);

  for (const method of ["POST", "OPTIONS", "HEAD"]) {
    const rejected = await handleHapnPublicRequest(
      new Request("https://goodwingoodge.com/api/strava/public/tracking-status", { method }), env,
    );
    assert.equal(rejected.status, 405);
    assert.equal(rejected.headers.get("allow"), "GET");
  }
});

test("the cPanel public endpoint has proportionate per-process abuse protection", async () => {
  const limiter = createHapnPublicRateLimiter({ limit: 1, now: () => 1_000 });
  const options = { fetchImpl: successfulFetch(), now: () => now, rateLimiter: limiter, clientAddress: "fixture" };
  assert.equal((await handleHapnPublicRequest(new Request("https://goodwingoodge.com/api/strava/public/tracking-status"), env, options)).status, 200);
  const limited = await handleHapnPublicRequest(new Request("https://goodwingoodge.com/api/strava/public/tracking-status"), env, options);
  assert.equal(limited.status, 429);
  assert.deepEqual(await limited.json(), { error: "rate_limited" });
});
