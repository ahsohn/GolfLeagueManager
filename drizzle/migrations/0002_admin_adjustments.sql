-- Admin Lineup Adjustments feature
-- Adds ability for admins to adjust lineups with full audit trail

-- Add admin_note column to lineups table to mark admin-adjusted entries
ALTER TABLE lineups ADD COLUMN IF NOT EXISTS admin_note TEXT;

-- Create admin_adjustments table for full audit history
CREATE TABLE IF NOT EXISTS admin_adjustments (
  id            SERIAL PRIMARY KEY,
  timestamp     TEXT NOT NULL,
  tournament_id TEXT NOT NULL REFERENCES tournaments(tournament_id),
  team_id       INTEGER NOT NULL REFERENCES teams(team_id),
  old_slot      INTEGER NOT NULL,
  new_slot      INTEGER NOT NULL,
  old_points    INTEGER,
  new_points    INTEGER,
  note          TEXT,
  admin_email   TEXT NOT NULL
);

-- Index for querying adjustments by tournament or team
CREATE INDEX IF NOT EXISTS idx_admin_adjustments_tournament ON admin_adjustments(tournament_id);
CREATE INDEX IF NOT EXISTS idx_admin_adjustments_team ON admin_adjustments(team_id);
