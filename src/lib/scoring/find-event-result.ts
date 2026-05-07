import type { PlayerEventResult, PlayerSeasonHistory } from '@/lib/egolfapi';

export function findEventResult(
  history: PlayerSeasonHistory | null,
  espnEventId: string,
): PlayerEventResult | null {
  if (!history) return null;
  for (const result of history.results) {
    if (result.eventId === espnEventId) return result;
  }
  return null;
}
