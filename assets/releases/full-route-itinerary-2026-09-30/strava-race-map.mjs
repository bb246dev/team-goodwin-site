export const PUBLIC_RACES_ENDPOINT = "/strava/public/races";
export const PUBLIC_RACE_STATUS_ENDPOINT = "/strava/public/race-status";
export const PUBLIC_RV_LOCATION_ENDPOINT = "/strava/public/tracking-status";
export const EXPECTED_RACE_COUNT = 50;
export const ACTIVE_REFRESH_MS = 45_000;
export const PUBLIC_RACE_REQUEST_TIMEOUT_MS = 5_000;
export const HAPN_REFRESH_MS = 120_000;
export const HAPN_PUBLIC_REQUEST_TIMEOUT_MS = 5_000;

const WINDOW_ID = "ggma-2026";
const WINDOW_START = "2026-10-09T09:00:00-04:00";
const WINDOW_END = "2026-11-01T23:59:59-05:00";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ROUTE_ITINERARY_OVERRIDES = Object.freeze({
  "ggma-2026-18": { date: "2026-10-18", state: "Iowa", city: "Decorah" },
  "ggma-2026-19": { date: "2026-10-18", state: "Minnesota", city: "Eitzen" },
  "ggma-2026-23": { date: "2026-10-20", state: "Michigan", city: "Sturgis" },
  "ggma-2026-25": { date: "2026-10-20", state: "California", city: "Los Angeles" },
  "ggma-2026-26": { date: "2026-10-21", state: "Nevada", city: "Las Vegas" },
  "ggma-2026-27": { date: "2026-10-21", state: "Arizona", city: "Willow Beach / Hoover Dam" },
  "ggma-2026-41": { date: "2026-10-27", state: "Delaware", city: "Glasgow" },
  "ggma-2026-43": { date: "2026-10-28", state: "New Jersey", city: "Teterboro" },
  "ggma-2026-45": { date: "2026-10-29", state: "Rhode Island", city: "Providence" },
});

// Main-site display overrides only. Local airport times use explicit October
// offsets so their absolute instants do not depend on the viewer's timezone.
export const STATIC_AIRPORT_PLACEMENTS = Object.freeze([
  Object.freeze({ subject: "will", airportCode: "HNL", label: "Honolulu airport", start: "2026-10-09T21:11:00-10:00", end: "2026-10-09T23:00:00-10:00", position: Object.freeze({ lat: 21.3187, lng: -157.9225 }) }),
  Object.freeze({ subject: "will", airportCode: "ANC", label: "Anchorage airport", start: "2026-10-10T14:00:00-08:00", end: "2026-10-10T15:51:00-08:00", position: Object.freeze({ lat: 61.1743, lng: -149.9985 }) }),
  Object.freeze({ subject: "rv", airportCode: "PDX", label: "Portland airport", start: "2026-10-11T04:00:00-07:00", end: "2026-10-11T08:00:00-07:00", position: Object.freeze({ lat: 45.5898, lng: -122.5951 }) }),
  Object.freeze({ subject: "will", airportCode: "PDX", label: "Portland airport", start: "2026-10-11T13:00:00-07:00", end: "2026-10-11T17:00:00-07:00", position: Object.freeze({ lat: 45.5898, lng: -122.5951 }) }),
]);

const STATIC_AIRPORT_BOUNDARIES = Object.freeze([...new Set(
  STATIC_AIRPORT_PLACEMENTS.flatMap((placement) => [Date.parse(placement.start), Date.parse(placement.end)]),
)].sort((left, right) => left - right));

export function scheduledAirportPlacementAt(subject, nowMs = Date.now()) {
  const placement = STATIC_AIRPORT_PLACEMENTS.find((entry) => entry.subject === subject
    && nowMs >= Date.parse(entry.start) && nowMs < Date.parse(entry.end));
  return placement ? {
    subject: placement.subject,
    airportCode: placement.airportCode,
    label: placement.label,
    start: placement.start,
    end: placement.end,
    position: { ...placement.position },
  } : null;
}

export function scheduledAirportPlacementsAt(nowMs = Date.now()) {
  return {
    will: scheduledAirportPlacementAt("will", nowMs),
    rv: scheduledAirportPlacementAt("rv", nowMs),
  };
}

export function createStaticAirportPlacementScheduler({
  onTransition = () => {},
  now = Date.now,
  setTimeoutImpl = globalThis.setTimeout,
  clearTimeoutImpl = globalThis.clearTimeout,
  documentObject = globalThis.document,
} = {}) {
  let timer = null;
  let stopped = true;
  const clearTimer = () => {
    if (timer !== null) clearTimeoutImpl(timer);
    timer = null;
  };
  const schedule = () => {
    clearTimer();
    if (stopped) return;
    const current = Number(now());
    const nextBoundary = STATIC_AIRPORT_BOUNDARIES.find((boundary) => boundary > current);
    if (!Number.isFinite(nextBoundary)) return;
    timer = setTimeoutImpl(() => {
      timer = null;
      if (stopped) return;
      onTransition(Number(now()));
      schedule();
    }, Math.max(0, nextBoundary - current));
  };
  const visibilityChange = () => {
    if (stopped || documentObject?.hidden) return;
    onTransition(Number(now()));
    schedule();
  };
  documentObject?.addEventListener?.("visibilitychange", visibilityChange);
  return {
    start() {
      if (!stopped) return;
      stopped = false;
      schedule();
    },
    stop() {
      stopped = true;
      clearTimer();
    },
    destroy() {
      stopped = true;
      clearTimer();
      documentObject?.removeEventListener?.("visibilitychange", visibilityChange);
    },
  };
}

function expectedRaceId(raceNumber) {
  return `${WINDOW_ID}-${String(raceNumber).padStart(2, "0")}`;
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
  return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180
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

function normalizePublicRaces(payload) {
  if (!payload || !Array.isArray(payload.races) || payload.races.length !== EXPECTED_RACE_COUNT) {
    throw new Error("invalid_public_race_schedule");
  }
  const seenIds = new Set();
  return payload.races.map((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("invalid_public_race_schedule");
    }
    const raceNumber = Number(value.raceNumber);
    const raceId = safeText(value.raceId, 64);
    const date = safeText(value.date, 10);
    const state = safeText(value.state, 64);
    const city = safeText(value.city, 128);
    if (!Number.isInteger(raceNumber) || raceNumber !== index + 1
      || !raceId || seenIds.has(raceId) || raceId !== expectedRaceId(raceNumber)
      || !date || !/^2026-\d{2}-\d{2}$/.test(date)
      || !state || !city || !["scheduled", "completed"].includes(value.status)) {
      throw new Error("invalid_public_race_schedule");
    }
    seenIds.add(raceId);
    const activity = value.activity === undefined ? null : normalizeActivity(value.activity);
    if (value.status === "completed" && !activity) throw new Error("invalid_public_race_schedule");
    if (value.status === "scheduled" && value.activity !== undefined) throw new Error("invalid_public_race_schedule");
    return { raceNumber, raceId, date, state, city, status: value.status, activity };
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

function displayDate(value, fallback) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
  if (!match) return fallback;
  const month = MONTHS[Number(match[2]) - 1];
  return month ? `${month} ${Number(match[3])}` : fallback;
}

export function joinPublicRaces(staticStops, publicRaces) {
  const byId = new Map(publicRaces.map((race) => [race.raceId, race]));
  const byNumber = new Map(publicRaces.map((race) => [race.raceNumber, race]));
  return staticStops.map((stop) => {
    const raceId = stop.raceId || expectedRaceId(stop.n);
    const race = byId.get(raceId) || byNumber.get(stop.n);
    if (!race) throw new Error("invalid_public_race_join");
    const routeOverride = ROUTE_ITINERARY_OVERRIDES[race.raceId];
    const routeDate = routeOverride?.date || race.date;
    return {
      ...stop,
      n: race.raceNumber,
      raceId: race.raceId,
      state: routeOverride?.state || race.state,
      city: routeOverride?.city || race.city,
      date: displayDate(routeDate, stop.date),
      isoDate: routeDate,
      status: race.status,
      activity: race.activity,
    };
  });
}

export function staticRaceSnapshot(staticStops) {
  return {
    source: "static",
    races: staticStops.map((stop) => ({
      ...stop,
      raceId: stop.raceId || expectedRaceId(stop.n),
      status: "scheduled",
      activity: null,
    })),
    status: {
      active: false,
      raceWindowId: WINDOW_ID,
      raceWindowStart: WINDOW_START,
      raceWindowEnd: WINDOW_END,
      completedRaces: 0,
      totalRaces: EXPECTED_RACE_COUNT,
    },
  };
}

async function fetchJson(fetchImpl, endpoint, signal) {
  const response = await fetchImpl(endpoint, {
    headers: { Accept: "application/json" },
    credentials: "omit",
    signal,
  });
  if (!response?.ok) throw new Error("public_race_request_failed");
  return response.json();
}

export async function loadPublicRaceSnapshot({
  staticStops,
  fetchImpl = globalThis.fetch,
  timeoutMs = PUBLIC_RACE_REQUEST_TIMEOUT_MS,
  setTimeoutImpl = globalThis.setTimeout,
  clearTimeoutImpl = globalThis.clearTimeout,
  warn = () => console.warn("Public race data unavailable; using the static schedule."),
} = {}) {
  const fallback = staticRaceSnapshot(staticStops || []);
  if (typeof fetchImpl !== "function" || fallback.races.length !== EXPECTED_RACE_COUNT) return fallback;
  const controller = new AbortController();
  const timeout = setTimeoutImpl(() => controller.abort(), timeoutMs);
  try {
    const [racePayload, statusPayload] = await Promise.all([
      fetchJson(fetchImpl, PUBLIC_RACES_ENDPOINT, controller.signal),
      fetchJson(fetchImpl, PUBLIC_RACE_STATUS_ENDPOINT, controller.signal),
    ]);
    const publicRaces = normalizePublicRaces(racePayload);
    const status = normalizePublicStatus(statusPayload);
    const completed = publicRaces.filter((race) => race.status === "completed").length;
    if (completed !== status.completedRaces) throw new Error("public_race_count_mismatch");
    return { source: "api", races: joinPublicRaces(staticStops, publicRaces), status };
  } catch {
    warn();
    return fallback;
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

export function createPublicRacePoller({
  load,
  onSnapshot,
  onFailure = () => {},
  documentObject = globalThis.document,
  setTimeoutImpl = globalThis.setTimeout,
  clearTimeoutImpl = globalThis.clearTimeout,
  intervalMs = ACTIVE_REFRESH_MS,
} = {}) {
  let timer = null;
  let inFlight = null;
  let stopped = false;
  let lastGoodSnapshot = null;

  const clearTimer = () => {
    if (timer !== null) clearTimeoutImpl(timer);
    timer = null;
  };
  const schedule = () => {
    clearTimer();
    if (stopped || !lastGoodSnapshot?.status.active || documentObject?.hidden) return;
    timer = setTimeoutImpl(() => { void refresh(); }, intervalMs);
  };
  const refresh = () => {
    if (stopped) return Promise.resolve(null);
    if (inFlight) return inFlight;
    inFlight = Promise.resolve().then(load).then((snapshot) => {
      if (snapshot?.source === "api") {
        lastGoodSnapshot = snapshot;
        onSnapshot(snapshot);
      } else {
        onFailure();
      }
      return snapshot;
    }).finally(() => {
      inFlight = null;
      schedule();
    });
    return inFlight;
  };
  const visibilityChange = () => {
    clearTimer();
    if (!documentObject?.hidden && lastGoodSnapshot?.status.active) void refresh();
  };
  documentObject?.addEventListener?.("visibilitychange", visibilityChange);

  return {
    start(initialSnapshot = null) {
      if (initialSnapshot?.source === "api") {
        lastGoodSnapshot = initialSnapshot;
        schedule();
        return Promise.resolve(initialSnapshot);
      }
      return refresh();
    },
    refresh,
    stop() {
      stopped = true;
      clearTimer();
      documentObject?.removeEventListener?.("visibilitychange", visibilityChange);
    },
  };
}

function exactKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

export function normalizePublicRvLocation(value, { nowMs = Date.now() } = {}) {
  if (exactKeys(value, ["available"]) && value.available === false) return { available: false };
  if (!exactKeys(value, ["available", "stale", "observedAt", "position"])
    || value.available !== true
    || typeof value.stale !== "boolean"
    || typeof value.observedAt !== "string"
    || !Number.isFinite(Date.parse(value.observedAt))
    || !exactKeys(value.position, ["lat", "lng"])) {
    throw new Error("invalid_rv_location");
  }
  const lat = Number(value.position.lat);
  const lng = Number(value.position.lng);
  const observedMs = Date.parse(value.observedAt);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || lat === 0
    || !Number.isFinite(lng) || lng < -180 || lng > 180 || lng === 0
    || observedMs > nowMs + 5 * 60 * 1_000) {
    throw new Error("invalid_rv_location");
  }
  return {
    available: true,
    stale: value.stale,
    observedAt: new Date(observedMs).toISOString(),
    position: { lat, lng },
  };
}

async function fetchRvLocation(fetchImpl, signal) {
  const response = await fetchImpl(PUBLIC_RV_LOCATION_ENDPOINT, {
    headers: { Accept: "application/json" },
    credentials: "omit",
    signal,
  });
  if (!response?.ok) throw new Error("rv_location_request_failed");
  const contentType = response.headers?.get?.("content-type") || "";
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) throw new Error("rv_location_content_type");
  const length = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(length) && length > 32 * 1024) throw new Error("rv_location_too_large");
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > 64 * 1024) throw new Error("rv_location_too_large");
  return normalizePublicRvLocation(JSON.parse(text));
}

export async function loadPublicRvLocation({
  fetchImpl = globalThis.fetch,
  timeoutMs = HAPN_PUBLIC_REQUEST_TIMEOUT_MS,
  setTimeoutImpl = globalThis.setTimeout,
  clearTimeoutImpl = globalThis.clearTimeout,
} = {}) {
  const controller = new AbortController();
  const timeout = setTimeoutImpl(() => controller.abort(), timeoutMs);
  try {
    return await fetchRvLocation(fetchImpl, controller.signal);
  } finally {
    clearTimeoutImpl(timeout);
  }
}

export function hapnLivePositioningEnabled(raceStatus, nowMs = Date.now()) {
  return Boolean(raceStatus?.source === "api"
    && raceStatus.active === true
    && raceStatus.raceWindowId === WINDOW_ID
    && raceStatus.raceWindowStart === WINDOW_START
    && raceStatus.raceWindowEnd === WINDOW_END
    && nowMs >= Date.parse(WINDOW_START)
    && nowMs <= Date.parse(WINDOW_END));
}

export function createPublicRvPoller({
  load,
  onPosition,
  onStale,
  onFallback,
  isEnabled,
  documentObject = globalThis.document,
  setTimeoutImpl = globalThis.setTimeout,
  clearTimeoutImpl = globalThis.clearTimeout,
  intervalMs = HAPN_REFRESH_MS,
} = {}) {
  let timer = null;
  let inFlight = null;
  let stopped = true;
  const enabled = () => !stopped && !documentObject?.hidden && isEnabled?.() === true;
  const clearTimer = () => {
    if (timer !== null) clearTimeoutImpl(timer);
    timer = null;
  };
  const schedule = () => {
    clearTimer();
    if (enabled()) timer = setTimeoutImpl(() => { void refresh(); }, intervalMs);
  };
  const refresh = () => {
    if (!enabled()) {
      if (!stopped && !documentObject?.hidden && isEnabled?.() !== true) onFallback();
      return Promise.resolve(null);
    }
    if (inFlight) return inFlight;
    inFlight = Promise.resolve().then(load).then((result) => {
      if (enabled() && result?.available === true && result.stale === false) onPosition(result.position, result);
      else if (enabled() && result?.available === true && result.stale === true && onStale) onStale(result);
      else onFallback();
      return result;
    }).catch(() => {
      onFallback();
      return null;
    }).finally(() => {
      inFlight = null;
      schedule();
    });
    return inFlight;
  };
  const visibilityChange = () => {
    clearTimer();
    if (enabled()) void refresh();
    else if (!stopped && isEnabled?.() !== true) onFallback();
  };
  documentObject?.addEventListener?.("visibilitychange", visibilityChange);
  return {
    start() {
      if (!stopped) return inFlight || Promise.resolve(null);
      stopped = false;
      return refresh();
    },
    refresh,
    stop() {
      stopped = true;
      clearTimer();
    },
    destroy() {
      stopped = true;
      clearTimer();
      documentObject?.removeEventListener?.("visibilitychange", visibilityChange);
    },
  };
}
