import { findEventResult } from '@/lib/scoring/find-event-result';
import type { PlayerSeasonHistory } from '@/lib/egolfapi';

const player = {
  espnId: '9478',
  displayName: 'Scottie Scheffler',
  shortName: 'S. Scheffler',
  normalizedName: 'scottie scheffler',
};

const history: PlayerSeasonHistory = {
  player,
  season: 2026,
  results: [
    { player, eventId: '401001', eventName: 'Sony Open', positionDisplay: 'T12', fedexPoints: 88 },
    { player, eventId: '401002', eventName: 'Genesis', positionDisplay: '1', fedexPoints: 700 },
  ],
};

describe('findEventResult', () => {
  it('returns the result matching the event id', () => {
    const result = findEventResult(history, '401002');
    expect(result?.fedexPoints).toBe(700);
    expect(result?.positionDisplay).toBe('1');
  });

  it('returns null when the event id is not in the history', () => {
    expect(findEventResult(history, '999999')).toBeNull();
  });

  it('returns null when history is null', () => {
    expect(findEventResult(null, '401002')).toBeNull();
  });

  it('compares event ids as strings (number coercion is a footgun)', () => {
    // ESPN event ids look numeric but are returned as strings.
    // We must not coerce; "0401001" and "401001" must NOT match.
    const result = findEventResult(history, '0401001');
    expect(result).toBeNull();
  });
});
