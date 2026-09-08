const HAPN_AUTH_URL = "https://auth.usehapn.com/oauth2/token";
const HAPN_API_ORIGIN = "https://api.iotgps.io";
const HAPN_API_BASE_URL = `${HAPN_API_ORIGIN}/v1`;
const HAPN_REQUEST_TIMEOUT_MS = 5_000;
const DEFAULT_STALE_AFTER_SECONDS = 15 * 60;
const DEFAULT_PUBLIC_COORDINATE_DECIMALS = 3;
const TOKEN_EXPIRY_SKEW_MS = 60_000;
const STATUS_CACHE_MS = 60_000;

let hapnTokenCache = null;
let hapnTokenRequest = null;
let hapnStatusCache = null;
let hapnStatusRequest = null;

export class HapnError extends Error {
  constructor(code, status = 503) {
    super(code);
    this.name = "HapnError";
    this.code = code;
    this.status = status;
  }
}

function hapnConfiguredValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function hapnEnvironmentValue(env, name) {
  const supplied = env?.[name];
  if (hapnConfiguredValue(supplied)) return supplied.trim();
  const processValue = typeof process !== "undefined" ? process.env?.[name] : undefined;
  return hapnConfiguredValue(processValue) ? processValue.trim() : "";
}

export function hapnConfiguration(env = {}) {
  const clientId = hapnEnvironmentValue(env, "HAPN_CLIENT_ID");
  const clientSecret = hapnEnvironmentValue(env, "HAPN_CLIENT_SECRET");
  const imei = hapnEnvironmentValue(env, "HAPN_DEVICE_IMEI");
  const configuredCount = [clientId, clientSecret, imei].filter(Boolean).length;

  if (configuredCount === 0) return null;
  if (configuredCount !== 3 || !/^\d{14,17}$/.test(imei)) {
    throw new HapnError("hapn_not_configured");
  }

  const staleAfterRaw = hapnEnvironmentValue(env, "HAPN_STALE_AFTER_SECONDS");
  const staleAfterSeconds = staleAfterRaw ? Number(staleAfterRaw) : DEFAULT_STALE_AFTER_SECONDS;
  if (!Number.isInteger(staleAfterSeconds) || staleAfterSeconds < 60 || staleAfterSeconds > 86_400) {
    throw new HapnError("hapn_invalid_stale_window");
  }

  const publicCoordinateDecimalsRaw = hapnEnvironmentValue(env, "HAPN_PUBLIC_COORDINATE_DECIMALS");
  const publicCoordinateDecimals = publicCoordinateDecimalsRaw
    ? Number(publicCoordinateDecimalsRaw)
    : DEFAULT_PUBLIC_COORDINATE_DECIMALS;
  if (!Number.isInteger(publicCoordinateDecimals) || publicCoordinateDecimals < 2 || publicCoordinateDecimals > 5) {
    throw new HapnError("hapn_invalid_coordinate_precision");
  }

  return { clientId, clientSecret, imei, staleAfterSeconds, publicCoordinateDecimals };
}

function hapnRequestSignal() {
  return typeof globalThis.AbortSignal?.timeout === "function"
    ? globalThis.AbortSignal.timeout(HAPN_REQUEST_TIMEOUT_MS)
    : undefined;
}

async function hapnJson(response, errorCode) {
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new HapnError(errorCode);
  }
  if (!response.ok) throw new HapnError(errorCode, response.status === 429 ? 429 : 503);
  return payload;
}

async function requestHapnAccessToken(config, fetchImpl, nowMs, forceRefresh = false) {
  if (!forceRefresh && hapnTokenCache?.clientId === config.clientId && hapnTokenCache.expiresAt > nowMs + TOKEN_EXPIRY_SKEW_MS) {
    return hapnTokenCache.accessToken;
  }

  if (!forceRefresh && hapnTokenRequest?.clientId === config.clientId) return hapnTokenRequest.promise;

  const promise = (async () => {
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: config.clientId,
      client_secret: config.clientSecret,
    });
    let response;
    try {
      response = await fetchImpl(HAPN_AUTH_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
        signal: hapnRequestSignal(),
      });
    } catch {
      throw new HapnError("hapn_auth_unavailable");
    }

    const payload = await hapnJson(response, "hapn_auth_failed");
    const accessToken = typeof payload?.access_token === "string" ? payload.access_token : "";
    const expiresIn = Number(payload?.expires_in);
    if (!accessToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
      throw new HapnError("hapn_invalid_auth_response");
    }

    hapnTokenCache = {
      clientId: config.clientId,
      accessToken,
      expiresAt: nowMs + expiresIn * 1_000,
    };
    return accessToken;
  })();

  hapnTokenRequest = { clientId: config.clientId, promise };
  try {
    return await promise;
  } finally {
    if (hapnTokenRequest?.promise === promise) hapnTokenRequest = null;
  }
}

async function requestHapnDeviceStatus(config, accessToken, fetchImpl) {
  const url = `${HAPN_API_BASE_URL}/devices/${encodeURIComponent(config.imei)}/status`;
  let response;
  try {
    response = await fetchImpl(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      signal: hapnRequestSignal(),
    });
  } catch {
    throw new HapnError("hapn_api_unavailable");
  }
  return response;
}

function hapnNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function hapnGpsTime(value) {
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(String(value || ""));
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const time = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
  return Number.isNaN(time.getTime()) ? null : time.toISOString();
}

function hapnTimestamp(status) {
  for (const value of [status?.sendTime, status?.created, hapnGpsTime(status?.gpsUTCTime)]) {
    if (!value) continue;
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return null;
}

export function normalizeHapnRvStatus(payload, {
  now = new Date(),
  staleAfterSeconds = DEFAULT_STALE_AFTER_SECONDS,
  publicCoordinateDecimals = DEFAULT_PUBLIC_COORDINATE_DECIMALS,
} = {}) {
  const status = payload?.result;
  const lat = hapnNumber(status?.latitude);
  const lng = hapnNumber(status?.longitude);
  if (!payload?.success || !status || lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new HapnError("hapn_invalid_status_response");
  }

  const updatedAt = hapnTimestamp(status);
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const updatedMs = updatedAt ? new Date(updatedAt).getTime() : NaN;
  const stale = !Number.isFinite(updatedMs) || !Number.isFinite(nowMs)
    || Math.max(0, nowMs - updatedMs) > staleAfterSeconds * 1_000;

  return {
    source: "hapn",
    configured: true,
    active: true,
    stale,
    updatedAt,
    lat: Number(lat.toFixed(publicCoordinateDecimals)),
    lng: Number(lng.toFixed(publicCoordinateDecimals)),
  };
}

export async function publicHapnRvStatus({ env = {}, fetchImpl = fetch, now = new Date() } = {}) {
  const config = hapnConfiguration(env);
  if (!config) return { source: "hapn", configured: false, active: false };
  const parsedNowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const nowMs = Number.isFinite(parsedNowMs) ? parsedNowMs : Date.now();
  const cacheKey = `${config.clientId}:${config.imei}`;
  if (hapnStatusCache?.key === cacheKey && hapnStatusCache.expiresAt > nowMs) return hapnStatusCache.status;
  if (hapnStatusRequest?.key === cacheKey) return hapnStatusRequest.promise;

  const promise = (async () => {
    const token = await requestHapnAccessToken(config, fetchImpl, nowMs);
    let response = await requestHapnDeviceStatus(config, token, fetchImpl);

    if (response.status === 401) {
      hapnTokenCache = null;
      const refreshedToken = await requestHapnAccessToken(config, fetchImpl, nowMs, true);
      response = await requestHapnDeviceStatus(config, refreshedToken, fetchImpl);
    }

    const payload = await hapnJson(response, "hapn_status_failed");
    const status = normalizeHapnRvStatus(payload, {
      now,
      staleAfterSeconds: config.staleAfterSeconds,
      publicCoordinateDecimals: config.publicCoordinateDecimals,
    });
    hapnStatusCache = { key: cacheKey, status, expiresAt: nowMs + STATUS_CACHE_MS };
    return status;
  })();

  hapnStatusRequest = { key: cacheKey, promise };
  try {
    return await promise;
  } finally {
    if (hapnStatusRequest?.promise === promise) hapnStatusRequest = null;
  }
}

export function unavailableHapnRvStatus(configured = true) {
  return {
    source: "hapn",
    configured,
    active: false,
    unavailable: configured,
  };
}

export function resetHapnTokenCacheForTests() {
  hapnTokenCache = null;
  hapnTokenRequest = null;
  hapnStatusCache = null;
  hapnStatusRequest = null;
}
