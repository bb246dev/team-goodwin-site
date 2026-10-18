-- Forward-only repair for GGMA race activities ingested while every schedule
-- coordinate was NULL. The coordinates are the public live-map route markers,
-- corrected to the named city for itinerary entries whose marker order changed.
-- Safe to rerun: coordinate writes are deterministic, the match table enforces
-- one race per activity, and only still-pending candidates are reconciled.

-- Shared, explicit journey events back the authenticated temporary phase controls.
-- INSERT IGNORE in the application makes the first transition timestamp immutable.
CREATE TABLE IF NOT EXISTS ggma_journey_events (
  event_id VARCHAR(64) NOT NULL,
  occurred_at BIGINT UNSIGNED NOT NULL,
  source_observed_at BIGINT UNSIGNED NULL,
  latitude DECIMAL(9,6) NULL,
  longitude DECIMAL(10,6) NULL,
  created_at BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (event_id),
  KEY ggma_journey_events_occurred (occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

START TRANSACTION;

UPDATE ggma_race_schedule AS race_schedule
JOIN (
  SELECT 'ggma-2026-01' AS id, 21.309900 AS latitude, -157.858100 AS longitude
  UNION ALL SELECT 'ggma-2026-02', 61.218100, -149.900300
  UNION ALL SELECT 'ggma-2026-03', 45.515200, -122.678400
  UNION ALL SELECT 'ggma-2026-04', 45.638700, -122.661500
  UNION ALL SELECT 'ggma-2026-05', 40.760800, -111.891000
  UNION ALL SELECT 'ggma-2026-06', 43.491700, -112.033900
  UNION ALL SELECT 'ggma-2026-07', 45.677000, -111.042900
  UNION ALL SELECT 'ggma-2026-08', 46.182800, -103.394600
  UNION ALL SELECT 'ggma-2026-09', 43.891900, -103.428800
  UNION ALL SELECT 'ggma-2026-10', 44.406100, -104.375200
  UNION ALL SELECT 'ggma-2026-11', 41.963600, -103.924900
  UNION ALL SELECT 'ggma-2026-12', 39.739200, -104.990300
  UNION ALL SELECT 'ggma-2026-13', 35.084400, -106.650400
  UNION ALL SELECT 'ggma-2026-14', 32.776700,  -96.797000
  UNION ALL SELECT 'ggma-2026-15', 36.692800,  -94.961300
  UNION ALL SELECT 'ggma-2026-16', 39.114200,  -94.627500
  UNION ALL SELECT 'ggma-2026-17', 39.099700,  -94.578600
  UNION ALL SELECT 'ggma-2026-18', 43.303300,  -91.785700
  UNION ALL SELECT 'ggma-2026-19', 43.508300,  -91.461300
  UNION ALL SELECT 'ggma-2026-20', 43.423900,  -91.197100
  UNION ALL SELECT 'ggma-2026-21', 41.878100,  -87.629800
  UNION ALL SELECT 'ggma-2026-22', 41.676400,  -86.252000
  UNION ALL SELECT 'ggma-2026-23', 41.799200,  -85.419400
  UNION ALL SELECT 'ggma-2026-24', 39.961200,  -82.998800
  UNION ALL SELECT 'ggma-2026-25', 34.052200, -118.243700
  UNION ALL SELECT 'ggma-2026-26', 36.169900, -115.139800
  UNION ALL SELECT 'ggma-2026-27', 35.875500, -114.660800
  UNION ALL SELECT 'ggma-2026-28', 34.746500,  -92.289600
  UNION ALL SELECT 'ggma-2026-29', 32.525200,  -93.750200
  UNION ALL SELECT 'ggma-2026-30', 32.364300,  -88.703700
  UNION ALL SELECT 'ggma-2026-31', 33.209800,  -87.569200
  UNION ALL SELECT 'ggma-2026-32', 25.761700,  -80.191800
  UNION ALL SELECT 'ggma-2026-33', 33.749000,  -84.388000
  UNION ALL SELECT 'ggma-2026-34', 34.852600,  -82.394000
  UNION ALL SELECT 'ggma-2026-35', 35.595100,  -82.551500
  UNION ALL SELECT 'ggma-2026-36', 35.788400,  -83.554300
  UNION ALL SELECT 'ggma-2026-37', 36.933700,  -82.629000
  UNION ALL SELECT 'ggma-2026-38', 37.479300,  -82.518700
  UNION ALL SELECT 'ggma-2026-39', 39.653400,  -79.658400
  UNION ALL SELECT 'ggma-2026-40', 39.606800,  -75.833200
  UNION ALL SELECT 'ggma-2026-41', 39.601000,  -75.746600
  UNION ALL SELECT 'ggma-2026-42', 39.952600,  -75.165200
  UNION ALL SELECT 'ggma-2026-43', 40.857600,  -74.060800
  UNION ALL SELECT 'ggma-2026-44', 41.053400,  -73.538700
  UNION ALL SELECT 'ggma-2026-45', 41.824000,  -71.412800
  UNION ALL SELECT 'ggma-2026-46', 42.360100,  -71.058900
  UNION ALL SELECT 'ggma-2026-47', 42.850900,  -72.557900
  UNION ALL SELECT 'ggma-2026-48', 43.071800,  -70.762600
  UNION ALL SELECT 'ggma-2026-49', 43.089500,  -70.744800
  UNION ALL SELECT 'ggma-2026-50', 40.712800,  -74.006000
) AS location ON location.id = race_schedule.id
SET race_schedule.latitude = location.latitude,
    race_schedule.longitude = location.longitude,
    race_schedule.updated_at = UNIX_TIMESTAMP()
WHERE race_schedule.operational_window_id = 'ggma-2026';

-- Apply the runtime matcher's local-date, activity-type, distance, and 80 km
-- geographic constraints. HAVING COUNT(*) = 1 fails closed on dates where more
-- than one schedule row has geographic support for an activity.
INSERT IGNORE INTO strava_race_activity_matches
  (scheduled_marathon_id, activity_id, created_at, updated_at)
SELECT unique_match.scheduled_marathon_id, unique_match.activity_id,
       UNIX_TIMESTAMP(), UNIX_TIMESTAMP()
FROM (
  SELECT candidate.activity_id,
         MIN(race_schedule.id) AS scheduled_marathon_id
  FROM strava_race_activity_candidates AS candidate
  JOIN ggma_race_schedule AS race_schedule
    ON race_schedule.operational_window_id = candidate.operational_window_id
   AND race_schedule.race_date = candidate.activity_local_date
   AND race_schedule.status = 'scheduled'
  WHERE candidate.operational_window_id = 'ggma-2026'
    AND candidate.classification_status = 'pending'
    AND LOWER(REPLACE(candidate.activity_type, ' ', '')) IN ('run', 'trailrun', 'virtualrun')
    AND candidate.distance_meters BETWEEN 40000 AND 45000
    AND race_schedule.latitude IS NOT NULL
    AND race_schedule.longitude IS NOT NULL
    AND (
      (
        candidate.start_latitude IS NOT NULL AND candidate.start_longitude IS NOT NULL
        AND 6371.0088 * 2 * ASIN(SQRT(LEAST(1,
          POWER(SIN(RADIANS((race_schedule.latitude - candidate.start_latitude) / 2)), 2)
          + COS(RADIANS(candidate.start_latitude)) * COS(RADIANS(race_schedule.latitude))
          * POWER(SIN(RADIANS((race_schedule.longitude - candidate.start_longitude) / 2)), 2)
        ))) <= 80
      ) OR (
        candidate.end_latitude IS NOT NULL AND candidate.end_longitude IS NOT NULL
        AND 6371.0088 * 2 * ASIN(SQRT(LEAST(1,
          POWER(SIN(RADIANS((race_schedule.latitude - candidate.end_latitude) / 2)), 2)
          + COS(RADIANS(candidate.end_latitude)) * COS(RADIANS(race_schedule.latitude))
          * POWER(SIN(RADIANS((race_schedule.longitude - candidate.end_longitude) / 2)), 2)
        ))) <= 80
      )
    )
  GROUP BY candidate.activity_id
  HAVING COUNT(*) = 1
) AS unique_match
LEFT JOIN strava_race_activity_matches AS occupied_race
  ON occupied_race.scheduled_marathon_id = unique_match.scheduled_marathon_id
LEFT JOIN strava_race_activity_matches AS occupied_activity
  ON occupied_activity.activity_id = unique_match.activity_id
WHERE occupied_race.scheduled_marathon_id IS NULL
  AND occupied_activity.activity_id IS NULL;

UPDATE strava_race_activity_candidates AS candidate
JOIN strava_race_activity_matches AS match_row
  ON match_row.activity_id = candidate.activity_id
JOIN ggma_race_schedule AS race_schedule
  ON race_schedule.id = match_row.scheduled_marathon_id
SET candidate.classification_status = 'included',
    candidate.scheduled_marathon_id = race_schedule.id,
    candidate.scheduled_state_code = race_schedule.state_code,
    candidate.match_confidence = 0.9700,
    candidate.match_method = 'date_distance_geo',
    candidate.exclusion_reason = NULL,
    candidate.updated_at = UNIX_TIMESTAMP()
WHERE candidate.operational_window_id = 'ggma-2026'
  AND candidate.classification_status = 'pending';

COMMIT;
