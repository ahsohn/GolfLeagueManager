-- Add ESPN event id and season to tournaments
-- Both columns are nullable until backfill is complete (see migration 0006).

ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS espn_event_id TEXT UNIQUE;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS season INTEGER;

CREATE INDEX IF NOT EXISTS idx_tournaments_espn_event_id ON tournaments(espn_event_id);
