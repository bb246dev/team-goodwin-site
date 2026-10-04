import { FLIGHT_LEGS } from "../config/flight-legs.mjs";
import {
  TRACKING_SOURCE_WINDOWS,
  validateTrackingSourceWindows,
} from "../config/tracking-sources.mjs";
import { createFlightStateCache } from "./flightaware/cache.mjs";
import { createUnavailableFlightState } from "./flightaware/normalize.mjs";

export function selectTrackingSourceAt({
  at = new Date(),
  windows = TRACKING_SOURCE_WINDOWS,
  flightLegs = FLIGHT_LEGS,
} = {}) {
  const atMs = at instanceof Date ? at.getTime() : new Date(at).getTime();
  if (!Number.isFinite(atMs)) return Object.freeze({ source: "strava", flightLegId: null });
  const validated = validateTrackingSourceWindows(windows, flightLegs);
  const active = validated.find((window) => atMs >= Date.parse(window.startsAt) && atMs < Date.parse(window.endsAt));
  return active
    ? Object.freeze({ source: active.source, flightLegId: active.flightLegId })
    : Object.freeze({ source: "strava", flightLegId: null });
}

function publicTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}

export function publicFlightProjection(state, { stale = false, cachedAt = null } = {}) {
  const exposePosition = state.trackingAvailable === true && !stale;
  return Object.freeze({
    legId: state.legId,
    ident: state.ident,
    origin: state.origin,
    destination: state.destination,
    status: state.status,
    scheduledDeparture: state.scheduledDeparture,
    actualDeparture: state.actualDeparture,
    scheduledArrival: state.scheduledArrival,
    estimatedArrival: state.estimatedArrival,
    actualArrival: state.actualArrival,
    trackingAvailable: exposePosition,
    stale: stale || state.trackingAvailability === "stale",
    position: exposePosition ? {
      lat: state.latitude,
      lng: state.longitude,
      altitude: state.altitude,
      groundspeed: state.groundspeed,
      track: state.track,
      observedAt: state.lastPositionTimestamp,
    } : null,
    updatedAt: publicTimestamp(cachedAt),
  });
}

export async function buildPublicTrackingOverlay({
  at = new Date(),
  windows = TRACKING_SOURCE_WINDOWS,
  flightLegs = FLIGHT_LEGS,
  store,
} = {}) {
  const selected = selectTrackingSourceAt({ at, windows, flightLegs });
  if (selected.source === "strava") return null;
  if (selected.source === "manual" || selected.source === "none") {
    return Object.freeze({ trackingSource: selected.source });
  }

  const leg = flightLegs.find((candidate) => candidate.id === selected.flightLegId);
  if (!leg) return Object.freeze({ trackingSource: "flightaware" });
  let cached = null;
  try {
    if (store?.getFlightTrackingState) {
      cached = await createFlightStateCache({
        store,
        now: () => at instanceof Date ? at.getTime() : new Date(at).getTime(),
      }).read(leg.id);
    }
  } catch {
    cached = null;
  }
  const state = cached?.state || createUnavailableFlightState(leg, {
    availability: leg.type === "private" && !leg.registration && !leg.faFlightId
      ? "registration_pending" : "unavailable",
    status: "scheduled",
  });
  return Object.freeze({
    trackingSource: "flightaware",
    flight: publicFlightProjection(state, cached || {}),
  });
}
