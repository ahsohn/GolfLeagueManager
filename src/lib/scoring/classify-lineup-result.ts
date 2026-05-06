import type { PlayerSeasonHistory } from '@/lib/egolfapi';
import { findEventResult } from './find-event-result';
import type { LineupResultStatus } from './types';

export function classifyLineupResult(
  history: PlayerSeasonHistory | null,
  espnEventId: string,
  espnId: string | null,
): LineupResultStatus {
  if (!espnId) return 'manual_entry';
  if (!history) return 'fetch_failed';
  const result = findEventResult(history, espnEventId);
  if (!result) return 'did_not_play';
  const pos = result.positionDisplay;
  if (pos === 'MC') return 'missed_cut';
  if (pos === 'WD' || pos === 'DQ') return 'withdrew';
  return 'played';
}
