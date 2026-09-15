const FLIGHT_TYPES = new Set(["commercial", "private"]);
const LEG_KEYS = [
  "id",
  "type",
  "scheduledDate",
  "scheduledDeparture",
  "origin",
  "destination",
  "ident",
  "registration",
  "faFlightId",
  "trackingEnabled",
  "notes",
];

export class FlightConfigurationError extends Error {
  constructor(code) {
    super(code);
    this.name = "FlightConfigurationError";
    this.code = code;
  }
}

function exactObject(value, keys) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key)));
}

function nullableIdentifier(value, maximum = 128, uppercase = true) {
  if (value === null) return null;
  if (typeof value !== "string") throw new FlightConfigurationError("invalid_flight_identifier");
  const trimmed = value.trim();
  const normalized = uppercase ? trimmed.toUpperCase() : trimmed;
  if (!normalized || normalized.length > maximum || !/^[A-Za-z0-9._-]+$/.test(normalized)) {
    throw new FlightConfigurationError("invalid_flight_identifier");
  }
  return normalized;
}

function airportCode(value) {
  if (typeof value !== "string") throw new FlightConfigurationError("invalid_flight_airport");
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z0-9]{3,7}$/.test(normalized)) throw new FlightConfigurationError("invalid_flight_airport");
  return normalized;
}

function scheduledDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new FlightConfigurationError("invalid_flight_date");
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new FlightConfigurationError("invalid_flight_date");
  }
  return value;
}

function nullableTimestamp(value) {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > 64 || !Number.isFinite(Date.parse(value))) {
    throw new FlightConfigurationError("invalid_flight_departure_time");
  }
  return new Date(value).toISOString();
}

function nullableNotes(value) {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > 1_024) {
    throw new FlightConfigurationError("invalid_flight_notes");
  }
  return value;
}

export function validateFlightLegs(legs) {
  if (!Array.isArray(legs)) throw new FlightConfigurationError("invalid_flight_legs");
  const seen = new Set();
  const validated = legs.map((leg) => {
    if (!exactObject(leg, LEG_KEYS)) throw new FlightConfigurationError("invalid_flight_leg_shape");
    if (typeof leg.id !== "string" || !/^[a-z0-9][a-z0-9-]{0,95}$/.test(leg.id) || seen.has(leg.id)) {
      throw new FlightConfigurationError("invalid_flight_leg_id");
    }
    seen.add(leg.id);
    if (!FLIGHT_TYPES.has(leg.type)) throw new FlightConfigurationError("invalid_flight_type");
    if (typeof leg.trackingEnabled !== "boolean") {
      throw new FlightConfigurationError("invalid_flight_tracking_flag");
    }
    const origin = airportCode(leg.origin);
    const destination = airportCode(leg.destination);
    if (origin === destination) throw new FlightConfigurationError("invalid_flight_route");
    return Object.freeze({
      id: leg.id,
      type: leg.type,
      scheduledDate: scheduledDate(leg.scheduledDate),
      scheduledDeparture: nullableTimestamp(leg.scheduledDeparture),
      origin,
      destination,
      ident: nullableIdentifier(leg.ident),
      registration: nullableIdentifier(leg.registration),
      faFlightId: nullableIdentifier(leg.faFlightId, 256, false),
      trackingEnabled: leg.trackingEnabled,
      notes: nullableNotes(leg.notes),
    });
  });
  return Object.freeze(validated);
}

// Authoritative commercial itinerary and private registrations belong here.
// This is intentionally empty until Team Goodwin supplies verified flight data.
export const FLIGHT_LEGS = validateFlightLegs([]);
