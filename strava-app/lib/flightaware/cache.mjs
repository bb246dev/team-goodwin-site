import {
  createUnavailableFlightState,
  validateNormalizedFlightState,
} from "./normalize.mjs";

export const FLIGHT_REFRESH_INTERVALS_MS = Object.freeze({
  scheduledDistant: 6 * 60 * 60 * 1_000,
  approachingDeparture: 15 * 60 * 1_000,
  airborne: 2 * 60 * 1_000,
  completed: 24 * 60 * 60 * 1_000,
  unavailable: 30 * 60 * 1_000,
});
export const FLIGHT_CACHE_RETENTION_MS = 24 * 60 * 60 * 1_000;
const APPROACHING_DEPARTURE_MS = 6 * 60 * 60 * 1_000;

function currentMilliseconds(now) {
  const value = typeof now === "function" ? now() : now;
  const milliseconds = value instanceof Date ? value.getTime() : Number(value);
  if (!Number.isFinite(milliseconds)) throw new Error("invalid_flight_cache_clock");
  return milliseconds;
}

export function flightRefreshIntervalMs(state, nowMs = Date.now()) {
  if (["landed", "cancelled", "diverted"].includes(state?.status)) {
    return FLIGHT_REFRESH_INTERVALS_MS.completed;
  }
  if (["departed", "en_route"].includes(state?.status)) {
    return FLIGHT_REFRESH_INTERVALS_MS.airborne;
  }
  const departure = state?.scheduledDeparture ? Date.parse(state.scheduledDeparture) : NaN;
  if (Number.isFinite(departure) && departure >= nowMs && departure - nowMs <= APPROACHING_DEPARTURE_MS) {
    return FLIGHT_REFRESH_INTERVALS_MS.approachingDeparture;
  }
  if (state?.status === "scheduled" || state?.status === "pre_departure") {
    return FLIGHT_REFRESH_INTERVALS_MS.scheduledDistant;
  }
  return FLIGHT_REFRESH_INTERVALS_MS.unavailable;
}

function validateCacheEntry(entry, expectedLegId) {
  if (!entry || typeof entry !== "object" || entry.legId !== expectedLegId
    || entry.provider !== "flightaware"
    || !Number.isSafeInteger(entry.freshUntil) || !Number.isSafeInteger(entry.retainUntil)
    || !Number.isSafeInteger(entry.updatedAt)
    || entry.freshUntil > entry.retainUntil) return null;
  try {
    const state = validateNormalizedFlightState(entry.state);
    if (state.legId !== expectedLegId) return null;
    return { ...entry, state };
  } catch {
    return null;
  }
}

export function createFlightStateCache({ store, now = Date.now } = {}) {
  if (!store || typeof store.getFlightTrackingState !== "function") {
    throw new Error("flight_cache_storage_unavailable");
  }
  const inFlight = new Map();

  async function read(legId) {
    let entry;
    try {
      entry = validateCacheEntry(await store.getFlightTrackingState(legId), legId);
    } catch {
      return null;
    }
    if (!entry) return null;
    const nowMs = currentMilliseconds(now);
    if (nowMs > entry.retainUntil * 1_000) return null;
    return Object.freeze({
      state: entry.state,
      stale: nowMs > entry.freshUntil * 1_000,
      cachedAt: new Date(entry.updatedAt * 1_000).toISOString(),
    });
  }

  async function write(state) {
    if (typeof store.saveFlightTrackingState !== "function") {
      throw new Error("flight_cache_storage_unavailable");
    }
    const validated = validateNormalizedFlightState(state);
    const nowMs = currentMilliseconds(now);
    const interval = flightRefreshIntervalMs(validated, nowMs);
    const entry = {
      legId: validated.legId,
      provider: "flightaware",
      state: validated,
      freshUntil: Math.floor((nowMs + interval) / 1_000),
      retainUntil: Math.floor((nowMs + Math.max(interval, FLIGHT_CACHE_RETENTION_MS)) / 1_000),
      updatedAt: Math.floor(nowMs / 1_000),
    };
    await store.saveFlightTrackingState(entry);
    return Object.freeze({ state: validated, stale: false, cachedAt: new Date(nowMs).toISOString() });
  }

  async function refresh(leg, service) {
    const cached = await read(leg.id);
    if (cached && !cached.stale) return cached;
    if (!service?.enabled || typeof service.retrieveFlightState !== "function") {
      return cached || Object.freeze({
        state: createUnavailableFlightState(leg, { availability: "not_configured" }),
        stale: false,
        cachedAt: null,
      });
    }
    if (inFlight.has(leg.id)) return inFlight.get(leg.id);
    const request = (async () => {
      try {
        const state = await service.retrieveFlightState(leg);
        return await write(state);
      } catch {
        return cached || Object.freeze({
          state: createUnavailableFlightState(leg),
          stale: false,
          cachedAt: null,
        });
      }
    })();
    inFlight.set(leg.id, request);
    try {
      return await request;
    } finally {
      if (inFlight.get(leg.id) === request) inFlight.delete(leg.id);
    }
  }

  return Object.freeze({ read, write, refresh });
}
