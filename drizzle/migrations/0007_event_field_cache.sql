-- Per-event cache of the tournament field.
-- payload shape: { "published": boolean, "espn_ids": string[] }
-- TTL is enforced at read time (~3h); no janitor needed.

CREATE TABLE IF NOT EXISTS event_field_cache (
  espn_event_id TEXT PRIMARY KEY,
  payload       JSONB NOT NULL,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_field_cache_fetched
  ON event_field_cache(fetched_at);
