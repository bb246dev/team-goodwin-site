-- Goodwin Strava backend schema for MySQL 8 / MariaDB 10.5+.
-- In phpMyAdmin, first select the dedicated database created in cPanel, then import this file.

CREATE TABLE IF NOT EXISTS strava_connection (
  id TINYINT UNSIGNED NOT NULL,
  athlete_id BIGINT UNSIGNED NOT NULL,
  athlete_name VARCHAR(200) NOT NULL DEFAULT '',
  encrypted_tokens TEXT NOT NULL,
  expires_at BIGINT UNSIGNED NOT NULL,
  scopes VARCHAR(512) NOT NULL,
  updated_at BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY strava_connection_athlete (athlete_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS strava_oauth_states (
  state_hash CHAR(44) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  browser_hash CHAR(44) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  expires_at BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (state_hash),
  KEY strava_oauth_states_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS strava_refresh_lock (
  id TINYINT UNSIGNED NOT NULL,
  owner CHAR(43) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  expires_at BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  KEY strava_refresh_lock_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
