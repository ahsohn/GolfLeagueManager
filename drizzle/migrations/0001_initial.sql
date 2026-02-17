-- Golf League Manager — initial schema
-- Run this once in your Neon database (via Neon console, psql, or drizzle-kit)

CREATE TABLE IF NOT EXISTS teams (
  team_id     INTEGER PRIMARY KEY,
  team_name   TEXT    NOT NULL,
  owner_email TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS golfers (
  golfer_id INTEGER PRIMARY KEY,
  name      TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS rosters (
  team_id    INTEGER NOT NULL REFERENCES teams(team_id),
  slot       INTEGER NOT NULL CHECK (slot BETWEEN 1 AND 10),
  golfer_id  INTEGER NOT NULL REFERENCES golfers(golfer_id),
  times_used INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (team_id, slot)
);

CREATE TABLE IF NOT EXISTS tournaments (
  tournament_id TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  deadline      TEXT NOT NULL,  -- ISO 8601 datetime string
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'locked', 'closed'))
);

CREATE TABLE IF NOT EXISTS lineups (
  tournament_id TEXT    NOT NULL REFERENCES tournaments(tournament_id),
  team_id       INTEGER NOT NULL REFERENCES teams(team_id),
  slot          INTEGER NOT NULL,
  fedex_points  INTEGER,         -- NULL until results are entered
  PRIMARY KEY (tournament_id, team_id, slot)
);

CREATE TABLE IF NOT EXISTS standings (
  team_id      INTEGER PRIMARY KEY REFERENCES teams(team_id),
  total_points INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS waiver_log (
  id             SERIAL  PRIMARY KEY,
  timestamp      TEXT    NOT NULL,
  team_id        INTEGER NOT NULL REFERENCES teams(team_id),
  dropped_golfer TEXT    NOT NULL,
  added_golfer   TEXT    NOT NULL,
  slot           INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS slot_history (
  team_id       INTEGER NOT NULL REFERENCES teams(team_id),
  golfer_id     INTEGER NOT NULL REFERENCES golfers(golfer_id),
  original_slot INTEGER NOT NULL,
  PRIMARY KEY (team_id, original_slot)
);

CREATE TABLE IF NOT EXISTS config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
