import { StravaError } from "../../strava-app/lib/security.mjs";

const copy = (value) => value ? structuredClone(value) : value;

export function createMemoryStravaStore(now) {
  const states = new Map();
  const connectionLinks = new Map();
  const raceCandidates = new Map();
  const raceMatches = new Map();
  const webhookEvents = new Map();
  const webhookActivityState = new Map();
  const adminAuthFailures = new Map();
  let webhookRateState = null;
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
    async registerWebhookEvent(eventKey, event, current, retentionSeconds) {
      for (const [key, value] of webhookEvents) {
        if (value.expires_at <= current) webhookEvents.delete(key);
      }
      const previous = webhookEvents.get(eventKey);
      if (previous) {
        return {
          registered: false,
          shouldSchedule: previous.processing_status === "queued" || previous.processing_status === "failed"
            || (previous.processing_status === "processing" && previous.lease_expires_at <= current),
        };
      }
      webhookEvents.set(eventKey, {
        event_key: eventKey,
        activity_id: String(event.object_id),
        subscription_id: String(event.subscription_id),
        owner_id: String(event.owner_id),
        aspect_type: event.aspect_type,
        event_time: event.event_time,
        processing_status: "queued",
        lease_owner: null,
        lease_expires_at: 0,
        created_at: current,
        updated_at: current,
        expires_at: current + retentionSeconds,
      });
      return { registered: true, shouldSchedule: true };
    },
    async listRecoverableWebhookEventKeys(current) {
      return [...webhookEvents.values()]
        .filter((event) => event.processing_status === "queued" || event.processing_status === "failed"
          || (event.processing_status === "processing" && event.lease_expires_at <= current))
        .sort((left, right) => left.created_at - right.created_at)
        .slice(0, 50)
        .map((event) => event.event_key);
    },
    async consumeWebhookRateLimit(current, windowSeconds, limit) {
      if (!webhookRateState || webhookRateState.window_started_at <= current - windowSeconds) {
        webhookRateState = { window_started_at: current, event_count: 1 };
      } else {
        webhookRateState.event_count += 1;
      }
      return webhookRateState.event_count <= limit;
    },
    async claimWebhookEvent(eventKey, owner, current) {
      const event = webhookEvents.get(eventKey);
      if (!event || ["succeeded", "ignored"].includes(event.processing_status)) return { status: "duplicate" };
      if (event.processing_status === "processing" && event.lease_expires_at > current) return { status: "busy" };
      const state = webhookActivityState.get(event.activity_id) || {
        latest_event_time: 0,
        latest_aspect_rank: 0,
        latest_event_key: null,
        lease_owner: null,
        lease_expires_at: 0,
      };
      if (state.lease_owner && state.lease_expires_at > current) return { status: "busy" };
      const rank = { create: 1, update: 2, delete: 3 }[event.aspect_type];
      if (event.event_time < state.latest_event_time
        || (event.event_time === state.latest_event_time
          && (rank < state.latest_aspect_rank
            || (rank === state.latest_aspect_rank && state.latest_event_key === eventKey)))) {
        event.processing_status = "ignored";
        event.updated_at = current;
        webhookEvents.set(eventKey, event);
        return { status: "stale", activityId: event.activity_id };
      }
      event.processing_status = "processing";
      event.lease_owner = owner;
      event.lease_expires_at = current + 60;
      event.updated_at = current;
      state.lease_owner = owner;
      state.lease_expires_at = current + 60;
      state.updated_at = current;
      webhookEvents.set(eventKey, event);
      webhookActivityState.set(event.activity_id, state);
      return {
        status: "claimed",
        activityId: event.activity_id,
        ownerId: event.owner_id,
        aspectType: event.aspect_type,
        eventTime: event.event_time,
      };
    },
    async finishWebhookEvent(eventKey, owner, outcome, current) {
      const event = webhookEvents.get(eventKey);
      if (!event || event.lease_owner !== owner) return false;
      event.processing_status = ["succeeded", "ignored", "failed"].includes(outcome.status)
        ? outcome.status : "failed";
      event.lease_owner = null;
      event.lease_expires_at = 0;
      event.processed_at = event.processing_status === "failed" ? null : current;
      event.updated_at = current;
      const state = webhookActivityState.get(event.activity_id);
      if (state?.lease_owner === owner) {
        if (outcome.advance) {
          state.latest_event_time = event.event_time;
          state.latest_aspect_rank = { create: 1, update: 2, delete: 3 }[event.aspect_type];
          state.latest_event_key = eventKey;
        }
        state.lease_owner = null;
        state.lease_expires_at = 0;
        state.updated_at = current;
        webhookActivityState.set(event.activity_id, state);
      }
      webhookEvents.set(eventKey, event);
      return true;
    },
    async deleteRaceActivityCandidate(activityId, eventTime, current) {
      const id = String(activityId);
      for (const [raceId, matchedActivityId] of raceMatches) {
        if (String(matchedActivityId) === id) raceMatches.delete(raceId);
      }
      const candidate = raceCandidates.get(id);
      if (!candidate) return;
      raceCandidates.set(id, {
        ...candidate,
        classification_status: "excluded",
        scheduled_marathon_id: null,
        scheduled_state_code: null,
        match_confidence: null,
        match_method: null,
        exclusion_reason: "strava_activity_deleted",
        reviewed_at: null,
        reviewed_by: null,
        source_updated_at: Math.max(Number(candidate.source_updated_at || 0), eventTime),
        updated_at: current,
      });
    },
    async recordAdminAuthFailure(clientKey, current, windowSeconds, limit) {
      const previous = adminAuthFailures.get(clientKey);
      const entry = !previous || previous.window_started_at <= current - windowSeconds
        ? { window_started_at: current, failure_count: 1 }
        : { ...previous, failure_count: previous.failure_count + 1 };
      entry.updated_at = current;
      entry.expires_at = current + 86_400;
      adminAuthFailures.set(clientKey, entry);
      return {
        limited: entry.failure_count > limit,
        retryAfter: Math.max(1, windowSeconds - (current - entry.window_started_at)),
      };
    },
    async clearAdminAuthFailures(clientKey) {
      adminAuthFailures.delete(clientKey);
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
    inspectWebhookEvents: () => copy([...webhookEvents.values()]),
    inspectWebhookActivityState: () => copy([...webhookActivityState.entries()]),
    inspectWebhookRateState: () => copy(webhookRateState),
    inspectAdminAuthFailures: () => copy([...adminAuthFailures.entries()]),
    inspectLock: () => copy(lock),
    expireLock: () => { if (lock) lock.expires_at = 0; },
    failNextSaves: (count) => { failedSaves = count; },
  };
}
