-- GGMA 2026 race schedule and candidate-review support for MySQL 8 / MariaDB 10.5+.
-- Apply after 003_strava_race_activity_candidates_mysql.sql, then import the seed file.

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
  ADD COLUMN activity_local_date DATE NULL AFTER activity_start_at,
  ADD COLUMN start_latitude DECIMAL(9,6) NULL AFTER distance_meters,
  ADD COLUMN start_longitude DECIMAL(9,6) NULL AFTER start_latitude,
  ADD COLUMN end_latitude DECIMAL(9,6) NULL AFTER start_longitude,
  ADD COLUMN end_longitude DECIMAL(9,6) NULL AFTER end_latitude,
  ADD COLUMN match_confidence DECIMAL(5,4) NULL AFTER scheduled_state_code,
  ADD COLUMN match_method VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER match_confidence,
  ADD COLUMN reviewed_at BIGINT UNSIGNED NULL AFTER exclusion_reason,
  ADD COLUMN reviewed_by VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER reviewed_at,
  ADD KEY strava_race_candidates_local_date (activity_local_date, classification_status);

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
