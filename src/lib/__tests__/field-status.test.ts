import {
  computeFieldStatuses,
  isFieldPublished,
} from '@/lib/field-status';
import type { Leaderboard } from '@/lib/egolfapi';

const roster = [
  { slot: 1, espn_id: '9478' },   // in field
  { slot: 2, espn_id: '8793' },   // not in field
  { slot: 3, espn_id: null },     // no espn id
];

describe('computeFieldStatuses', () => {
  it('marks golfers in the field as playing and absent ones as not_in_field', () => {
    const result = computeFieldStatuses(roster, new Set(['9478']), true);
    expect(result).toEqual([
      { slot: 1, status: 'playing' },
      { slot: 2, status: 'not_in_field' },
      { slot: 3, status: 'unknown' },
    ]);
  });

  it('returns unknown for every slot when the field is not published', () => {
    const result = computeFieldStatuses(roster, new Set(['9478']), false);
    expect(result.every((r) => r.status === 'unknown')).toBe(true);
  });

  it('returns unknown for a golfer with a null espn_id even when in-field ids exist', () => {
    const result = computeFieldStatuses([{ slot: 5, espn_id: null }], new Set(['1']), true);
    expect(result).toEqual([{ slot: 5, status: 'unknown' }]);
  });
});

function board(id: string, espnIds: string[]): Leaderboard {
  return {
    tournament: {
      id,
      name: '',
      isMajor: false,
      status: 'scheduled',
      startDate: null,
      endDate: null,
      numberOfRounds: 4,
      course: null,
      cut: null,
      notes: [],
    },
    entries: espnIds.map((espnId) => ({
      player: { espnId, displayName: '', shortName: null, normalizedName: '' },
      position: null,
      positionDisplay: '',
      tied: false,
      scoreToPar: null,
      scoreToParDisplay: null,
      totalStrokes: null,
      status: 'scheduled',
      notStarted: true,
      thru: null,
      thruDisplay: null,
      teeTime: null,
      rounds: [],
    })),
  };
}

describe('isFieldPublished', () => {
  it('is true when the board matches the event id and has entries', () => {
    expect(isFieldPublished(board('401001', ['9478']), '401001')).toBe(true);
  });

  it('is false when the board is null', () => {
    expect(isFieldPublished(null, '401001')).toBe(false);
  });

  it('is false when the board is for a different event (current-week fallback)', () => {
    expect(isFieldPublished(board('999999', ['9478']), '401001')).toBe(false);
  });

  it('is false when the board has no entries (field not announced yet)', () => {
    expect(isFieldPublished(board('401001', []), '401001')).toBe(false);
  });
});
