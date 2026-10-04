import { FLIGHT_LEGS } from "./flight-legs.mjs";

export const TRACKING_SOURCES = Object.freeze(["strava", "flightaware", "manual", "none"]);
const SOURCE_SET = new Set(TRACKING_SOURCES);
const WINDOW_KEYS = ["id", "source", "startsAt", "endsAt", "flightLegId", "notes"];

export class TrackingSourceConfigurationError extends Error {
  constructor(code) {
    super(code);
    this.name = "TrackingSourceConfigurationError";
    this.code = code;
  }
}

function timestamp(value) {
  if (typeof value !== "string" || value.length > 64 || !Number.isFinite(Date.parse(value))) {
    throw new TrackingSourceConfigurationError("invalid_tracking_source_time");
  }
  return new Date(value).toISOString();
}

export function validateTrackingSourceWindows(windows, flightLegs = FLIGHT_LEGS) {
  if (!Array.isArray(windows)) throw new TrackingSourceConfigurationError("invalid_tracking_source_windows");
  const legIds = new Set(flightLegs.map((leg) => leg.id));
  const seen = new Set();
  const validated = windows.map((window) => {
    if (!window || typeof window !== "object" || Array.isArray(window)
      || Object.keys(window).length !== WINDOW_KEYS.length
      || !WINDOW_KEYS.every((key) => Object.hasOwn(window, key))) {
      throw new TrackingSourceConfigurationError("invalid_tracking_source_window_shape");
    }
    if (typeof window.id !== "string" || !/^[a-z0-9][a-z0-9-]{0,95}$/.test(window.id)
      || seen.has(window.id)) throw new TrackingSourceConfigurationError("invalid_tracking_source_window_id");
    seen.add(window.id);
    if (!SOURCE_SET.has(window.source)) throw new TrackingSourceConfigurationError("invalid_tracking_source");
    const startsAt = timestamp(window.startsAt);
    const endsAt = timestamp(window.endsAt);
    if (Date.parse(endsAt) <= Date.parse(startsAt)) {
      throw new TrackingSourceConfigurationError("invalid_tracking_source_window");
    }
    const flightLegId = window.flightLegId === null ? null : String(window.flightLegId);
    if (window.source === "flightaware") {
      if (!flightLegId || !legIds.has(flightLegId)) {
        throw new TrackingSourceConfigurationError("invalid_tracking_source_flight_leg");
      }
    } else if (flightLegId !== null) {
      throw new TrackingSourceConfigurationError("unexpected_tracking_source_flight_leg");
    }
    if (window.notes !== null && (typeof window.notes !== "string" || window.notes.length > 1_024)) {
      throw new TrackingSourceConfigurationError("invalid_tracking_source_notes");
    }
    return Object.freeze({
      id: window.id,
      source: window.source,
      startsAt,
      endsAt,
      flightLegId,
      notes: window.notes,
    });
  }).sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt));

  for (let index = 1; index < validated.length; index += 1) {
    if (Date.parse(validated[index].startsAt) < Date.parse(validated[index - 1].endsAt)) {
      throw new TrackingSourceConfigurationError("overlapping_tracking_source_windows");
    }
  }
  return Object.freeze(validated);
}

// Explicit source changes are added here only after itinerary times are verified.
// Outside configured windows, the existing Strava/static behavior remains authoritative.
export const TRACKING_SOURCE_WINDOWS = validateTrackingSourceWindows([], FLIGHT_LEGS);
