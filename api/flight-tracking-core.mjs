const ARRIVAL_BUFFER_MS = 20 * 60 * 1000;

export const MISSION_FLIGHTS = [
  {
    id: "hnl-anc-2026-10-09",
    originAirport: "HNL",
    destinationAirport: "ANC",
    originCity: "Honolulu, Hawaii",
    destinationCity: "Anchorage, Alaska",
    originStop: 1,
    destinationStop: 2,
    originCoordinates: { lat: 21.3187, lng: -157.9225 },
    destinationCoordinates: { lat: 61.1743, lng: -149.9964 },
    scheduledDeparture: "2026-10-10T09:11:00.000Z",
    scheduledArrival: "2026-10-10T15:22:00.000Z",
    airline: "Alaska Airlines",
    status: "scheduled",
    manualOverride: false,
    actualDeparture: null,
    actualArrival: null,
    note: "",
  },
  {
    id: "anc-pdx-2026-10-10",
    originAirport: "ANC",
    destinationAirport: "PDX",
    originCity: "Anchorage, Alaska",
    destinationCity: "Portland, Oregon",
    originStop: 2,
    destinationStop: 3,
    originCoordinates: { lat: 61.1743, lng: -149.9964 },
    destinationCoordinates: { lat: 45.5898, lng: -122.5951 },
    scheduledDeparture: "2026-10-10T23:51:00.000Z",
    scheduledArrival: "2026-10-11T03:35:00.000Z",
    airline: "Alaska Airlines",
    status: "scheduled",
    manualOverride: false,
    actualDeparture: null,
    actualArrival: null,
    note: "",
  },
  {
    id: "pdx-slc-2026-10-11",
    originAirport: "PDX",
    destinationAirport: "SLC",
    originCity: "Portland, Oregon",
    destinationCity: "Salt Lake City, Utah",
    originStop: 3,
    destinationStop: 5,
    originCoordinates: { lat: 45.5898, lng: -122.5951 },
    destinationCoordinates: { lat: 40.7899, lng: -111.9791 },
    scheduledDeparture: "2026-10-12T00:15:00.000Z",
    scheduledArrival: "2026-10-12T02:10:00.000Z",
    airline: "Delta Airlines",
    status: "scheduled",
    manualOverride: false,
    actualDeparture: null,
    actualArrival: null,
    note: "",
  },
  {
    id: "cmh-lax-2026-10-20",
    originAirport: "CMH",
    destinationAirport: "LAX",
    originCity: "Columbus, Ohio",
    destinationCity: "Los Angeles, California",
    originStop: 24,
    destinationStop: 26,
    originCoordinates: { lat: 39.998, lng: -82.8919 },
    destinationCoordinates: { lat: 33.9416, lng: -118.4085 },
    scheduledDeparture: "2026-10-20T23:03:00.000Z",
    scheduledArrival: "2026-10-21T04:11:00.000Z",
    airline: "American Airlines",
    status: "scheduled",
    manualOverride: false,
    actualDeparture: null,
    actualArrival: null,
    note: "",
  },
  {
    id: "mia-atl-2026-10-24",
    originAirport: "MIA",
    destinationAirport: "ATL",
    originCity: "Miami, Florida",
    destinationCity: "Atlanta, Georgia",
    originStop: 32,
    destinationStop: 33,
    originCoordinates: { lat: 25.7959, lng: -80.287 },
    destinationCoordinates: { lat: 33.6407, lng: -84.4277 },
    scheduledDeparture: "2026-10-24T20:21:00.000Z",
    scheduledArrival: "2026-10-24T22:24:00.000Z",
    airline: "Delta Airlines",
    status: "scheduled",
    manualOverride: false,
    actualDeparture: null,
    actualArrival: null,
    note: "",
  },
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function asTime(value) {
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(time) ? time : null;
}

function parseOverridePayload(raw) {
  if (!raw) return {};
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed)) {
      return Object.fromEntries(parsed.filter((item) => item?.id).map((item) => [item.id, item]));
    }
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function readFlightOverrides(env = {}) {
  return parseOverridePayload(
    env.MISSION_FLIGHT_OVERRIDES_JSON ||
    env.FLIGHT_OVERRIDES_JSON ||
    (typeof process !== "undefined" ? process.env?.MISSION_FLIGHT_OVERRIDES_JSON || process.env?.FLIGHT_OVERRIDES_JSON : "")
  );
}

function mergeFlight(flight, overrides) {
  const override = overrides[flight.id] || {};
  const manualOverride = override.manualOverride === true || override.manualOverride === "true";
  if (!manualOverride) return { ...flight };
  return {
    ...flight,
    status: override.status || flight.status,
    manualOverride: true,
    actualDeparture: override.actualDeparture || flight.actualDeparture,
    actualArrival: override.actualArrival || flight.actualArrival,
    note: override.note || "",
    markedAt: override.markedAt || override.updatedAt || null,
  };
}

function publicFlight(flight, publicStatus, progress, nowMs) {
  const arrivedUntil = asTime(flight.actualArrival || flight.scheduledArrival) + ARRIVAL_BUFFER_MS;
  return {
    active: true,
    status: publicStatus,
    label: publicStatus === "IN TRANSIT" ? "Flight" : "Travel",
    nextStop: flight.destinationCity,
    originCity: flight.originCity,
    destinationCity: flight.destinationCity,
    originStop: flight.originStop,
    destinationStop: flight.destinationStop,
    originCoordinates: flight.originCoordinates,
    destinationCoordinates: flight.destinationCoordinates,
    progress: clamp(progress, 0, 1),
    arrivedBufferActive: publicStatus === "ARRIVED" && nowMs < arrivedUntil,
  };
}

function resolveFlightState(flight, nowMs) {
  const scheduledDeparture = asTime(flight.scheduledDeparture);
  const scheduledArrival = asTime(flight.scheduledArrival);
  const departure = asTime(flight.actualDeparture) || scheduledDeparture;
  const arrival = asTime(flight.actualArrival) || scheduledArrival;

  if (!scheduledDeparture || !scheduledArrival) return null;

  if (flight.manualOverride) {
    if (flight.status === "delayed") return publicFlight(flight, "DELAYED", 0, nowMs);
    if (flight.status === "cancelled") return publicFlight(flight, "TRAVEL UPDATE", 0, nowMs);
    if (flight.status === "arrived") {
      const actualArrival = asTime(flight.actualArrival) || asTime(flight.markedAt) || nowMs;
      if (nowMs <= actualArrival + ARRIVAL_BUFFER_MS) return publicFlight(flight, "ARRIVED", 1, nowMs);
      return null;
    }
    if (flight.status === "departed") {
      const actualDeparture = asTime(flight.actualDeparture) || asTime(flight.markedAt) || nowMs;
      const effectiveArrival = arrival && arrival > actualDeparture ? arrival : actualDeparture + Math.max(1, scheduledArrival - scheduledDeparture);
      return publicFlight(flight, "IN TRANSIT", (nowMs - actualDeparture) / (effectiveArrival - actualDeparture), nowMs);
    }
  }

  if (nowMs >= departure && nowMs <= arrival) {
    return publicFlight(flight, "IN TRANSIT", (nowMs - departure) / (arrival - departure), nowMs);
  }
  if (nowMs > arrival && nowMs <= arrival + ARRIVAL_BUFFER_MS) {
    return publicFlight(flight, "ARRIVED", 1, nowMs);
  }
  return null;
}

export function publicFlightStatus({ now = new Date(), env = {} } = {}) {
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(nowMs)) return { active: false, status: "GROUND", flightsLoaded: false };

  const overrides = readFlightOverrides(env);
  const flights = MISSION_FLIGHTS.map((flight) => mergeFlight(flight, overrides));
  const activeFlight = flights.map((flight) => resolveFlightState(flight, nowMs)).find(Boolean);
  if (activeFlight) return { ...activeFlight, flightsLoaded: true };

  const next = flights
    .filter((flight) => asTime(flight.scheduledDeparture) > nowMs)
    .sort((a, b) => asTime(a.scheduledDeparture) - asTime(b.scheduledDeparture))[0];

  return {
    active: false,
    status: next ? `NEXT STOP: ${next.destinationCity}` : "GROUND",
    nextStop: next?.destinationCity || null,
    flightsLoaded: true,
  };
}
