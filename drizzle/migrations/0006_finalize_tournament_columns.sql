-- Run AFTER all tournaments have espn_event_id and season filled in via
-- /admin/backfill-events. The DO block aborts the migration with a clear
-- error if any rows still have NULL values, so it's safe to attempt early.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM tournaments WHERE espn_event_id IS NULL) THEN
    RAISE EXCEPTION 'Some tournaments still have espn_event_id IS NULL — backfill first via /admin/backfill-events.';
  END IF;
  IF EXISTS (SELECT 1 FROM tournaments WHERE season IS NULL) THEN
    RAISE EXCEPTION 'Some tournaments still have season IS NULL — backfill first via /admin/backfill-events.';
  END IF;
END $$;

ALTER TABLE tournaments ALTER COLUMN espn_event_id SET NOT NULL;
ALTER TABLE tournaments ALTER COLUMN season SET NOT NULL;
