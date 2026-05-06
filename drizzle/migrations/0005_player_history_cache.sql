-- Per-(espn_id, season) cache of normalized PlayerSeasonHistory.
-- TTL is enforced at read time (24h); no janitor needed.

CREATE TABLE IF NOT EXISTS player_history_cache (
  espn_id    TEXT NOT NULL,
  season     INTEGER NOT NULL,
  payload    JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (espn_id, season)
);

CREATE INDEX IF NOT EXISTS idx_player_history_cache_fetched
  ON player_history_cache(fetched_at);
