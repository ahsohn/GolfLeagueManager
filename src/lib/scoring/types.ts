import type { PlayerSeasonHistory } from '../egolfapi';

// Status of a single lineup row after the fetch-scores call.
// Drives the per-row badge in the preview UI and the summary banner.
export type LineupResultStatus =
  | 'played'           // fetched ESPN result; fedex_points populated (>= 0)
  | 'missed_cut'       // event found, position MC
  | 'withdrew'         // event found, position WD
  | 'did_not_play'     // history fetched, but no entry for this event
  | 'manual_entry'     // roster has no espn_id — must be entered by hand
  | 'fetch_failed';    // network/parse error fetching this player's history

// One row in the proposal returned by /api/admin/fetch-scores.
// Mirrors the shape consumed by /admin/results/[id] page state.
export interface ProposedResult {
  team_id: number;
  team_name: string;
  slot: number;
  golfer_name: string;
  espn_id: string | null;
  current_fedex_points: number | null; // existing value in lineups (may be null)
  fetched_fedex_points: number;        // 0 for any non-'played' status
  position_display: string | null;     // "T15", "MC", "WD", "" if no event match
  status: LineupResultStatus;
  message: string | null;              // optional human-readable note
}

export interface FetchScoresResponse {
  tournament_id: string;
  espn_event_id: string;
  season: number;
  proposed: ProposedResult[];
  // Summary counts for the banner UI; redundant with `proposed` but cheap.
  summary: {
    total: number;
    played: number;
    missed_cut: number;
    withdrew: number;
    did_not_play: number;
    manual_entry: number;
    fetch_failed: number;
  };
}

// Map of espn_id -> PlayerSeasonHistory (or null when fetch failed).
// Passed into mergeProposedResults from the orchestrator.
export type HistoryByEspnId = Map<string, PlayerSeasonHistory | null>;
