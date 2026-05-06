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
): MergeResult {
  const proposed: ProposedResult[] = [];
  const summary = ZERO_SUMMARY();

  for (const row of lineups) {
    const history = row.espn_id ? historiesByEspnId.get(row.espn_id) ?? null : null;
    const status: LineupResultStatus = classifyLineupResult(history, espnEventId, row.espn_id);
    const event = findEventResult(history, espnEventId);

    proposed.push({
      team_id: row.team_id,
      team_name: row.team_name,
      slot: row.slot,
      golfer_name: row.golfer_name,
      espn_id: row.espn_id,
      current_fedex_points: row.fedex_points,
      fetched_fedex_points: status === 'played' ? event?.fedexPoints ?? 0 : 0,
      position_display: event?.positionDisplay ?? null,
      status,
      message: null,
    });

    summary.total += 1;
    summary[status] += 1;
  }

  return { proposed, summary };
}
