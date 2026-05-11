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
  // ESPN returned a finishing position but the cupPoints stat hadn't been
  // published — treat as fetch_failed so the admin retries (cache layer will
  // also refetch automatically on next pull).
  if (result.fedexPoints === null) return 'fetch_failed';
  return 'played';
}
