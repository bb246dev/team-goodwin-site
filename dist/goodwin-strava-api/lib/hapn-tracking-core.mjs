const HAPN_AUTH_URL = "https://auth.usehapn.com/oauth2/token";
const HAPN_API_ORIGIN = "https://api.iotgps.io";
const HAPN_API_BASE_URL = `${HAPN_API_ORIGIN}/v1`;
export const HAPN_REQUEST_TIMEOUT_MS = 5_000;
export const HAPN_AUTH_RESPONSE_MAX_BYTES = 16 * 1024;
export const HAPN_STATUS_RESPONSE_MAX_BYTES = 32 * 1024;
const DEFAULT_STALE_AFTER_SECONDS = 15 * 60;
const DEFAULT_RETENTION_SECONDS = 6 * 60 * 60;
const DEFAULT_PUBLIC_COORDINATE_DECIMALS = 3;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1_000;
const TOKEN_EXPIRY_SKEW_MS = 60_000;
const STATUS_CACHE_MS = 60_000;
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

let hapnTokenCache = null;
let hapnTokenRequest = null;
let hapnStatusCache = null;
let hapnStatusRequest = null;
let hapnLastGoodStatus = null;

export class HapnError extends Error {
  constructor(code, status = 503) {
    super(code);
    this.name = "HapnError";
    this.code = code;
    this.status = status;
  }
}

function configuredValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function environmentValue(env, name) {
  const supplied = env?.[name];
  if (configuredValue(supplied)) return supplied.trim();
  const processValue = typeof process !== "undefined" ? process.env?.[name] : undefined;
  return configuredValue(processValue) ? processValue.trim() : "";
}

function integerSetting(env, name, fallback, minimum, maximum, errorCode) {
  const raw = environmentValue(env, name);
  const parsed = raw ? Number(raw) : fallback;
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) throw new HapnError(errorCode);
  return parsed;
}

export function hapnConfiguration(env = {}) {
  const clientId = environmentValue(env, "HAPN_CLIENT_ID");
  const clientSecret = environmentValue(env, "HAPN_CLIENT_SECRET");
  const imei = environmentValue(env, "HAPN_DEVICE_IMEI");
  const configuredCount = [clientId, clientSecret, imei].filter(Boolean).length;
  if (configuredCount === 0) return null;
  if (configuredCount !== 3 || !/^\d{14,17}$/.test(imei)) throw new HapnError("hapn_not_configured");

  const staleAfterSeconds = integerSetting(
    env, "HAPN_STALE_AFTER_SECONDS", DEFAULT_STALE_AFTER_SECONDS, 60, 86_400, "hapn_invalid_stale_window",
  );
  const retentionSeconds = integerSetting(
    env, "HAPN_RETENTION_SECONDS", DEFAULT_RETENTION_SECONDS,
    staleAfterSeconds, 7 * 86_400, "hapn_invalid_retention_window",
  );
  const publicCoordinateDecimals = integerSetting(
    env, "HAPN_PUBLIC_COORDINATE_DECIMALS", DEFAULT_PUBLIC_COORDINATE_DECIMALS,
    2, 5, "hapn_invalid_coordinate_precision",
  );
  return { clientId, clientSecret, imei, staleAfterSeconds, retentionSeconds, publicCoordinateDecimals };
}

function requestSignal() {
  return typeof globalThis.AbortSignal?.timeout === "function"
    ? globalThis.AbortSignal.timeout(HAPN_REQUEST_TIMEOUT_MS)
    : undefined;
}

function isJsonContentType(value) {
  return /^application\/(?:[a-z0-9!#$&^_.+-]+\+)?json(?:\s*;|$)/i.test(value || "");
}

async function boundedJson(response, errorCode, maximumBytes) {
  if (!response?.ok) throw new HapnError(errorCode, response?.status === 429 ? 429 : 503);
  if (!isJsonContentType(response.headers?.get?.("content-type"))) throw new HapnError(`${errorCode}_content_type`);
  const declared = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(declared) && declared > maximumBytes) throw new HapnError(`${errorCode}_too_large`);
  if (!response.body?.getReader) throw new HapnError(errorCode);

  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximumBytes) throw new HapnError(`${errorCode}_too_large`);
      chunks.push(value);
    }
  } finally {
    if (size > maximumBytes) await reader.cancel().catch(() => {});
  }
  try {
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    if (error instanceof HapnError) throw error;
    throw new HapnError(errorCode);
  }
}

async function fetchFixed(fetchImpl, url, options, errorCode) {
  const parsed = new URL(url);
  const allowed = parsed.href === HAPN_AUTH_URL
    || (parsed.origin === HAPN_API_ORIGIN && /^\/v1\/devices\/\d{14,17}\/status$/.test(parsed.pathname));
  if (!allowed || parsed.protocol !== "https:") throw new HapnError("hapn_upstream_not_allowed");
  try {
    return await fetchImpl(parsed.href, { ...options, redirect: "error", signal: requestSignal() });
  } catch {
    throw new HapnError(errorCode);
  }
}

function exactObject(value, allowedKeys, requiredKeys = allowedKeys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return requiredKeys.every((key) => Object.hasOwn(value, key)) && keys.every((key) => allowedKeys.includes(key));
}

async function requestAccessToken(config, fetchImpl, nowMs, forceRefresh = false) {
  if (!forceRefresh && hapnTokenCache?.clientId === config.clientId && hapnTokenCache.expiresAt > nowMs + TOKEN_EXPIRY_SKEW_MS) {
    return hapnTokenCache.accessToken;
  }
  if (!forceRefresh && hapnTokenRequest?.clientId === config.clientId) return hapnTokenRequest.promise;

  const promise = (async () => {
    const response = await fetchFixed(fetchImpl, HAPN_AUTH_URL, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials", client_id: config.clientId, client_secret: config.clientSecret,
      }),
    }, "hapn_auth_unavailable");
    const payload = await boundedJson(response, "hapn_auth_failed", HAPN_AUTH_RESPONSE_MAX_BYTES);
    if (!exactObject(payload, ["access_token", "token_type", "expires_in", "scope"], ["access_token", "expires_in"])) {
      throw new HapnError("hapn_invalid_auth_response");
    }
    const accessToken = typeof payload.access_token === "string" && payload.access_token.length <= 4096
      ? payload.access_token : "";
    const expiresIn = Number(payload.expires_in);
    if (!accessToken || !Number.isFinite(expiresIn) || expiresIn <= 0 || expiresIn > 86_400) {
      throw new HapnError("hapn_invalid_auth_response");
    }
    hapnTokenCache = { clientId: config.clientId, accessToken, expiresAt: nowMs + expiresIn * 1_000 };
    return accessToken;
  })();
  hapnTokenRequest = { clientId: config.clientId, promise };
  try { return await promise; } finally {
    if (hapnTokenRequest?.promise === promise) hapnTokenRequest = null;
  }
}

async function requestDeviceStatus(config, accessToken, fetchImpl) {
  const url = `${HAPN_API_BASE_URL}/devices/${encodeURIComponent(config.imei)}/status`;
  return fetchFixed(fetchImpl, url, {
    headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}` },
  }, "hapn_api_unavailable");
}

function finiteNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > 64
    || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function gpsTime(value) {
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(String(value || ""));
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function statusTimestamp(status) {
  const candidates = [status.sendTime, status.created, status.updatedAt, status.lastUpdate, gpsTime(status.gpsUTCTime)];
  const value = candidates.find((candidate) => candidate !== null && candidate !== undefined && candidate !== "");
  if (typeof value !== "string" || value.length > 64) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function normalizeHapnRvStatus(payload, {
  expectedImei,
  now = new Date(),
  staleAfterSeconds = DEFAULT_STALE_AFTER_SECONDS,
  retentionSeconds = DEFAULT_RETENTION_SECONDS,
  publicCoordinateDecimals = DEFAULT_PUBLIC_COORDINATE_DECIMALS,
} = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)
    || !Object.hasOwn(payload, "success") || payload.success !== true
    || !Object.hasOwn(payload, "result") || !payload.result
    || typeof payload.result !== "object" || Array.isArray(payload.result)
    || !Object.hasOwn(payload.result, "imei")
    || !Object.hasOwn(payload.result, "latitude")
    || !Object.hasOwn(payload.result, "longitude")) {
    throw new HapnError("hapn_invalid_status_response");
  }
  const status = payload.result;
  if (typeof status.imei !== "string" || !/^\d{14,17}$/.test(status.imei)
    || !expectedImei || status.imei !== String(expectedImei)) throw new HapnError("hapn_device_mismatch");
  const lat = finiteNumber(status.latitude);
  const lng = finiteNumber(status.longitude);
  if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new HapnError("hapn_invalid_coordinates");
  }
  const observedAt = statusTimestamp(status);
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const observedMs = observedAt ? new Date(observedAt).getTime() : NaN;
  if (!Number.isFinite(nowMs) || !Number.isFinite(observedMs)) throw new HapnError("hapn_invalid_timestamp");
  if (observedMs > nowMs + MAX_FUTURE_SKEW_MS) throw new HapnError("hapn_future_timestamp");
  const ageMs = Math.max(0, nowMs - observedMs);
  if (ageMs > retentionSeconds * 1_000) return { available: false };
  return {
    available: true,
    stale: ageMs > staleAfterSeconds * 1_000,
    observedAt,
    position: {
      lat: Number(lat.toFixed(publicCoordinateDecimals)),
      lng: Number(lng.toFixed(publicCoordinateDecimals)),
    },
  };
}

function retainedStatus(config, nowMs) {
  if (!hapnLastGoodStatus || hapnLastGoodStatus.key !== `${config.clientId}:${config.imei}`) return { available: false };
  const observedMs = Date.parse(hapnLastGoodStatus.status.observedAt);
  if (!Number.isFinite(observedMs) || nowMs - observedMs > config.retentionSeconds * 1_000) return { available: false };
  return { ...hapnLastGoodStatus.status, stale: true };
}

export async function publicHapnRvStatus({ env = {}, fetchImpl = fetch, now = new Date() } = {}) {
  const config = hapnConfiguration(env);
  if (!config) return { available: false };
  const parsedNowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const nowMs = Number.isFinite(parsedNowMs) ? parsedNowMs : Date.now();
  const cacheKey = `${config.clientId}:${config.imei}`;
  if (hapnStatusCache?.key === cacheKey && hapnStatusCache.expiresAt > nowMs) return hapnStatusCache.status;
  if (hapnStatusRequest?.key === cacheKey) return hapnStatusRequest.promise;

  const promise = (async () => {
    try {
      const token = await requestAccessToken(config, fetchImpl, nowMs);
      let response = await requestDeviceStatus(config, token, fetchImpl);
      if (response.status === 401) {
        hapnTokenCache = null;
        const refreshedToken = await requestAccessToken(config, fetchImpl, nowMs, true);
        response = await requestDeviceStatus(config, refreshedToken, fetchImpl);
      } else if (RETRYABLE_STATUS.has(response.status)) {
        response = await requestDeviceStatus(config, token, fetchImpl);
      }
      const payload = await boundedJson(response, "hapn_status_failed", HAPN_STATUS_RESPONSE_MAX_BYTES);
      const status = normalizeHapnRvStatus(payload, {
        expectedImei: config.imei,
        now,
        staleAfterSeconds: config.staleAfterSeconds,
        retentionSeconds: config.retentionSeconds,
        publicCoordinateDecimals: config.publicCoordinateDecimals,
      });
      if (status.available) hapnLastGoodStatus = { key: cacheKey, status };
      hapnStatusCache = { key: cacheKey, status, expiresAt: nowMs + STATUS_CACHE_MS };
      return status;
    } catch {
      return retainedStatus(config, nowMs);
    }
  })();
  hapnStatusRequest = { key: cacheKey, promise };
  try { return await promise; } finally {
    if (hapnStatusRequest?.promise === promise) hapnStatusRequest = null;
  }
}

export function resetHapnTokenCacheForTests() {
  hapnTokenCache = null;
  hapnTokenRequest = null;
  hapnStatusCache = null;
  hapnStatusRequest = null;
  hapnLastGoodStatus = null;
}
