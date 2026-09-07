import { StravaError } from "../../strava-app/lib/security.mjs";

const copy = (value) => value ? structuredClone(value) : value;

export function createMemoryStravaStore(now) {
  const states = new Map();
  const connectionLinks = new Map();
  const raceCandidates = new Map();
  const raceMatches = new Map();
  let raceSchedule = [];
  let connection = null;
  let lock = null;
  let failedSaves = 0;
  return {
    states,
    async ping() {},
    async listRaceSchedule() {
      return copy(raceSchedule);
    },
    async listPublicRaces(includeActivities = true) {
      return copy([...raceSchedule]
        .sort((left, right) => left.race_number - right.race_number)
        .map((race) => {
          const activityId = raceMatches.get(race.id);
          const candidate = activityId === undefined ? null : raceCandidates.get(activityId);
          const included = includeActivities && candidate?.classification_status === "included"
            && candidate.scheduled_marathon_id === race.id;
          const result = {
            raceNumber: race.race_number,
            raceId: race.id,
            date: race.race_date,
            state: race.state,
            city: race.city,
            status: included ? "completed" : "scheduled",
          };
          if (included) {
            result.activity = {
              stravaActivityId: String(candidate.activity_id),
              startTime: new Date(candidate.activity_start_at * 1000).toISOString(),
              distanceMeters: candidate.distance_meters ?? null,
              movingTimeSeconds: candidate.moving_time_seconds ?? null,
              elapsedTimeSeconds: candidate.elapsed_time_seconds ?? null,
              elevationGainMeters: candidate.elevation_gain_meters ?? null,
              summaryPolyline: candidate.summary_polyline ?? null,
              startLatLng: candidate.start_latitude === null || candidate.start_longitude === null
                ? null : [candidate.start_latitude, candidate.start_longitude],
              endLatLng: candidate.end_latitude === null || candidate.end_longitude === null
                ? null : [candidate.end_latitude, candidate.end_longitude],
            };
          }
          return result;
        }));
    },
    async listIncludedRaceIds() {
      return [...raceMatches].flatMap(([raceId, activityId]) => {
        const candidate = raceCandidates.get(activityId);
        return candidate?.classification_status === "included" && candidate.scheduled_marathon_id === raceId ? [{
          id: raceId,
          race_number: raceSchedule.find((race) => race.id === raceId)?.race_number,
        }] : [];
      });
    },
    async listPendingRaceCandidates() {
      return copy([...raceCandidates.values()].filter((candidate) => candidate.classification_status === "pending"));
    },
    async saveRaceActivityCandidate(candidate, match, current) {
      const previous = raceCandidates.get(candidate.activity_id);
      const next = {
        ...previous,
        ...copy(candidate),
        classification_status: previous?.classification_status || "pending",
        scheduled_marathon_id: previous?.scheduled_marathon_id || null,
        scheduled_state_code: previous?.scheduled_state_code || null,
        match_confidence: previous?.match_confidence || null,
        match_method: previous?.match_method || null,
        created_at: previous?.created_at || current,
        updated_at: current,
      };
      if (next.classification_status === "pending" && match.classificationStatus === "included") {
        const occupied = [...raceCandidates.values()].some((item) =>
          item.activity_id !== candidate.activity_id && item.classification_status === "included"
          && item.scheduled_marathon_id === match.raceId);
        if (!occupied) {
          next.classification_status = "included";
          next.scheduled_marathon_id = match.raceId;
          next.scheduled_state_code = match.stateCode;
          next.match_confidence = match.matchConfidence;
          next.match_method = match.matchMethod;
          raceMatches.set(match.raceId, candidate.activity_id);
        }
      }
      raceCandidates.set(candidate.activity_id, next);
    },
    async assignRaceCandidate(activityId, raceId, current) {
      const candidate = raceCandidates.get(activityId);
      const race = raceSchedule.find((item) => item.id === raceId && item.status === "scheduled");
      if (!candidate || !race || (candidate.classification_status === "included"
        && candidate.scheduled_marathon_id !== raceId)) return false;
      const occupied = [...raceCandidates.values()].some((item) =>
        item.activity_id !== activityId && item.classification_status === "included"
        && item.scheduled_marathon_id === raceId);
      if (occupied) return false;
      raceCandidates.set(activityId, {
        ...candidate,
        classification_status: "included",
        scheduled_marathon_id: raceId,
        scheduled_state_code: race.state_code,
        match_confidence: 1,
        match_method: "manual_admin",
        exclusion_reason: null,
        reviewed_at: current,
        reviewed_by: "admin",
        updated_at: current,
      });
      raceMatches.set(raceId, activityId);
      return true;
    },
    async createConnectionLink(tokenHash, expiresAt, current) {
      for (const [key, link] of connectionLinks) if (link.expires_at <= current) connectionLinks.delete(key);
      connectionLinks.set(tokenHash, { token_hash: tokenHash, expires_at: expiresAt, created_at: current });
    },
    async redeemConnectionLink(tokenHash, stateHash, browserHash, stateExpiresAt, current) {
      const link = connectionLinks.get(tokenHash);
      if (!link || link.expires_at <= current) return false;
      connectionLinks.delete(tokenHash);
      states.set(stateHash, { state_hash: stateHash, browser_hash: browserHash, expires_at: stateExpiresAt });
      return true;
    },
    async createState(stateHash, browserHash, expiresAt, current) {
      for (const [key, state] of states) if (state.expires_at <= current) states.delete(key);
      states.set(stateHash, { state_hash: stateHash, browser_hash: browserHash, expires_at: expiresAt });
    },
    async consumeState(stateHash, browserHash, current) {
      const state = states.get(stateHash);
      if (!state || state.browser_hash !== browserHash || state.expires_at <= current) return false;
      states.delete(stateHash);
      return true;
    },
    async getConnection() {
      return copy(connection);
    },
    async acquireLock(owner) {
      if (lock && lock.expires_at > now()) return false;
      lock = { owner, expires_at: now() + 60 };
      return true;
    },
    async releaseLock(owner) {
      if (lock?.owner === owner) lock = null;
    },
    async saveConnection(next, owner) {
      if (failedSaves > 0) {
        failedSaves -= 1;
        throw new Error("temporary database failure");
      }
      if (!lock || lock.owner !== owner || lock.expires_at <= now() ||
        (connection && connection.athlete_id !== next.athlete_id)) {
        throw new StravaError("strava_connection_changed", 409);
      }
      connection = copy(next);
    },
    inspectConnection: () => copy(connection),
    inspectRaceCandidates: () => copy([...raceCandidates.values()]),
    setRaceSchedule: (races) => { raceSchedule = copy(races); },
    setRaceCandidate(candidate, { matched = false } = {}) {
      const value = copy(candidate);
      raceCandidates.set(value.activity_id, value);
      if (matched && value.scheduled_marathon_id) raceMatches.set(value.scheduled_marathon_id, value.activity_id);
    },
    inspectConnectionLinks: () => copy([...connectionLinks.values()]),
    inspectLock: () => copy(lock),
    expireLock: () => { if (lock) lock.expires_at = 0; },
    failNextSaves: (count) => { failedSaves = count; },
  };
}
