import mysql from "mysql2/promise";
import { StravaError, requiredSecret } from "./security.mjs";

const LOCK_SECONDS = 60;

function mysqlPort(env) {
  const source = requiredSecret(env, "MYSQL_PORT").trim();
  if (!/^\d{1,5}$/.test(source)) throw new StravaError("strava_storage_unavailable");
  const port = Number(source);
  if (port < 1 || port > 65535) throw new StravaError("strava_storage_unavailable");
  return port;
}

export function createMySqlPool(env = process.env) {
  return mysql.createPool({
    host: requiredSecret(env, "MYSQL_HOST"),
    port: mysqlPort(env),
    database: requiredSecret(env, "MYSQL_DATABASE"),
    user: requiredSecret(env, "MYSQL_USER"),
    password: requiredSecret(env, "MYSQL_PASSWORD"),
    waitForConnections: true,
    connectionLimit: 5,
    maxIdle: 5,
    idleTimeout: 60_000,
    queueLimit: 20,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    charset: "utf8mb4",
    timezone: "Z",
    dateStrings: ["DATE"],
    supportBigNumbers: true,
    bigNumberStrings: true,
    multipleStatements: false,
  });
}

function connectionRow(row) {
  if (!row) return null;
  const expiresAt = Number(row.expires_at);
  const updatedAt = Number(row.updated_at);
  if (!Number.isSafeInteger(expiresAt) || !Number.isSafeInteger(updatedAt)) {
    throw new StravaError("strava_storage_unavailable");
  }
  return {
    athlete_id: String(row.athlete_id),
    athlete_name: row.athlete_name,
    encrypted_tokens: row.encrypted_tokens,
    expires_at: expiresAt,
    scopes: row.scopes,
    updated_at: updatedAt,
  };
}

function publicDate(value) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
}

function publicNumber(value) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function publicCoordinatePair(latitude, longitude) {
  if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) return null;
  const lat = Number(latitude);
  const lng = Number(longitude);
  return Number.isFinite(lat) && lat >= -90 && lat <= 90
    && Number.isFinite(lng) && lng >= -180 && lng <= 180 ? [lat, lng] : null;
}

function publicActivity(row) {
  if (row.strava_activity_id === null || row.strava_activity_id === undefined) return null;
  const startAt = Number(row.activity_start_at);
  if (!Number.isSafeInteger(startAt) || startAt <= 0) throw new StravaError("strava_storage_unavailable");
  const polyline = typeof row.summary_polyline === "string" && row.summary_polyline.length <= 65_535
    && /^[\x3F-\x7E]+$/.test(row.summary_polyline) ? row.summary_polyline : null;
  return {
    stravaActivityId: String(row.strava_activity_id),
    startTime: new Date(startAt * 1000).toISOString(),
    distanceMeters: publicNumber(row.distance_meters),
    movingTimeSeconds: publicNumber(row.moving_time_seconds),
    elapsedTimeSeconds: publicNumber(row.elapsed_time_seconds),
    elevationGainMeters: publicNumber(row.elevation_gain_meters),
    summaryPolyline: polyline,
    startLatLng: publicCoordinatePair(row.start_latitude, row.start_longitude),
    endLatLng: publicCoordinatePair(row.end_latitude, row.end_longitude),
  };
}

export function createMySqlStravaStore(pool) {
  if (!pool || typeof pool.execute !== "function" || typeof pool.getConnection !== "function") {
    throw new StravaError("strava_storage_unavailable");
  }
  return {
    async ping() {
      await pool.execute("SELECT 1 FROM strava_connection LIMIT 0");
      await pool.execute("SELECT 1 FROM strava_oauth_states LIMIT 0");
      await pool.execute("SELECT 1 FROM strava_refresh_lock LIMIT 0");
      await pool.execute("SELECT 1 FROM strava_connection_links LIMIT 0");
      await pool.execute(
        `SELECT moving_time_seconds, elapsed_time_seconds, elevation_gain_meters, summary_polyline
         FROM strava_race_activity_candidates LIMIT 0`,
      );
      await pool.execute("SELECT 1 FROM strava_race_activity_matches LIMIT 0");
      await pool.execute("SELECT 1 FROM ggma_race_schedule LIMIT 0");
      const [schedule] = await pool.execute(
        `SELECT COUNT(*) AS race_count, COUNT(DISTINCT race_number) AS number_count,
           MIN(race_number) AS first_race, MAX(race_number) AS last_race
         FROM ggma_race_schedule WHERE operational_window_id = 'ggma-2026'`,
      );
      if (!schedule[0] || Number(schedule[0].race_count) !== 50 || Number(schedule[0].number_count) !== 50 ||
        Number(schedule[0].first_race) !== 1 || Number(schedule[0].last_race) !== 50) {
        throw new StravaError("strava_schedule_unavailable");
      }
    },

    async listRaceSchedule() {
      const [rows] = await pool.execute(
        `SELECT id, race_number, race_date, state, state_code, city, slug,
           scheduled_start_time, timezone, latitude, longitude, status
         FROM ggma_race_schedule WHERE operational_window_id = 'ggma-2026'
         ORDER BY race_number`,
      );
      return rows.map((row) => ({
        ...row,
        race_number: Number(row.race_number),
        race_date: row.race_date instanceof Date ? row.race_date.toISOString().slice(0, 10) : String(row.race_date),
        latitude: row.latitude === null ? null : Number(row.latitude),
        longitude: row.longitude === null ? null : Number(row.longitude),
      }));
    },

    async listPublicRaces(includeActivities = true) {
      const [rows] = await pool.execute(
        `SELECT schedule.id AS race_id, schedule.race_number, schedule.race_date,
           schedule.state, schedule.city,
           candidate.activity_id AS strava_activity_id, candidate.activity_start_at,
           candidate.distance_meters, candidate.moving_time_seconds, candidate.elapsed_time_seconds,
           candidate.elevation_gain_meters, candidate.summary_polyline,
           candidate.start_latitude, candidate.start_longitude,
           candidate.end_latitude, candidate.end_longitude
         FROM ggma_race_schedule AS schedule
         LEFT JOIN strava_race_activity_matches AS match_row
           ON match_row.scheduled_marathon_id = schedule.id
         LEFT JOIN strava_race_activity_candidates AS candidate
           ON candidate.activity_id = match_row.activity_id
           AND candidate.scheduled_marathon_id = match_row.scheduled_marathon_id
           AND candidate.classification_status = ?
           AND candidate.operational_window_id = ?
         WHERE schedule.operational_window_id = ?
         ORDER BY schedule.race_number`,
        ["included", "ggma-2026", "ggma-2026"],
      );
      return rows.map((row) => {
        const activity = includeActivities ? publicActivity(row) : null;
        const race = {
          raceNumber: Number(row.race_number),
          raceId: row.race_id,
          date: publicDate(row.race_date),
          state: row.state,
          city: row.city,
          status: activity ? "completed" : "scheduled",
        };
        if (activity) race.activity = activity;
        return race;
      });
    },

    async listIncludedRaceIds() {
      const [rows] = await pool.execute(
        `SELECT match_row.scheduled_marathon_id AS id, schedule.race_number
         FROM strava_race_activity_matches AS match_row
         JOIN strava_race_activity_candidates AS candidate
           ON candidate.activity_id = match_row.activity_id
           AND candidate.scheduled_marathon_id = match_row.scheduled_marathon_id
           AND candidate.classification_status = 'included'
         JOIN ggma_race_schedule AS schedule ON schedule.id = match_row.scheduled_marathon_id
         ORDER BY schedule.race_number`,
      );
      return rows.map((row) => ({ id: row.id, race_number: Number(row.race_number) }));
    },

    async listPendingRaceCandidates() {
      const [rows] = await pool.execute(
        `SELECT activity_id, athlete_id, operational_window_id, activity_start_at,
           activity_local_date, activity_type, distance_meters,
           start_latitude, start_longitude, end_latitude, end_longitude,
           created_at, updated_at
         FROM strava_race_activity_candidates
         WHERE classification_status = 'pending'
         ORDER BY activity_start_at, activity_id`,
      );
      return rows.map((row) => ({
        ...row,
        activity_id: String(row.activity_id),
        athlete_id: String(row.athlete_id),
        activity_start_at: Number(row.activity_start_at),
        distance_meters: Number(row.distance_meters),
        start_latitude: row.start_latitude === null ? null : Number(row.start_latitude),
        start_longitude: row.start_longitude === null ? null : Number(row.start_longitude),
        end_latitude: row.end_latitude === null ? null : Number(row.end_latitude),
        end_longitude: row.end_longitude === null ? null : Number(row.end_longitude),
        created_at: Number(row.created_at),
        updated_at: Number(row.updated_at),
      }));
    },

    async saveRaceActivityCandidate(candidate, match, now) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        await connection.execute(
          `INSERT INTO strava_race_activity_candidates
             (activity_id, athlete_id, operational_window_id, activity_start_at, activity_local_date,
              activity_type, distance_meters, moving_time_seconds, elapsed_time_seconds,
              elevation_gain_meters, summary_polyline,
              start_latitude, start_longitude, end_latitude, end_longitude,
              classification_status, source_updated_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
           ON DUPLICATE KEY UPDATE activity_start_at = VALUES(activity_start_at),
             activity_local_date = VALUES(activity_local_date), activity_type = VALUES(activity_type),
             distance_meters = VALUES(distance_meters), moving_time_seconds = VALUES(moving_time_seconds),
             elapsed_time_seconds = VALUES(elapsed_time_seconds), elevation_gain_meters = VALUES(elevation_gain_meters),
             summary_polyline = VALUES(summary_polyline), start_latitude = VALUES(start_latitude),
             start_longitude = VALUES(start_longitude), end_latitude = VALUES(end_latitude),
             end_longitude = VALUES(end_longitude), source_updated_at = VALUES(source_updated_at),
             updated_at = VALUES(updated_at)`,
          [
            candidate.activity_id, candidate.athlete_id, candidate.operational_window_id,
            candidate.activity_start_at, candidate.activity_local_date, candidate.activity_type,
            candidate.distance_meters, candidate.moving_time_seconds, candidate.elapsed_time_seconds,
            candidate.elevation_gain_meters, candidate.summary_polyline,
            candidate.start_latitude, candidate.start_longitude,
            candidate.end_latitude, candidate.end_longitude, candidate.source_updated_at, now, now,
          ],
        );
        if (match.classificationStatus === "included") {
          const [current] = await connection.execute(
            `SELECT classification_status, scheduled_marathon_id
             FROM strava_race_activity_candidates WHERE activity_id = ? FOR UPDATE`,
            [candidate.activity_id],
          );
          if (current[0]?.classification_status === "pending") {
            const [occupied] = await connection.execute(
              `SELECT scheduled_marathon_id, activity_id FROM strava_race_activity_matches
               WHERE scheduled_marathon_id = ? OR activity_id = ? FOR UPDATE`,
              [match.raceId, candidate.activity_id],
            );
            if (occupied.length === 0) {
              await connection.execute("SAVEPOINT strava_candidate_pending");
              try {
                await connection.execute(
                  `INSERT INTO strava_race_activity_matches
                     (scheduled_marathon_id, activity_id, created_at, updated_at)
                   VALUES (?, ?, ?, ?)`,
                  [match.raceId, candidate.activity_id, now, now],
                );
                await connection.execute(
                  `UPDATE strava_race_activity_candidates
                   SET classification_status = 'included', scheduled_marathon_id = ?, scheduled_state_code = ?,
                     match_confidence = ?, match_method = ?, updated_at = ?
                   WHERE activity_id = ? AND classification_status = 'pending'`,
                  [match.raceId, match.stateCode, match.matchConfidence, match.matchMethod, now, candidate.activity_id],
                );
              } catch (error) {
                if (error?.code !== "ER_DUP_ENTRY" && error?.errno !== 1062) throw error;
                await connection.execute("ROLLBACK TO SAVEPOINT strava_candidate_pending");
              }
            }
          }
        }
        await connection.commit();
      } catch (error) {
        await connection.rollback().catch(() => {});
        throw error;
      } finally {
        connection.release();
      }
    },

    async assignRaceCandidate(activityId, raceId, now) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [candidates] = await connection.execute(
          `SELECT classification_status, scheduled_marathon_id
           FROM strava_race_activity_candidates WHERE activity_id = ? FOR UPDATE`,
          [activityId],
        );
        if (!candidates[0] || !["pending", "included"].includes(candidates[0].classification_status) ||
          (candidates[0].classification_status === "included"
          && candidates[0].scheduled_marathon_id !== raceId)) {
          await connection.rollback();
          return false;
        }
        const [races] = await connection.execute(
          `SELECT id, state_code FROM ggma_race_schedule
           WHERE id = ? AND operational_window_id = 'ggma-2026' AND status = 'scheduled' FOR UPDATE`,
          [raceId],
        );
        if (!races[0]) {
          await connection.rollback();
          return false;
        }
        const [occupied] = await connection.execute(
          `SELECT scheduled_marathon_id, activity_id FROM strava_race_activity_matches
           WHERE scheduled_marathon_id = ? OR activity_id = ? FOR UPDATE`,
          [raceId, activityId],
        );
        if (occupied.some((row) => String(row.activity_id) !== activityId
          || row.scheduled_marathon_id !== raceId)) {
          await connection.rollback();
          return false;
        }
        if (occupied.length === 0) {
          try {
            await connection.execute(
              `INSERT INTO strava_race_activity_matches
                 (scheduled_marathon_id, activity_id, created_at, updated_at)
               VALUES (?, ?, ?, ?)`,
              [raceId, activityId, now, now],
            );
          } catch (error) {
            if (error?.code === "ER_DUP_ENTRY" || error?.errno === 1062) {
              await connection.rollback();
              return false;
            }
            throw error;
          }
        }
        await connection.execute(
          `UPDATE strava_race_activity_candidates
           SET classification_status = 'included', scheduled_marathon_id = ?, scheduled_state_code = ?,
             match_confidence = 1.0000, match_method = 'manual_admin', exclusion_reason = NULL,
             reviewed_at = ?, reviewed_by = 'admin', updated_at = ?
           WHERE activity_id = ?`,
          [raceId, races[0].state_code, now, now, activityId],
        );
        await connection.commit();
        return true;
      } catch (error) {
        await connection.rollback().catch(() => {});
        throw error;
      } finally {
        connection.release();
      }
    },

    async createConnectionLink(tokenHash, expiresAt, now) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        await connection.execute("DELETE FROM strava_connection_links WHERE expires_at <= ?", [now]);
        await connection.execute(
          "INSERT INTO strava_connection_links (token_hash, expires_at, created_at) VALUES (?, ?, ?)",
          [tokenHash, expiresAt, now],
        );
        await connection.commit();
      } catch (error) {
        await connection.rollback().catch(() => {});
        throw error;
      } finally {
        connection.release();
      }
    },

    async redeemConnectionLink(tokenHash, stateHash, browserHash, stateExpiresAt, now) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [result] = await connection.execute(
          "DELETE FROM strava_connection_links WHERE token_hash = ? AND expires_at > ? LIMIT 1",
          [tokenHash, now],
        );
        if (result.affectedRows !== 1) {
          await connection.rollback();
          return false;
        }
        await connection.execute(
          "INSERT INTO strava_oauth_states (state_hash, browser_hash, expires_at) VALUES (?, ?, ?)",
          [stateHash, browserHash, stateExpiresAt],
        );
        await connection.commit();
        return true;
      } catch (error) {
        await connection.rollback().catch(() => {});
        throw error;
      } finally {
        connection.release();
      }
    },

    async createState(stateHash, browserHash, expiresAt, now) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        await connection.execute("DELETE FROM strava_oauth_states WHERE expires_at <= ?", [now]);
        await connection.execute(
          "INSERT INTO strava_oauth_states (state_hash, browser_hash, expires_at) VALUES (?, ?, ?)",
          [stateHash, browserHash, expiresAt],
        );
        await connection.commit();
      } catch (error) {
        await connection.rollback().catch(() => {});
        throw error;
      } finally {
        connection.release();
      }
    },

    async consumeState(stateHash, browserHash, now) {
      const [result] = await pool.execute(
        "DELETE FROM strava_oauth_states WHERE state_hash = ? AND browser_hash = ? AND expires_at > ? LIMIT 1",
        [stateHash, browserHash, now],
      );
      return result.affectedRows === 1;
    },

    async getConnection() {
      const [rows] = await pool.execute(
        "SELECT athlete_id, athlete_name, encrypted_tokens, expires_at, scopes, updated_at FROM strava_connection WHERE id = 1 LIMIT 1",
      );
      return connectionRow(rows[0]);
    },

    async acquireLock(owner) {
      const [inserted] = await pool.execute(
        `INSERT IGNORE INTO strava_refresh_lock (id, owner, expires_at)
         VALUES (1, ?, UNIX_TIMESTAMP() + ?)`,
        [owner, LOCK_SECONDS],
      );
      if (inserted.affectedRows === 1) return true;
      const [updated] = await pool.execute(
        `UPDATE strava_refresh_lock SET owner = ?, expires_at = UNIX_TIMESTAMP() + ?
         WHERE id = 1 AND expires_at <= UNIX_TIMESTAMP()`,
        [owner, LOCK_SECONDS],
      );
      return updated.affectedRows === 1;
    },

    async releaseLock(owner) {
      await pool.execute("DELETE FROM strava_refresh_lock WHERE id = 1 AND owner = ?", [owner]);
    },

    async saveConnection(next, owner) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [leases] = await connection.execute(
          `SELECT owner FROM strava_refresh_lock
           WHERE id = 1 AND owner = ? AND expires_at > UNIX_TIMESTAMP() FOR UPDATE`,
          [owner],
        );
        if (leases.length !== 1) throw new StravaError("strava_connection_changed", 409);
        const [current] = await connection.execute(
          "SELECT athlete_id FROM strava_connection WHERE id = 1 FOR UPDATE",
        );
        if (current[0] && String(current[0].athlete_id) !== next.athlete_id) {
          throw new StravaError("strava_connection_changed", 409);
        }
        await connection.execute(
          `INSERT INTO strava_connection
             (id, athlete_id, athlete_name, encrypted_tokens, expires_at, scopes, updated_at)
           VALUES (1, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE athlete_name = VALUES(athlete_name),
             encrypted_tokens = VALUES(encrypted_tokens), expires_at = VALUES(expires_at),
             scopes = VALUES(scopes), updated_at = VALUES(updated_at)`,
          [next.athlete_id, next.athlete_name, next.encrypted_tokens, next.expires_at, next.scopes, next.updated_at],
        );
        await connection.commit();
      } catch (error) {
        await connection.rollback().catch(() => {});
        throw error;
      } finally {
        connection.release();
      }
    },
  };
}
