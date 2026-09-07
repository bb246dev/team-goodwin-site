import { StravaError } from "./security.mjs";
import { canInitiateStravaActivityFetch, operationalWindowForActivityStart } from "./race-window.mjs";

export const MARATHON_DISTANCE_METERS = 42_195;
export const MARATHON_CANDIDATE_MIN_METERS = 38_000;
export const MARATHON_CANDIDATE_MAX_METERS = 47_000;
export const MARATHON_AUTO_MATCH_MIN_METERS = 40_000;
export const MARATHON_AUTO_MATCH_MAX_METERS = 45_000;
export const RACE_LOCATION_RADIUS_KM = 80;

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizedPlace(value) {
  return text(value).toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, " ").trim();
}

function localDate(activity) {
  const value = text(activity.localStartDate || activity.start_date_local).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function actualStart(activity) {
  return activity.actualStartTimestamp ?? activity.start_date;
}

function activityType(activity) {
  return normalizedPlace(activity.activityType || activity.sport_type || activity.type).replaceAll(" ", "");
}

function coordinates(value) {
  if (!Array.isArray(value) || value.length !== 2) return null;
  if (value.some((coordinate) => coordinate === null || coordinate === undefined || coordinate === "")) return null;
  const latitude = Number(value[0]);
  const longitude = Number(value[1]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
    latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return [latitude, longitude];
}

function radians(value) {
  return value * Math.PI / 180;
}

function distanceKm(left, right) {
  const latitudeDelta = radians(right[0] - left[0]);
  const longitudeDelta = radians(right[1] - left[1]);
  const value = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(left[0])) * Math.cos(radians(right[0])) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371.0088 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function geographyEvidence(activity, race) {
  const state = normalizedPlace(activity.locationState || activity.location_state);
  const city = normalizedPlace(activity.locationCity || activity.location_city);
  const namedLocation = Boolean(state && city &&
    [normalizedPlace(race.state), normalizedPlace(race.state_code ?? race.stateCode)].includes(state)
    && city === normalizedPlace(race.city));

  const raceCoordinates = coordinates([race.latitude, race.longitude]);
  const activityCoordinates = [
    coordinates(activity.startCoordinates || activity.start_latlng),
    coordinates(activity.endCoordinates || activity.end_latlng),
  ].filter(Boolean);
  const coordinateLocation = Boolean(raceCoordinates && activityCoordinates.some((point) =>
    distanceKm(point, raceCoordinates) <= RACE_LOCATION_RADIUS_KM));

  return { namedLocation, coordinateLocation };
}

function raceId(race) {
  return text(race.id);
}

function raceNumber(race) {
  return Number(race.race_number ?? race.raceNumber);
}

function raceDate(race) {
  const value = race.race_date ?? race.raceDate;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10);
  return text(value).slice(0, 10);
}

function raceStateCode(race) {
  return text(race.state_code ?? race.stateCode);
}

function pending(reason, candidates = []) {
  return {
    classificationStatus: "pending",
    candidateRaceIds: candidates.map(raceId),
    reason,
  };
}

export function matchRaceActivityCandidate(activity, races, context = {}) {
  if (!activity || typeof activity !== "object" || !Array.isArray(races)) {
    throw new StravaError("strava_invalid_activity_candidate", 400);
  }
  if (!operationalWindowForActivityStart(actualStart(activity))) return pending("activity_outside_operational_window");
  if (!localDate(activity)) return pending("activity_local_date_missing");
  if (!["run", "trailrun", "virtualrun"].includes(activityType(activity))) return pending("activity_not_run");

  const distance = Number(activity.distanceMeters ?? activity.distance);
  const matchedRaceIds = new Set((context.matchedRaceIds || []).map(String));
  const sameDay = races.filter((race) => race.status === "scheduled"
    && raceDate(race) === localDate(activity)
    && raceId(race)
    && !matchedRaceIds.has(raceId(race)));
  if (sameDay.length === 0) return pending("no_unmatched_race_on_activity_date");
  if (!Number.isFinite(distance) || distance < MARATHON_CANDIDATE_MIN_METERS || distance > MARATHON_CANDIDATE_MAX_METERS) {
    return pending("distance_requires_manual_review", sameDay);
  }

  const geographicallySupported = sameDay.map((race) => ({ race, ...geographyEvidence(activity, race) }))
    .filter((candidate) => candidate.namedLocation || candidate.coordinateLocation);
  const autoDistance = distance >= MARATHON_AUTO_MATCH_MIN_METERS && distance <= MARATHON_AUTO_MATCH_MAX_METERS;
  if (!autoDistance || geographicallySupported.length !== 1) {
    return pending(geographicallySupported.length > 1 ? "ambiguous_geographic_match" : "geographic_confirmation_required", sameDay);
  }

  const match = geographicallySupported[0];
  const lastRaceNumber = Number(context.lastMatchedRaceNumber);
  const orderContextConsistent = !Number.isInteger(lastRaceNumber) || raceNumber(match.race) > lastRaceNumber;
  return {
    classificationStatus: "included",
    raceId: raceId(match.race),
    stateCode: raceStateCode(match.race),
    matchConfidence: match.namedLocation && match.coordinateLocation ? 0.99 : orderContextConsistent ? 0.97 : 0.95,
    matchMethod: match.namedLocation && match.coordinateLocation
      ? "date_distance_name_geo"
      : match.namedLocation ? "date_distance_location" : "date_distance_geo",
    candidateRaceIds: [raceId(match.race)],
    orderContextConsistent,
  };
}

export function qualifiesForPublicRaceData(candidate) {
  return candidate?.classification_status === "included"
    && text(candidate.scheduled_marathon_id).length > 0
    && text(candidate.scheduled_state_code).length === 2;
}

function timestampSeconds(value) {
  if (typeof value === "number") return Number.isSafeInteger(value) && value > 0 ? value : null;
  if (typeof value !== "string" || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? Math.floor(milliseconds / 1000) : null;
}

function optionalUnsignedInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 && number <= 4_294_967_295 ? number : null;
}

function optionalUnsignedDecimal(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 99_999_999.99 ? number : null;
}

function summaryPolyline(activity) {
  const value = activity?.summaryPolyline ?? activity?.map?.summary_polyline;
  return typeof value === "string" && value.length > 0 && value.length <= 65_535
    && /^[\x3F-\x7E]+$/.test(value) ? value : null;
}

export async function processRaceActivityCandidate(store, activity, now = Math.floor(Date.now() / 1000)) {
  if (!store || !["getConnection", "listRaceSchedule", "listIncludedRaceIds", "saveRaceActivityCandidate"]
    .every((method) => typeof store[method] === "function")) {
    throw new StravaError("strava_storage_unavailable");
  }
  if (!canInitiateStravaActivityFetch(now)) throw new StravaError("strava_operational_window_closed", 409);
  const connection = await store.getConnection();
  const athleteId = String(activity?.athleteId ?? activity?.athlete?.id ?? "");
  if (!connection || !athleteId || athleteId !== connection.athlete_id) {
    throw new StravaError("strava_activity_owner_mismatch", 403);
  }
  const window = operationalWindowForActivityStart(actualStart(activity));
  const activityStartAt = timestampSeconds(actualStart(activity));
  const activityId = String(activity?.activityId ?? activity?.id ?? "");
  if (!window || !activityStartAt || !/^\d+$/.test(activityId)) {
    throw new StravaError("strava_invalid_activity_candidate", 400);
  }
  const races = await store.listRaceSchedule();
  const included = await store.listIncludedRaceIds();
  const match = matchRaceActivityCandidate(activity, races, {
    matchedRaceIds: included.map((item) => item.id),
    lastMatchedRaceNumber: included.reduce((latest, item) => Math.max(latest, Number(item.race_number) || 0), 0),
  });
  const start = coordinates(activity.startCoordinates || activity.start_latlng);
  const end = coordinates(activity.endCoordinates || activity.end_latlng);
  await store.saveRaceActivityCandidate({
    activity_id: activityId,
    athlete_id: athleteId,
    operational_window_id: window.id,
    activity_start_at: activityStartAt,
    activity_local_date: localDate(activity) || null,
    activity_type: text(activity.activityType || activity.sport_type || activity.type).slice(0, 64),
    distance_meters: Number(activity.distanceMeters ?? activity.distance) || 0,
    moving_time_seconds: optionalUnsignedInteger(activity.movingTimeSeconds ?? activity.moving_time),
    elapsed_time_seconds: optionalUnsignedInteger(activity.elapsedTimeSeconds ?? activity.elapsed_time),
    elevation_gain_meters: optionalUnsignedDecimal(activity.elevationGainMeters ?? activity.total_elevation_gain),
    summary_polyline: summaryPolyline(activity),
    start_latitude: start?.[0] ?? null,
    start_longitude: start?.[1] ?? null,
    end_latitude: end?.[0] ?? null,
    end_longitude: end?.[1] ?? null,
    source_updated_at: now,
  }, match, now);
  return match;
}
