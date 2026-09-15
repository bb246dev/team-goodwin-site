export const NORMALIZED_FLIGHT_SCHEMA_VERSION = 1;
export const NORMALIZED_FLIGHT_STATUSES = Object.freeze([
  "scheduled",
  "pre_departure",
  "departed",
  "en_route",
  "landed",
  "cancelled",
  "diverted",
  "unknown",
]);
export const FLIGHT_TRACKING_AVAILABILITY = Object.freeze([
  "available",
  "unavailable",
  "stale",
  "not_configured",
  "registration_pending",
  "flight_not_found",
]);
export const DEFAULT_FLIGHT_POSITION_STALE_AFTER_MS = 10 * 60 * 1_000;
const MAX_FUTURE_POSITION_SKEW_MS = 5 * 60 * 1_000;
const STATUS_SET = new Set(NORMALIZED_FLIGHT_STATUSES);
const AVAILABILITY_SET = new Set(FLIGHT_TRACKING_AVAILABILITY);

export class FlightNormalizationError extends Error {
  constructor(code) {
    super(code);
    this.name = "FlightNormalizationError";
    this.code = code;
  }
}

function nullableText(value, maximum = 256) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new FlightNormalizationError("invalid_flight_text");
  }
  return value;
}

function nullableIdentifier(value, maximum = 256) {
  const normalized = nullableText(value, maximum);
  if (normalized !== null && !/^[A-Za-z0-9._-]+$/.test(normalized)) {
    throw new FlightNormalizationError("invalid_flight_identifier");
  }
  return normalized;
}

function nullableTimestamp(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.length > 64 || !Number.isFinite(Date.parse(value))) {
    throw new FlightNormalizationError("invalid_flight_timestamp");
  }
  return new Date(value).toISOString();
}

function nullableNumber(value, minimum, maximum, code) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw new FlightNormalizationError(code);
  }
  return number;
}

function airportCode(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new FlightNormalizationError("invalid_flight_airport");
  }
  const candidates = [value.code_icao, value.code_iata, value.code_lid, value.code];
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined || candidate === "") continue;
    if (typeof candidate !== "string" || !/^[A-Za-z0-9]{3,7}$/.test(candidate)) {
      throw new FlightNormalizationError("invalid_flight_airport");
    }
    return candidate.toUpperCase();
  }
  return fallback;
}

function providerBoolean(value, name) {
  if (value === null || value === undefined) return false;
  if (typeof value !== "boolean") throw new FlightNormalizationError(`invalid_flight_${name}`);
  return value;
}

function providerStatus(flight) {
  const raw = nullableText(flight.status, 256)?.toLowerCase() || "";
  if (providerBoolean(flight.cancelled, "cancelled") || raw.includes("cancel")) return "cancelled";
  if (providerBoolean(flight.diverted, "diverted") || raw.includes("divert")) return "diverted";
  return raw;
}

function normalizedStatus(flight, { nowMs, scheduledDeparture, actualDeparture, actualArrival, hasPosition }) {
  const status = providerStatus(flight);
  if (status === "cancelled" || status === "diverted") return status;
  if (actualArrival || /\b(?:arrived|landed)\b/.test(status)) return "landed";
  if (actualDeparture) {
    if (hasPosition || /\b(?:en\s*route|airborne|in\s*flight)\b/.test(status)) return "en_route";
    return "departed";
  }
  if (/\bdeparted\b/.test(status)) return "departed";
  if (/\b(?:en\s*route|airborne|in\s*flight)\b/.test(status)) return "en_route";
  const departureMs = scheduledDeparture ? Date.parse(scheduledDeparture) : NaN;
  if (Number.isFinite(departureMs)) {
    return departureMs - nowMs <= 6 * 60 * 60 * 1_000 && departureMs >= nowMs
      ? "pre_departure" : "scheduled";
  }
  if (/\b(?:scheduled|filed|estimated|delayed|taxi)\b/.test(status)) return "scheduled";
  return "unknown";
}

function positionFromPayload(flight, positionPayload) {
  if (positionPayload !== null && positionPayload !== undefined
    && (typeof positionPayload !== "object" || Array.isArray(positionPayload))) {
    throw new FlightNormalizationError("invalid_flight_position");
  }
  const position = positionPayload?.last_position ?? positionPayload?.position
    ?? flight.last_position ?? null;
  if (position === null || position === undefined) return null;
  if (typeof position !== "object" || Array.isArray(position)) {
    throw new FlightNormalizationError("invalid_flight_position");
  }
  const latitude = nullableNumber(position.latitude, -90, 90, "invalid_flight_latitude");
  const longitude = nullableNumber(position.longitude, -180, 180, "invalid_flight_longitude");
  if ((latitude === null) !== (longitude === null)) {
    throw new FlightNormalizationError("invalid_flight_coordinates");
  }
  const altitudeHundredsFeet = nullableNumber(position.altitude, -20, 1_000, "invalid_flight_altitude");
  return {
    latitude,
    longitude,
    altitude: altitudeHundredsFeet === null ? null : altitudeHundredsFeet * 100,
    groundspeed: nullableNumber(position.groundspeed, 0, 2_000, "invalid_flight_groundspeed"),
    track: nullableNumber(position.heading, 0, 360, "invalid_flight_track"),
    timestamp: nullableTimestamp(position.timestamp),
  };
}

function baseState(leg) {
  return {
    schemaVersion: NORMALIZED_FLIGHT_SCHEMA_VERSION,
    legId: leg.id,
    provider: "flightaware",
    ident: leg.ident,
    registration: leg.registration,
    faFlightId: leg.faFlightId,
    origin: leg.origin,
    destination: leg.destination,
    status: "unknown",
    scheduledDeparture: leg.scheduledDeparture,
    actualDeparture: null,
    scheduledArrival: null,
    estimatedArrival: null,
    actualArrival: null,
    latitude: null,
    longitude: null,
    altitude: null,
    groundspeed: null,
    track: null,
    lastPositionTimestamp: null,
    lastProviderUpdate: null,
    trackingAvailable: false,
    trackingAvailability: "unavailable",
  };
}

export function createUnavailableFlightState(leg, {
  availability = "unavailable",
  status = "unknown",
} = {}) {
  if (!AVAILABILITY_SET.has(availability) || !STATUS_SET.has(status)) {
    throw new FlightNormalizationError("invalid_unavailable_flight_state");
  }
  return Object.freeze({ ...baseState(leg), status, trackingAvailability: availability });
}

export function normalizeFlightAwareFlight({
  leg,
  flight,
  positionPayload = null,
  now = new Date(),
  staleAfterMs = DEFAULT_FLIGHT_POSITION_STALE_AFTER_MS,
} = {}) {
  if (!leg || typeof leg !== "object" || !flight || typeof flight !== "object" || Array.isArray(flight)) {
    throw new FlightNormalizationError("invalid_flight_response");
  }
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(nowMs) || !Number.isFinite(staleAfterMs) || staleAfterMs < 1_000) {
    throw new FlightNormalizationError("invalid_flight_normalization_clock");
  }
  const position = positionFromPayload(flight, positionPayload);
  const scheduledDeparture = nullableTimestamp(flight.scheduled_out ?? flight.scheduled_off)
    || leg.scheduledDeparture;
  const actualDeparture = nullableTimestamp(flight.actual_out ?? flight.actual_off);
  const scheduledArrival = nullableTimestamp(flight.scheduled_in ?? flight.scheduled_on);
  const estimatedArrival = nullableTimestamp(flight.estimated_in ?? flight.estimated_on);
  const actualArrival = nullableTimestamp(flight.actual_in ?? flight.actual_on);
  const hasCoordinates = position?.latitude !== null && position?.longitude !== null;
  const observedMs = position?.timestamp ? Date.parse(position.timestamp) : NaN;
  if (Number.isFinite(observedMs) && observedMs > nowMs + MAX_FUTURE_POSITION_SKEW_MS) {
    throw new FlightNormalizationError("flight_position_in_future");
  }
  const positionStale = hasCoordinates && Number.isFinite(observedMs)
    ? nowMs - observedMs > staleAfterMs
    : false;
  const trackingAvailable = Boolean(hasCoordinates && Number.isFinite(observedMs) && !positionStale);
  const trackingAvailability = trackingAvailable ? "available"
    : positionStale ? "stale" : "unavailable";

  const state = {
    ...baseState(leg),
    ident: nullableIdentifier(flight.ident_icao ?? flight.ident_iata ?? flight.ident) || leg.ident,
    registration: nullableIdentifier(flight.registration) || leg.registration,
    faFlightId: nullableIdentifier(flight.fa_flight_id) || leg.faFlightId,
    origin: airportCode(flight.origin, leg.origin),
    destination: airportCode(flight.destination, leg.destination),
    status: normalizedStatus(flight, {
      nowMs,
      scheduledDeparture,
      actualDeparture,
      actualArrival,
      hasPosition: hasCoordinates,
    }),
    scheduledDeparture,
    actualDeparture,
    scheduledArrival,
    estimatedArrival,
    actualArrival,
    latitude: position?.latitude ?? null,
    longitude: position?.longitude ?? null,
    altitude: position?.altitude ?? null,
    groundspeed: position?.groundspeed ?? null,
    track: position?.track ?? null,
    lastPositionTimestamp: position?.timestamp ?? null,
    lastProviderUpdate: position?.timestamp ?? null,
    trackingAvailable,
    trackingAvailability,
  };
  return validateNormalizedFlightState(state);
}

export function validateNormalizedFlightState(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)
    || state.schemaVersion !== NORMALIZED_FLIGHT_SCHEMA_VERSION
    || state.provider !== "flightaware"
    || typeof state.legId !== "string" || !/^[a-z0-9][a-z0-9-]{0,95}$/.test(state.legId)
    || !STATUS_SET.has(state.status)
    || !AVAILABILITY_SET.has(state.trackingAvailability)
    || typeof state.trackingAvailable !== "boolean"
    || state.trackingAvailable !== (state.trackingAvailability === "available")) {
    throw new FlightNormalizationError("invalid_normalized_flight_state");
  }
  for (const key of [
    "ident", "registration", "faFlightId", "origin", "destination", "scheduledDeparture",
    "actualDeparture", "scheduledArrival", "estimatedArrival", "actualArrival",
    "lastPositionTimestamp", "lastProviderUpdate",
  ]) {
    if (state[key] !== null && typeof state[key] !== "string") {
      throw new FlightNormalizationError("invalid_normalized_flight_state");
    }
  }
  for (const key of ["ident", "registration", "faFlightId"]) {
    if (state[key] !== null && (state[key].length > 256 || !/^[A-Za-z0-9._-]+$/.test(state[key]))) {
      throw new FlightNormalizationError("invalid_normalized_flight_state");
    }
  }
  for (const key of ["origin", "destination"]) {
    if (typeof state[key] !== "string" || !/^[A-Z0-9]{3,7}$/.test(state[key])) {
      throw new FlightNormalizationError("invalid_normalized_flight_state");
    }
  }
  for (const key of ["scheduledDeparture", "actualDeparture", "scheduledArrival", "estimatedArrival", "actualArrival", "lastPositionTimestamp", "lastProviderUpdate"]) {
    if (state[key] !== null && !Number.isFinite(Date.parse(state[key]))) {
      throw new FlightNormalizationError("invalid_normalized_flight_state");
    }
  }
  for (const [key, minimum, maximum] of [
    ["latitude", -90, 90],
    ["longitude", -180, 180],
    ["altitude", -2_000, 100_000],
    ["groundspeed", 0, 2_000],
    ["track", 0, 360],
  ]) {
    const value = state[key];
    if (value !== null && (!Number.isFinite(value) || value < minimum || value > maximum)) {
      throw new FlightNormalizationError("invalid_normalized_flight_state");
    }
  }
  if ((state.latitude === null) !== (state.longitude === null)) {
    throw new FlightNormalizationError("invalid_normalized_flight_state");
  }
  return Object.freeze({ ...state });
}
