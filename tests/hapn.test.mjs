import assert from "node:assert/strict";
import test from "node:test";
import {
  HapnError,
  hapnConfiguration,
  normalizeHapnRvStatus,
  publicHapnRvStatus,
  resetHapnTokenCacheForTests,
} from "../integrations/hapn/hapn-tracking-core.mjs";
import { trackingStatusFromUrl } from "../api/tracking-status.mjs";

const env = {
  HAPN_CLIENT_ID: "hapn-test-client",
  HAPN_CLIENT_SECRET: "hapn-test-secret",
  HAPN_DEVICE_IMEI: "868239050345326",
  HAPN_STALE_AFTER_SECONDS: "900",
};

function tokenResponse(accessToken = "test-access-token") {
  return Response.json({ access_token: accessToken, token_type: "Bearer", expires_in: 3600 });
}

function statusResponse(overrides = {}) {
  return Response.json({
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
      address: "A private street address",
      appUrl: "https://app.gethapn.com/private-device-link",
      ...overrides,
    },
  });
}

test.beforeEach(() => resetHapnTokenCacheForTests());

test("Hapn OAuth and device status are normalized into the public RV contract", async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    return calls.length === 1 ? tokenResponse() : statusResponse();
  };

  const result = await publicHapnRvStatus({
    env,
    fetchImpl,
    now: new Date("2026-10-10T12:05:00.000Z"),
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "https://auth.usehapn.com/oauth2/token");
  assert.equal(calls[0].options.method, "POST");
  assert.deepEqual(Object.fromEntries(calls[0].options.body), {
    grant_type: "client_credentials",
    client_id: env.HAPN_CLIENT_ID,
    client_secret: env.HAPN_CLIENT_SECRET,
  });
  assert.equal(calls[1].url, `https://api.iotgps.io/v1/devices/${env.HAPN_DEVICE_IMEI}/status`);
  assert.equal(calls[1].options.headers.Authorization, "Bearer test-access-token");
  assert.deepEqual(result, {
    source: "hapn",
    configured: true,
    active: true,
    stale: false,
    updatedAt: "2026-10-10T12:00:00.000Z",
    lat: 40.831,
    lng: -74.117,
  });
  assert.doesNotMatch(JSON.stringify(result), new RegExp(env.HAPN_DEVICE_IMEI));
  assert.doesNotMatch(JSON.stringify(result), /private street address|private-device-link/i);
});

test("Hapn access tokens are reused while valid", async () => {
  let authRequests = 0;
  let statusRequests = 0;
  const fetchImpl = async (url) => {
    if (String(url).includes("oauth2/token")) {
      authRequests += 1;
      return tokenResponse();
    }
    statusRequests += 1;
    return statusResponse();
  };

  await publicHapnRvStatus({ env, fetchImpl, now: new Date("2026-10-10T12:05:00.000Z") });
  await publicHapnRvStatus({ env, fetchImpl, now: new Date("2026-10-10T12:06:00.000Z") });
  assert.equal(authRequests, 1);
  assert.equal(statusRequests, 2);
});

test("concurrent RV reads coalesce into one Hapn status request", async () => {
  let authRequests = 0;
  let statusRequests = 0;
  const fetchImpl = async (url) => {
    if (String(url).includes("oauth2/token")) {
      authRequests += 1;
      return tokenResponse();
    }
    statusRequests += 1;
    return statusResponse();
  };

  const options = { env, fetchImpl, now: new Date("2026-10-10T12:05:00.000Z") };
  const [first, second] = await Promise.all([
    publicHapnRvStatus(options),
    publicHapnRvStatus(options),
  ]);
  assert.deepEqual(first, second);
  assert.equal(authRequests, 1);
  assert.equal(statusRequests, 1);
});

test("a rejected Hapn bearer token is refreshed once", async () => {
  const authorizations = [];
  let authRequests = 0;
  const fetchImpl = async (url, options = {}) => {
    if (String(url).includes("oauth2/token")) {
      authRequests += 1;
      return tokenResponse(`token-${authRequests}`);
    }
    authorizations.push(options.headers.Authorization);
    return authorizations.length === 1
      ? Response.json({ success: false, message: "Unauthorized" }, { status: 401 })
      : statusResponse();
  };

  const result = await publicHapnRvStatus({ env, fetchImpl, now: new Date("2026-10-10T12:05:00.000Z") });
  assert.equal(result.active, true);
  assert.equal(authRequests, 2);
  assert.deepEqual(authorizations, ["Bearer token-1", "Bearer token-2"]);
});

test("unconfigured Hapn tracking stays inactive without making a request", async () => {
  const result = await publicHapnRvStatus({
    env: {},
    fetchImpl: async () => assert.fail("fetch should not be called"),
  });
  assert.deepEqual(result, { source: "hapn", configured: false, active: false });
});

test("partial or invalid Hapn configuration is rejected safely", () => {
  assert.throws(() => hapnConfiguration({ HAPN_CLIENT_ID: "only-one-value" }), {
    code: "hapn_not_configured",
  });
  assert.throws(() => hapnConfiguration({ ...env, HAPN_DEVICE_IMEI: "not-an-imei" }), {
    code: "hapn_not_configured",
  });
  assert.throws(() => hapnConfiguration({ ...env, HAPN_STALE_AFTER_SECONDS: "10" }), {
    code: "hapn_invalid_stale_window",
  });
  assert.throws(() => hapnConfiguration({ ...env, HAPN_PUBLIC_COORDINATE_DECIMALS: "6" }), {
    code: "hapn_invalid_coordinate_precision",
  });
});

test("invalid or old Hapn status data is detected", () => {
  assert.throws(() => normalizeHapnRvStatus({ success: true, result: { latitude: 91, longitude: 0 } }), HapnError);
  const stale = normalizeHapnRvStatus(
    {
      success: true,
      result: {
        latitude: "40.830864",
        longitude: "-74.117069",
        sendTime: "2026-10-10T11:00:00.000Z",
      },
    },
    { now: new Date("2026-10-10T12:00:00.000Z"), staleAfterSeconds: 900 },
  );
  assert.equal(stale.stale, true);
});

test("the public tracking endpoint adds only the normalized Hapn RV status", async () => {
  const fetchImpl = async (url) => String(url).includes("oauth2/token")
    ? tokenResponse()
    : statusResponse();
  const result = await trackingStatusFromUrl(
    "https://goodwingoodge.com/api/tracking-status?progress=0.5&now=2026-10-10T12:05:00Z",
    env,
    fetchImpl,
  );

  assert.equal(result.progress, 0.5);
  assert.deepEqual(result.rvStatus, {
    source: "hapn",
    configured: true,
    active: true,
    stale: false,
    updatedAt: "2026-10-10T12:00:00.000Z",
    lat: 40.831,
    lng: -74.117,
  });
  assert.doesNotMatch(JSON.stringify(result), /hapn-test-secret|868239050345326|private street address|private-device-link/i);
});

test("the public tracking endpoint fails safely when Hapn is unavailable", async () => {
  const result = await trackingStatusFromUrl(
    "https://goodwingoodge.com/api/tracking-status",
    env,
    async () => { throw new Error("test-only upstream failure"); },
  );
  assert.deepEqual(result.rvStatus, {
    source: "hapn",
    configured: true,
    active: false,
    unavailable: true,
  });
});
