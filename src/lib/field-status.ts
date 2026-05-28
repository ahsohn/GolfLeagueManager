import type { Leaderboard } from '@/lib/egolfapi';

export type FieldStatus = 'playing' | 'not_in_field' | 'unknown';

export interface FieldStatusEntry {
  slot: number;
  status: FieldStatus;
}

/**
 * The field is "published" only when ESPN returned the board for THIS event
 * (id match guards against the current-week fallback) and it has entries.
 * Before tournament week ESPN returns no competitors, so this is false.
 */
export function isFieldPublished(
  board: Leaderboard | null,
  espnEventId: string,
): boolean {
  return (
    board !== null &&
    board.tournament.id === espnEventId &&
    board.entries.length > 0
  );
}

/**
 * Map each roster slot to a field status. Pure — no I/O.
 * `unknown` (rendered as no pill) when the field is unpublished or the golfer
 * has no espn_id; otherwise `playing` / `not_in_field` by set membership.
 */
export function computeFieldStatuses(
  roster: ReadonlyArray<{ slot: number; espn_id: string | null }>,
  fieldEspnIds: ReadonlySet<string>,
  fieldPublished: boolean,
): FieldStatusEntry[] {
  return roster.map(({ slot, espn_id }) => {
    if (!fieldPublished || espn_id === null) {
      return { slot, status: 'unknown' };
    }
    return {
      slot,
      status: fieldEspnIds.has(espn_id) ? 'playing' : 'not_in_field',
    };
  });
}
