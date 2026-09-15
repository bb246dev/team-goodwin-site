import { validateFlightLegs } from "../../config/flight-legs.mjs";
import {
  createUnavailableFlightState,
  normalizeFlightAwareFlight,
} from "./normalize.mjs";

const FLIGHTAWARE_ORIGIN = "https://aeroapi.flightaware.com";
const FLIGHTAWARE_BASE_PATH = "/aeroapi";
export const FLIGHTAWARE_REQUEST_TIMEOUT_MS = 5_000;
export const FLIGHTAWARE_RESPONSE_MAX_BYTES = 256 * 1_024;
const FLIGHT_RESULTS_MAX = 100;

export class FlightAwareError extends Error {
  constructor(code, status = 503) {
    super(code);
    this.name = "FlightAwareError";
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

export function flightAwareConfiguration(env = {}) {
  const apiKey = environmentValue(env, "FLIGHTAWARE_API_KEY");
  if (!apiKey) return null;
  if (apiKey.length < 16 || apiKey.length > 512 || /[\u0000-\u0020\u007f]/.test(apiKey)) {
    throw new FlightAwareError("flightaware_not_configured");
  }
  return Object.freeze({ apiKey });
}

function isJsonContentType(value) {
  return /^application\/(?:[a-z0-9!#$&^_.+-]+\+)?json(?:\s*;|$)/i.test(value || "");
}

async function boundedJson(response) {
  if (!response?.ok) {
    const status = response?.status === 429 ? 429 : 503;
    throw new FlightAwareError(response?.status === 429 ? "flightaware_rate_limited" : "flightaware_unavailable", status);
  }
  if (!isJsonContentType(response.headers?.get?.("content-type"))) {
    throw new FlightAwareError("flightaware_invalid_content_type");
  }
  const declared = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(declared) && declared > FLIGHTAWARE_RESPONSE_MAX_BYTES) {
    throw new FlightAwareError("flightaware_response_too_large");
  }
  if (!response.body?.getReader) throw new FlightAwareError("flightaware_invalid_response");
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > FLIGHTAWARE_RESPONSE_MAX_BYTES) {
        throw new FlightAwareError("flightaware_response_too_large");
      }
      chunks.push(value);
    }
  } finally {
    if (size > FLIGHTAWARE_RESPONSE_MAX_BYTES) await reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new FlightAwareError("flightaware_invalid_json");
  }
}

function identifier(value, code) {
  if (typeof value !== "string" || value.length < 1 || value.length > 256
    || /[\u0000-\u0020\u007f/\\?#]/.test(value)) throw new FlightAwareError(code);
  return value;
}

function scheduledUtcDate(leg) {
  const departure = leg.scheduledDeparture ? Date.parse(leg.scheduledDeparture) : NaN;
  return Number.isFinite(departure)
    ? new Date(departure).toISOString().slice(0, 10)
    : leg.scheduledDate;
}

function dateRange(leg) {
  const start = new Date(`${scheduledUtcDate(leg)}T00:00:00Z`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1_000);
  return { start: start.toISOString(), end: end.toISOString() };
}

function airportMatches(reference, expected) {
  if (!reference || typeof reference !== "object" || Array.isArray(reference)) return false;
  return [reference.code, reference.code_icao, reference.code_iata, reference.code_lid]
    .some((value) => typeof value === "string" && value.toUpperCase() === expected);
}

function scheduledTime(flight) {
  const value = flight?.scheduled_out ?? flight?.scheduled_off;
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
}

export function selectFlightInstance(payload, leg) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || !Array.isArray(payload.flights)
    || payload.flights.length > FLIGHT_RESULTS_MAX) throw new FlightAwareError("flightaware_invalid_flights_response");
  const expectedIdent = leg.ident?.toUpperCase() || null;
  const expectedRegistration = leg.registration?.toUpperCase() || null;
  const expectedFlightId = leg.faFlightId || null;
  const identityMatches = payload.flights.filter((flight) => {
    if (!flight || typeof flight !== "object" || Array.isArray(flight)) return false;
    if (expectedFlightId && flight.fa_flight_id !== expectedFlightId) return false;
    const providerIdents = [flight.ident, flight.ident_icao, flight.ident_iata]
      .filter((value) => typeof value === "string")
      .map((value) => value.toUpperCase());
    if (leg.type === "commercial" && expectedIdent && !providerIdents.includes(expectedIdent)) return false;
    if (leg.type === "private" && expectedRegistration
      && String(flight.registration || "").toUpperCase() !== expectedRegistration
      && !providerIdents.includes(expectedRegistration)) return false;
    if (expectedFlightId) return true;
    if (!airportMatches(flight.origin, leg.origin) || !airportMatches(flight.destination, leg.destination)) return false;
    const time = scheduledTime(flight);
    return time !== null && new Date(time).toISOString().slice(0, 10) === scheduledUtcDate(leg);
  });
  if (expectedFlightId) {
    if (identityMatches.length === 0) return null;
    return identityMatches.find((flight) => airportMatches(flight.origin, leg.origin)
      && airportMatches(flight.destination, leg.destination)) || identityMatches[0];
  }
  const candidates = identityMatches;
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  if (!leg.scheduledDeparture) throw new FlightAwareError("flightaware_ambiguous_flight");
  const target = Date.parse(leg.scheduledDeparture);
  const ranked = candidates
    .map((flight) => ({ flight, distance: Math.abs(scheduledTime(flight) - target) }))
    .sort((left, right) => left.distance - right.distance);
  if (ranked.length > 1 && ranked[0].distance === ranked[1].distance) {
    throw new FlightAwareError("flightaware_ambiguous_flight");
  }
  return ranked[0].flight;
}

function validateLeg(leg) {
  return validateFlightLegs([leg])[0];
}

export function createFlightAwareService({
  env = {},
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
} = {}) {
  const config = flightAwareConfiguration(env);
  const enabled = Boolean(config);

  async function request(path, query = {}) {
    if (!config) throw new FlightAwareError("flightaware_not_configured");
    if (typeof fetchImpl !== "function") throw new FlightAwareError("flightaware_unavailable");
    const url = new URL(`${FLIGHTAWARE_BASE_PATH}${path}`, FLIGHTAWARE_ORIGIN);
    if (url.origin !== FLIGHTAWARE_ORIGIN || !url.pathname.startsWith(`${FLIGHTAWARE_BASE_PATH}/flights/`)) {
      throw new FlightAwareError("flightaware_upstream_not_allowed");
    }
    for (const [name, value] of Object.entries(query)) {
      if (value !== null && value !== undefined) url.searchParams.set(name, String(value));
    }
    let response;
    try {
      response = await fetchImpl(url.href, {
        method: "GET",
        headers: { Accept: "application/json", "x-apikey": config.apiKey },
        redirect: "error",
        signal: typeof globalThis.AbortSignal?.timeout === "function"
          ? globalThis.AbortSignal.timeout(FLIGHTAWARE_REQUEST_TIMEOUT_MS)
          : undefined,
      });
    } catch {
      throw new FlightAwareError("flightaware_unavailable");
    }
    return boundedJson(response);
  }

  async function resolveByIdentity(leg, identity, identType) {
    const { start, end } = dateRange(leg);
    const payload = await request(`/flights/${encodeURIComponent(identifier(identity, "flightaware_invalid_ident"))}`, {
      ident_type: identType,
      start,
      end,
    });
    return selectFlightInstance(payload, leg);
  }

  async function resolveCommercialFlight(inputLeg) {
    const leg = validateLeg(inputLeg);
    if (leg.type !== "commercial") throw new FlightAwareError("flightaware_wrong_flight_type");
    if (leg.faFlightId) return getFlightStatus(leg.faFlightId, leg);
    if (!leg.ident) return null;
    return resolveByIdentity(leg, leg.ident, "designator");
  }

  async function resolvePrivateFlight(inputLeg) {
    const leg = validateLeg(inputLeg);
    if (leg.type !== "private") throw new FlightAwareError("flightaware_wrong_flight_type");
    if (leg.faFlightId) return getFlightStatus(leg.faFlightId, leg);
    if (!leg.registration) return null;
    return resolveByIdentity(leg, leg.registration, "registration");
  }

  async function getFlightStatus(faFlightId, inputLeg = null) {
    const id = identifier(faFlightId, "flightaware_invalid_flight_id");
    const payload = await request(`/flights/${encodeURIComponent(id)}`, { ident_type: "fa_flight_id" });
    if (!inputLeg) {
      if (!payload || !Array.isArray(payload.flights) || payload.flights.length > FLIGHT_RESULTS_MAX) {
        throw new FlightAwareError("flightaware_invalid_flights_response");
      }
      return payload.flights.find((flight) => flight?.fa_flight_id === id) || null;
    }
    return selectFlightInstance(payload, inputLeg);
  }

  async function getLatestPosition(faFlightId) {
    const id = identifier(faFlightId, "flightaware_invalid_flight_id");
    return request(`/flights/${encodeURIComponent(id)}/position`);
  }

  async function retrieveFlightState(inputLeg) {
    const leg = validateLeg(inputLeg);
    if (!leg.trackingEnabled) return createUnavailableFlightState(leg, { availability: "not_configured" });
    if (!enabled) return createUnavailableFlightState(leg, { availability: "not_configured" });
    if (leg.type === "private" && !leg.registration && !leg.faFlightId) {
      return createUnavailableFlightState(leg, {
        availability: "registration_pending",
        status: "scheduled",
      });
    }
    const flight = leg.type === "commercial"
      ? await resolveCommercialFlight(leg)
      : await resolvePrivateFlight(leg);
    if (!flight) {
      return createUnavailableFlightState(leg, {
        availability: "flight_not_found",
        status: "scheduled",
      });
    }
    return normalizeFlightAwareFlight({ leg, flight, now: now() });
  }

  async function getDepartureInformation(leg) {
    const state = await retrieveFlightState(leg);
    return {
      status: state.status,
      scheduledDeparture: state.scheduledDeparture,
      actualDeparture: state.actualDeparture,
    };
  }

  async function getArrivalInformation(leg) {
    const state = await retrieveFlightState(leg);
    return {
      status: state.status,
      scheduledArrival: state.scheduledArrival,
      estimatedArrival: state.estimatedArrival,
      actualArrival: state.actualArrival,
    };
  }

  async function getEta(leg) {
    return (await retrieveFlightState(leg)).estimatedArrival;
  }

  return Object.freeze({
    enabled,
    resolveCommercialFlight,
    resolvePrivateFlight,
    getFlightStatus,
    getLatestPosition,
    getDepartureInformation,
    getArrivalInformation,
    getEta,
    retrieveFlightState,
  });
}
