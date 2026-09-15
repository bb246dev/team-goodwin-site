-- FlightAware normalized-state cache shared across Passenger workers.
-- Apply after 006_strava_webhook_admin_hardening_mariadb.sql.
-- Additive and MariaDB-compatible: no generated columns and no destructive data changes.

CREATE TABLE IF NOT EXISTS flight_tracking_cache (
  leg_id VARCHAR(96) NOT NULL,
  provider VARCHAR(32) NOT NULL,
  normalized_state_json LONGTEXT NOT NULL,
  fresh_until BIGINT UNSIGNED NOT NULL,
  retain_until BIGINT UNSIGNED NOT NULL,
  updated_at BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (leg_id),
  KEY flight_tracking_cache_refresh (fresh_until),
  KEY flight_tracking_cache_retention (retain_until)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
