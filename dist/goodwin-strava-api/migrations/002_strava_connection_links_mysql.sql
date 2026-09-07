-- Single-use remote athlete connection links for MySQL 8 / MariaDB 10.5+.
-- Apply this after 001_strava_oauth_mysql.sql in the same dedicated database.

CREATE TABLE IF NOT EXISTS strava_connection_links (
  token_hash CHAR(44) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  expires_at BIGINT UNSIGNED NOT NULL,
  created_at BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (token_hash),
  KEY strava_connection_links_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
