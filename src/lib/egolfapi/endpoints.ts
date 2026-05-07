// Single source of truth — see /docs/endpoints.md.

// Live leaderboard for the current/most recent event.
// Note: site.web.api.espn.com (not site.api.espn.com) and no /pga/.
export const LEADERBOARD_URL =
  "https://site.web.api.espn.com/apis/site/v2/sports/golf/leaderboard";

// Season schedule (also returns events[] with live data, but without
// competitor.status — don't use this for leaderboards).
export const SCOREBOARD_URL =
  "https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard";

// FedEx Cup standings + player roster.
export const STATISTICS_URL =
  "https://site.api.espn.com/apis/site/v2/sports/golf/pga/statistics";

// Per-player season history.
export const PLAYER_STATS_URL =
  "https://site.web.api.espn.com/apis/common/v3/sports/golf/athletes/{athleteId}/stats";

// Browser-like UA — ESPN 403s without one.
export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
