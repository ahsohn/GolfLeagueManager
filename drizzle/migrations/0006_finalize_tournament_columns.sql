-- OPTIONAL hardening — running this is NOT required for the scoring
-- integration to work. The columns added in migration 0004 stay nullable
-- and the application enforces the invariant at the API level (the
-- create-tournament picker, the /admin/backfill-events page).
--
-- Why you might run this later:
--   1. Postgres-level integrity guarantee — any future bug or manual edit
--      that tries to set espn_event_id or season to NULL gets rejected at
--      the DB boundary instead of producing a silently-broken row.
--   2. Lets you delete defensive code that handles the now-impossible
--      "tournament without ESPN mapping" state (the amber banners on
--      /admin and /admin/results/[id], the Pull-Results button visibility
--      check, the 400 in /api/admin/fetch-scores when espn_event_id is
--      null, and the corresponding `?: string | null` on the Tournament
--      type). After running 0006 you can tighten the type to
--      `espn_event_id: string` and `season: number`, then prune the dead
--      branches.
--
-- Cost of running:
--   - Tournaments cannot be created (or have their espn_event_id cleared)
--     without a valid mapping. If ESPN is unreachable when you want to
--     create a tournament, you're blocked.
--
-- Run only AFTER all tournaments have espn_event_id and season filled in
-- via /admin/backfill-events. The DO block aborts with a clear error if
-- any rows still have NULL values, so re-running is safe.

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
