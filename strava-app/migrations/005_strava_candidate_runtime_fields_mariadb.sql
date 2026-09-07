-- MariaDB continuation migration for candidate fields required by the current runtime.
-- Apply after 003_strava_race_activity_candidates_mysql.sql and the 004b MariaDB repair.
-- Each nullable addition is independently idempotent and preserves existing candidate rows.

ALTER TABLE strava_race_activity_candidates
  ADD COLUMN IF NOT EXISTS moving_time_seconds INT UNSIGNED NULL AFTER distance_meters;

ALTER TABLE strava_race_activity_candidates
  ADD COLUMN IF NOT EXISTS elapsed_time_seconds INT UNSIGNED NULL AFTER moving_time_seconds;

ALTER TABLE strava_race_activity_candidates
  ADD COLUMN IF NOT EXISTS elevation_gain_meters DECIMAL(10,2) UNSIGNED NULL AFTER elapsed_time_seconds;

ALTER TABLE strava_race_activity_candidates
  ADD COLUMN IF NOT EXISTS summary_polyline TEXT CHARACTER SET ascii COLLATE ascii_bin NULL AFTER elevation_gain_meters;
