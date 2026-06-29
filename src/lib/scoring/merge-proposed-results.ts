import type { LeaderboardEntry } from '@/lib/egolfapi';
import { classifyLineupResult } from './classify-lineup-result';
import { findEventResult } from './find-event-result';
import type {
  HistoryByEspnId,
  LineupResultStatus,
  LineupRow,
  MergeResult,
  ProposedResult,
  SummaryCountsByStatus,
} from './types';

export type { LineupRow, MergeResult };

// Map of espn_id -> the player's entry in this event's leaderboard.
export type LeaderboardByEspnId = Map<string, LeaderboardEntry>;

// Derive a result from the event leaderboard, the authoritative source for
// per-event FedEx points. Returns null when the leaderboard can't decide
// (player absent, or cupPoints not yet published) so the caller falls back to
// the player-history classification.
function resultFromLeaderboard(
  entry: LeaderboardEntry | null,
): { status: LineupResultStatus; fetched_fedex_points: number; position_display: string } | null {
  if (!entry || entry.cupPoints === null) return null;
  switch (entry.status) {
    case 'cut':
      return { status: 'missed_cut', fetched_fedex_points: 0, position_display: 'MC' };
    case 'wd':
      return { status: 'withdrew', fetched_fedex_points: 0, position_display: 'WD' };
    case 'dq':
      return { status: 'withdrew', fetched_fedex_points: 0, position_display: 'DQ' };
    case 'active':
      return {
        status: 'played',
        fetched_fedex_points: entry.cupPoints,
        position_display: entry.positionDisplay,
      };
    default:
      // 'scheduled' or anything unexpected — defer to history-based classification.
      return null;
  }
}

const ZERO_SUMMARY = (): SummaryCountsByStatus => ({
  total: 0,
  played: 0,
  missed_cut: 0,
  withdrew: 0,
  did_not_play: 0,
  manual_entry: 0,
  fetch_failed: 0,
});

export function mergeProposedResults(
  lineups: LineupRow[],
  historiesByEspnId: HistoryByEspnId,
  espnEventId: string,
  leaderboardByEspnId: LeaderboardByEspnId = new Map(),
): MergeResult {
  const proposed: ProposedResult[] = [];
  const summary = ZERO_SUMMARY();

  for (const row of lineups) {
    // Prefer the event leaderboard — it publishes per-event FedEx points
    // immediately, whereas the player-history endpoint reports cupPoints: 0
    // for the first hours/days after an event finishes. Fall back to history
    // when the leaderboard has no published result for this golfer.
    const lbEntry = row.espn_id ? leaderboardByEspnId.get(row.espn_id) ?? null : null;
    const fromLb = resultFromLeaderboard(lbEntry);

    let status: LineupResultStatus;
    let fetched_fedex_points: number;
    let position_display: string | null;

    if (fromLb) {
      status = fromLb.status;
      fetched_fedex_points = fromLb.fetched_fedex_points;
      position_display = fromLb.position_display;
    } else {
      const history = row.espn_id ? historiesByEspnId.get(row.espn_id) ?? null : null;
      status = classifyLineupResult(history, espnEventId, row.espn_id);
      const event = findEventResult(history, espnEventId);
      fetched_fedex_points = status === 'played' ? event?.fedexPoints ?? 0 : 0;
      position_display = event?.positionDisplay ?? null;
    }

    proposed.push({
      team_id: row.team_id,
      team_name: row.team_name,
      slot: row.slot,
      golfer_name: row.golfer_name,
      espn_id: row.espn_id,
      current_fedex_points: row.fedex_points,
      fetched_fedex_points,
      position_display,
      status,
      message: null,
    });

    summary.total += 1;
    summary[status] += 1;
  }

  return { proposed, summary };
}
