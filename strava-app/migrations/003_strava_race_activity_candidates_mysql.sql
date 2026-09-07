-- Candidate activities for the single GGMA 2026 operational window.
-- Apply after 002_strava_connection_links_mysql.sql.
-- Only rows classified as included and matched to a scheduled marathon may feed public race data.

CREATE TABLE IF NOT EXISTS strava_race_activity_candidates (
  activity_id BIGINT UNSIGNED NOT NULL,
  athlete_id BIGINT UNSIGNED NOT NULL,
  operational_window_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  activity_start_at BIGINT UNSIGNED NOT NULL,
  activity_type VARCHAR(64) NOT NULL DEFAULT '',
  distance_meters DECIMAL(12,2) UNSIGNED NOT NULL DEFAULT 0,
  classification_status VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'pending',
  scheduled_marathon_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  scheduled_state_code CHAR(2) CHARACTER SET ascii COLLATE ascii_bin NULL,
  exclusion_reason VARCHAR(128) NULL,
  source_updated_at BIGINT UNSIGNED NULL,
  created_at BIGINT UNSIGNED NOT NULL,
  updated_at BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (activity_id),
  CONSTRAINT strava_race_candidates_window CHECK (operational_window_id = 'ggma-2026'),
  CONSTRAINT strava_race_candidates_status CHECK (classification_status IN ('pending', 'included', 'excluded')),
  CONSTRAINT strava_race_candidates_included_match CHECK (
    classification_status <> 'included'
    OR (scheduled_marathon_id IS NOT NULL AND scheduled_state_code IS NOT NULL)
  ),
  KEY strava_race_candidates_window_start (operational_window_id, activity_start_at),
  KEY strava_race_candidates_classification (classification_status, scheduled_marathon_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
