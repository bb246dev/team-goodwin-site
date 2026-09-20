export const PUBLIC_RACES_ENDPOINT = "/strava/public/races";
export const PUBLIC_RACE_STATUS_ENDPOINT = "/strava/public/race-status";
export const PUBLIC_RV_LOCATION_ENDPOINT = "/strava/public/tracking-status";
export const EXPECTED_RACE_COUNT = 50;
export const RV_REFRESH_MS = 30_000;
export const WILL_REFRESH_MS = 45_000;
export const MAX_BACKOFF_MS = 300_000;
export const REQUEST_TIMEOUT_MS = 5_000;
export const WILL_FRESH_MS = 10 * 60_000;

const WINDOW_ID = "ggma-2026";
const WINDOW_START = "2026-10-09T09:00:00-04:00";
const WINDOW_END = "2026-11-01T23:59:59-05:00";

function exactKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function safeText(value, maximum) {
  return typeof value === "string" && value.length > 0 && value.length <= maximum ? value : null;
}

function safeNumber(value) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function safeCoordinatePair(value) {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const latitude = Number(value[0]);
  const longitude = Number(value[1]);
  return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 && latitude !== 0
    && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180 && longitude !== 0
    ? [latitude, longitude]
    : null;
}

function normalizeActivity(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const stravaActivityId = safeText(value.stravaActivityId, 20);
  const startTime = safeText(value.startTime, 40);
  if (!stravaActivityId || !/^\d+$/.test(stravaActivityId)
    || !startTime || !Number.isFinite(Date.parse(startTime))) return null;
  const summaryPolyline = value.summaryPolyline === null || value.summaryPolyline === undefined
    ? null
    : safeText(value.summaryPolyline, 65_535);
  if (summaryPolyline !== null && !/^[\x3F-\x7E]+$/.test(summaryPolyline)) return null;
  return {
    stravaActivityId,
    startTime,
    distanceMeters: safeNumber(value.distanceMeters),
    movingTimeSeconds: safeNumber(value.movingTimeSeconds),
    elapsedTimeSeconds: safeNumber(value.elapsedTimeSeconds),
    elevationGainMeters: safeNumber(value.elevationGainMeters),
    summaryPolyline,
    startLatLng: safeCoordinatePair(value.startLatLng),
    endLatLng: safeCoordinatePair(value.endLatLng),
  };
}

function expectedRaceId(raceNumber) {
  return `${WINDOW_ID}-${String(raceNumber).padStart(2, "0")}`;
}

function normalizePublicRaces(payload, staticStops) {
  if (!payload || !Array.isArray(payload.races) || payload.races.length !== EXPECTED_RACE_COUNT
    || !Array.isArray(staticStops) || staticStops.length !== EXPECTED_RACE_COUNT) {
    throw new Error("invalid_public_race_schedule");
  }
  const seen = new Set();
  return payload.races.map((value, index) => {
    const raceNumber = Number(value?.raceNumber);
    const raceId = safeText(value?.raceId, 64);
    const date = safeText(value?.date, 10);
    const state = safeText(value?.state, 64);
    const city = safeText(value?.city, 128);
    if (!value || typeof value !== "object" || Array.isArray(value)
      || !Number.isInteger(raceNumber) || raceNumber !== index + 1
      || !raceId || seen.has(raceId) || raceId !== expectedRaceId(raceNumber)
      || !date || !/^2026-\d{2}-\d{2}$/.test(date)
      || !state || !city || !["scheduled", "completed"].includes(value.status)) {
      throw new Error("invalid_public_race_schedule");
    }
    seen.add(raceId);
    const activity = value.activity === undefined ? null : normalizeActivity(value.activity);
    if (value.status === "completed" && !activity) throw new Error("invalid_public_race_schedule");
    if (value.status === "scheduled" && value.activity !== undefined) throw new Error("invalid_public_race_schedule");
    return {
      ...staticStops[index], raceNumber, raceId, date, state, city,
      status: value.status, activity,
    };
  });
}

function normalizePublicStatus(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)
    || typeof payload.active !== "boolean"
    || payload.raceWindowId !== WINDOW_ID
    || payload.raceWindowStart !== WINDOW_START
    || payload.raceWindowEnd !== WINDOW_END
    || !Number.isInteger(payload.completedRaces) || payload.completedRaces < 0
    || payload.completedRaces > EXPECTED_RACE_COUNT
    || payload.totalRaces !== EXPECTED_RACE_COUNT) {
    throw new Error("invalid_public_race_status");
  }
  return {
    active: payload.active,
    raceWindowId: payload.raceWindowId,
    raceWindowStart: payload.raceWindowStart,
    raceWindowEnd: payload.raceWindowEnd,
    completedRaces: payload.completedRaces,
    totalRaces: payload.totalRaces,
  };
}

async function fetchJson(endpoint, { fetchImpl, signal }) {
  const response = await fetchImpl(endpoint, {
    headers: { Accept: "application/json", "Cache-Control": "no-cache", Pragma: "no-cache" },
    credentials: "omit",
    cache: "no-store",
    signal,
  });
  if (!response?.ok) throw new Error("public_feed_request_failed");
  const contentType = response.headers?.get?.("content-type") || "";
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) throw new Error("public_feed_content_type");
  const length = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(length) && length > 96 * 1024) throw new Error("public_feed_too_large");
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > 128 * 1024) throw new Error("public_feed_too_large");
  return JSON.parse(text);
}

export async function loadPublicRaceSnapshot({
  staticStops,
  fetchImpl = globalThis.fetch,
  timeoutMs = REQUEST_TIMEOUT_MS,
  setTimeoutImpl = globalThis.setTimeout,
  clearTimeoutImpl = globalThis.clearTimeout,
} = {}) {
  const controller = new AbortController();
  const timeout = setTimeoutImpl(() => controller.abort(), timeoutMs);
  try {
    const [racePayload, statusPayload] = await Promise.all([
      fetchJson(PUBLIC_RACES_ENDPOINT, { fetchImpl, signal: controller.signal }),
      fetchJson(PUBLIC_RACE_STATUS_ENDPOINT, { fetchImpl, signal: controller.signal }),
    ]);
    const races = normalizePublicRaces(racePayload, staticStops);
    const status = normalizePublicStatus(statusPayload);
    if (races.filter((race) => race.status === "completed").length !== status.completedRaces) {
      throw new Error("public_race_count_mismatch");
    }
    return { source: "api", races, status };
  } finally {
    clearTimeoutImpl(timeout);
  }
}

export function normalizePublicRvLocation(value, { nowMs = Date.now() } = {}) {
  if (exactKeys(value, ["available"]) && value.available === false) return { available: false };
  if (!exactKeys(value, ["available", "stale", "observedAt", "position"])
    || value.available !== true || typeof value.stale !== "boolean"
    || typeof value.observedAt !== "string" || !Number.isFinite(Date.parse(value.observedAt))
    || !exactKeys(value.position, ["lat", "lng"])) {
    throw new Error("invalid_rv_location");
  }
  const lat = Number(value.position.lat);
  const lng = Number(value.position.lng);
  const observedMs = Date.parse(value.observedAt);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || lat === 0
    || !Number.isFinite(lng) || lng < -180 || lng > 180 || lng === 0
    || observedMs > nowMs + 5 * 60_000) throw new Error("invalid_rv_location");
  return { available: true, stale: value.stale, observedAt: new Date(observedMs).toISOString(), position: { lat, lng } };
}

export async function loadPublicRvLocation({
  fetchImpl = globalThis.fetch,
  timeoutMs = REQUEST_TIMEOUT_MS,
  setTimeoutImpl = globalThis.setTimeout,
  clearTimeoutImpl = globalThis.clearTimeout,
} = {}) {
  const controller = new AbortController();
  const timeout = setTimeoutImpl(() => controller.abort(), timeoutMs);
  try {
    const payload = await fetchJson(PUBLIC_RV_LOCATION_ENDPOINT, { fetchImpl, signal: controller.signal });
    return normalizePublicRvLocation(payload);
  } finally {
    clearTimeoutImpl(timeout);
  }
}

export function decodeSummaryPolyline(encoded) {
  if (typeof encoded !== "string" || !encoded) return [];
  const coordinates = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;
  const decodeValue = () => {
    let result = 0;
    let shift = 0;
    while (index < encoded.length) {
      const byte = encoded.charCodeAt(index++) - 63;
      if (byte < 0 || byte > 63 || shift > 30) return null;
      result |= (byte & 0x1f) << shift;
      shift += 5;
      if (byte < 0x20) return result & 1 ? ~(result >> 1) : result >> 1;
    }
    return null;
  };
  while (index < encoded.length) {
    const latitudeDelta = decodeValue();
    const longitudeDelta = decodeValue();
    if (latitudeDelta === null || longitudeDelta === null) return [];
    latitude += latitudeDelta;
    longitude += longitudeDelta;
    const point = [latitude / 1e5, longitude / 1e5];
    if (!safeCoordinatePair(point)) return [];
    coordinates.push(point);
  }
  return coordinates;
}

export function deriveWillLocation(snapshot, { nowMs = Date.now(), freshMs = WILL_FRESH_MS } = {}) {
  if (snapshot?.source !== "api" || !Array.isArray(snapshot.races)) return { available: false };
  const candidates = snapshot.races.flatMap((race) => {
    const activity = race.activity;
    if (!activity) return [];
    const elapsedSeconds = activity.elapsedTimeSeconds ?? activity.movingTimeSeconds ?? 0;
    const observedMs = Date.parse(activity.startTime) + elapsedSeconds * 1000;
    const polyline = decodeSummaryPolyline(activity.summaryPolyline);
    const coordinate = activity.endLatLng || polyline.at(-1) || activity.startLatLng;
    if (!Number.isFinite(observedMs) || !safeCoordinatePair(coordinate) || observedMs > nowMs + 5 * 60_000) return [];
    return [{ observedMs, position: { lat: coordinate[0], lng: coordinate[1] } }];
  }).sort((left, right) => right.observedMs - left.observedMs);
  const latest = candidates[0];
  if (!latest) return { available: false };
  return {
    available: true,
    stale: nowMs - latest.observedMs > freshMs,
    observedAt: new Date(latest.observedMs).toISOString(),
    position: latest.position,
  };
}

export function createAdaptivePoller({
  load,
  onData,
  onFailure,
  intervalMs,
  maxBackoffMs = MAX_BACKOFF_MS,
  documentObject = globalThis.document,
  windowObject = globalThis.window,
  setTimeoutImpl = globalThis.setTimeout,
  clearTimeoutImpl = globalThis.clearTimeout,
} = {}) {
  let timer = null;
  let inFlight = null;
  let stopped = true;
  let failures = 0;
  const clearTimer = () => {
    if (timer !== null) clearTimeoutImpl(timer);
    timer = null;
  };
  const enabled = () => !stopped && !documentObject?.hidden;
  const nextDelay = () => Math.min(maxBackoffMs, intervalMs * (2 ** failures));
  const schedule = () => {
    clearTimer();
    if (enabled()) timer = setTimeoutImpl(() => { void refresh(); }, nextDelay());
  };
  const refresh = () => {
    if (!enabled()) return Promise.resolve(null);
    if (inFlight) return inFlight;
    inFlight = Promise.resolve().then(load).then((result) => {
      failures = 0;
      onData(result);
      return result;
    }).catch((error) => {
      failures = Math.min(failures + 1, 16);
      onFailure(error);
      return null;
    }).finally(() => {
      inFlight = null;
      schedule();
    });
    return inFlight;
  };
  const refreshWhenUsable = () => {
    clearTimer();
    if (enabled()) void refresh();
  };
  documentObject?.addEventListener?.("visibilitychange", refreshWhenUsable);
  windowObject?.addEventListener?.("online", refreshWhenUsable);
  return {
    start() {
      if (!stopped) return inFlight || Promise.resolve(null);
      stopped = false;
      failures = 0;
      return refresh();
    },
    refresh,
    stop() { stopped = true; clearTimer(); },
    destroy() {
      stopped = true;
      clearTimer();
      documentObject?.removeEventListener?.("visibilitychange", refreshWhenUsable);
      windowObject?.removeEventListener?.("online", refreshWhenUsable);
    },
    getConsecutiveFailures: () => failures,
  };
}
