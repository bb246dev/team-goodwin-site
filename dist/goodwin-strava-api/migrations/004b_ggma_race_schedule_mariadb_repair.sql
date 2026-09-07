-- Forward-only repair for a partially applied 004 migration on MariaDB.
-- Safe to run whether ggma_race_schedule exists and whether the failed ALTER added no or some fields.
-- Uses an ordinary one-to-one match table instead of a conditional generated column.

CREATE TABLE IF NOT EXISTS ggma_race_schedule (
  id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  operational_window_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  race_number TINYINT UNSIGNED NOT NULL,
  race_date DATE NOT NULL,
  state VARCHAR(64) NOT NULL,
  state_code CHAR(2) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  city VARCHAR(128) NOT NULL,
  slug VARCHAR(160) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  scheduled_start_time TIME NULL,
  timezone VARCHAR(64) NULL,
  latitude DECIMAL(9,6) NULL,
  longitude DECIMAL(9,6) NULL,
  status VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'scheduled',
  source_url VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at BIGINT UNSIGNED NOT NULL,
  updated_at BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY ggma_race_schedule_number (race_number),
  UNIQUE KEY ggma_race_schedule_slug (slug),
  KEY ggma_race_schedule_date (race_date, race_number),
  CONSTRAINT ggma_race_schedule_window CHECK (operational_window_id = 'ggma-2026'),
  CONSTRAINT ggma_race_schedule_number_range CHECK (race_number BETWEEN 1 AND 50),
  CONSTRAINT ggma_race_schedule_status CHECK (status IN ('scheduled', 'cancelled'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE strava_race_activity_candidates
  DROP FOREIGN KEY IF EXISTS strava_race_candidates_schedule,
  DROP INDEX IF EXISTS strava_race_candidates_one_included_activity,
  DROP COLUMN IF EXISTS included_scheduled_marathon_id;

ALTER TABLE strava_race_activity_candidates
  ADD COLUMN IF NOT EXISTS activity_local_date DATE NULL AFTER activity_start_at,
  ADD COLUMN IF NOT EXISTS start_latitude DECIMAL(9,6) NULL AFTER distance_meters,
  ADD COLUMN IF NOT EXISTS start_longitude DECIMAL(9,6) NULL AFTER start_latitude,
  ADD COLUMN IF NOT EXISTS end_latitude DECIMAL(9,6) NULL AFTER start_longitude,
  ADD COLUMN IF NOT EXISTS end_longitude DECIMAL(9,6) NULL AFTER end_latitude,
  ADD COLUMN IF NOT EXISTS match_confidence DECIMAL(5,4) NULL AFTER scheduled_state_code,
  ADD COLUMN IF NOT EXISTS match_method VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER match_confidence,
  ADD COLUMN IF NOT EXISTS reviewed_at BIGINT UNSIGNED NULL AFTER exclusion_reason,
  ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER reviewed_at,
  ADD INDEX IF NOT EXISTS strava_race_candidates_local_date (activity_local_date, classification_status);

CREATE TABLE IF NOT EXISTS strava_race_activity_matches (
  scheduled_marathon_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  activity_id BIGINT UNSIGNED NOT NULL,
  created_at BIGINT UNSIGNED NOT NULL,
  updated_at BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (scheduled_marathon_id),
  UNIQUE KEY strava_race_activity_matches_activity (activity_id),
  CONSTRAINT strava_race_activity_matches_candidate
    FOREIGN KEY (activity_id) REFERENCES strava_race_activity_candidates(activity_id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Remove any stale match-table row before rebuilding it from candidate classifications.
DELETE match_row
FROM strava_race_activity_matches AS match_row
LEFT JOIN strava_race_activity_candidates AS candidate
  ON candidate.activity_id = match_row.activity_id
  AND candidate.scheduled_marathon_id = match_row.scheduled_marathon_id
  AND candidate.classification_status = 'included'
WHERE candidate.activity_id IS NULL;

-- Backfill only unambiguous one-to-one included rows. Conflicts fail closed to pending below.
INSERT IGNORE INTO strava_race_activity_matches
  (scheduled_marathon_id, activity_id, created_at, updated_at)
SELECT candidate.scheduled_marathon_id, candidate.activity_id, candidate.updated_at, candidate.updated_at
FROM strava_race_activity_candidates AS candidate
WHERE candidate.classification_status = 'included'
  AND candidate.scheduled_marathon_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM strava_race_activity_candidates AS other
    WHERE other.classification_status = 'included'
      AND other.scheduled_marathon_id = candidate.scheduled_marathon_id
      AND other.activity_id <> candidate.activity_id
  );

UPDATE strava_race_activity_candidates AS candidate
LEFT JOIN strava_race_activity_matches AS match_row
  ON match_row.activity_id = candidate.activity_id
  AND match_row.scheduled_marathon_id = candidate.scheduled_marathon_id
SET candidate.classification_status = 'pending',
    candidate.scheduled_marathon_id = NULL,
    candidate.scheduled_state_code = NULL,
    candidate.match_confidence = NULL,
    candidate.match_method = NULL,
    candidate.reviewed_at = NULL,
    candidate.reviewed_by = NULL,
    candidate.updated_at = UNIX_TIMESTAMP()
WHERE candidate.classification_status = 'included'
  AND match_row.activity_id IS NULL;
