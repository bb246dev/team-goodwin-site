-- TG-M05 durable webhook idempotency/order state and administrator throttling.
-- Apply after 005_strava_candidate_runtime_fields_mariadb.sql.
-- Additive and MariaDB-compatible: no generated columns and no destructive data changes.

CREATE TABLE IF NOT EXISTS strava_webhook_events (
  event_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  activity_id BIGINT UNSIGNED NOT NULL,
  subscription_id BIGINT UNSIGNED NOT NULL,
  owner_id BIGINT UNSIGNED NOT NULL,
  aspect_type VARCHAR(8) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  event_time BIGINT UNSIGNED NOT NULL,
  processing_status VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'queued',
  lease_owner CHAR(43) CHARACTER SET ascii COLLATE ascii_bin NULL,
  lease_expires_at BIGINT UNSIGNED NULL,
  processed_at BIGINT UNSIGNED NULL,
  created_at BIGINT UNSIGNED NOT NULL,
  updated_at BIGINT UNSIGNED NOT NULL,
  expires_at BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (event_key),
  CONSTRAINT strava_webhook_events_aspect CHECK (aspect_type IN ('create', 'update', 'delete')),
  CONSTRAINT strava_webhook_events_status CHECK (
    processing_status IN ('queued', 'processing', 'succeeded', 'ignored', 'failed')
  ),
  KEY strava_webhook_events_activity_order (activity_id, event_time),
  KEY strava_webhook_events_status_lease (processing_status, lease_expires_at),
  KEY strava_webhook_events_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS strava_webhook_activity_state (
  activity_id BIGINT UNSIGNED NOT NULL,
  latest_event_time BIGINT UNSIGNED NOT NULL DEFAULT 0,
  latest_aspect_rank TINYINT UNSIGNED NOT NULL DEFAULT 0,
  latest_event_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  lease_owner CHAR(43) CHARACTER SET ascii COLLATE ascii_bin NULL,
  lease_expires_at BIGINT UNSIGNED NULL,
  updated_at BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (activity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS strava_webhook_rate_state (
  id TINYINT UNSIGNED NOT NULL,
  window_started_at BIGINT UNSIGNED NOT NULL,
  event_count SMALLINT UNSIGNED NOT NULL,
  updated_at BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT strava_webhook_rate_singleton CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS strava_admin_auth_failures (
  client_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  window_started_at BIGINT UNSIGNED NOT NULL,
  failure_count SMALLINT UNSIGNED NOT NULL,
  updated_at BIGINT UNSIGNED NOT NULL,
  expires_at BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (client_key),
  KEY strava_admin_auth_failures_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
