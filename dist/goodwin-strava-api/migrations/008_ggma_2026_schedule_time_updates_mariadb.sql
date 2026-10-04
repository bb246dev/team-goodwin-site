-- Client-confirmed GGMA 2026 schedule changes received 2026-10-04.
-- Safe to rerun: each update targets one immutable race ID.

UPDATE ggma_race_schedule
SET scheduled_start_time = '22:45:00',
    timezone = 'America/Los_Angeles',
    updated_at = UNIX_TIMESTAMP()
WHERE id = 'ggma-2026-25' AND operational_window_id = 'ggma-2026';

UPDATE ggma_race_schedule
SET scheduled_start_time = '05:00:00',
    timezone = 'America/New_York',
    updated_at = UNIX_TIMESTAMP()
WHERE id = 'ggma-2026-48' AND operational_window_id = 'ggma-2026';

UPDATE ggma_race_schedule
SET scheduled_start_time = '12:00:00',
    timezone = 'America/New_York',
    updated_at = UNIX_TIMESTAMP()
WHERE id = 'ggma-2026-49' AND operational_window_id = 'ggma-2026';
