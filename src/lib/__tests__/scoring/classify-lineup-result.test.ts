import { classifyLineupResult } from '@/lib/scoring/classify-lineup-result';
import type { PlayerSeasonHistory } from '@/lib/egolfapi';

const player = {
  espnId: '9478',
  displayName: 'Scottie Scheffler',
  shortName: 'S. Scheffler',
  normalizedName: 'scottie scheffler',
};

const baseHistory: PlayerSeasonHistory = { player, season: 2026, results: [] };

describe('classifyLineupResult', () => {
  it('returns manual_entry when espn_id is missing', () => {
    expect(classifyLineupResult(null, '401001', null)).toBe('manual_entry');
  });

  it('returns fetch_failed when history is null but espn_id was present', () => {
    expect(classifyLineupResult(null, '401001', '9478')).toBe('fetch_failed');
  });

  it('returns did_not_play when history has no entry for this event', () => {
    expect(classifyLineupResult(baseHistory, '401001', '9478')).toBe('did_not_play');
  });

  it('returns missed_cut for positionDisplay "MC"', () => {
    const history = { ...baseHistory, results: [
      { player, eventId: '401001', eventName: 'X', positionDisplay: 'MC', fedexPoints: 0 },
    ]};
    expect(classifyLineupResult(history, '401001', '9478')).toBe('missed_cut');
  });

  it('returns withdrew for positionDisplay "WD"', () => {
    const history = { ...baseHistory, results: [
      { player, eventId: '401001', eventName: 'X', positionDisplay: 'WD', fedexPoints: 0 },
    ]};
    expect(classifyLineupResult(history, '401001', '9478')).toBe('withdrew');
  });

  it('returns played for any numeric position (with or without "T")', () => {
    for (const pos of ['1', 'T2', '15', 'T62']) {
      const history = { ...baseHistory, results: [
        { player, eventId: '401001', eventName: 'X', positionDisplay: pos, fedexPoints: 100 },
      ]};
      expect(classifyLineupResult(history, '401001', '9478')).toBe('played');
    }
  });

  it('treats DQ as withdrew (closest semantic)', () => {
    const history = { ...baseHistory, results: [
      { player, eventId: '401001', eventName: 'X', positionDisplay: 'DQ', fedexPoints: 0 },
    ]};
    expect(classifyLineupResult(history, '401001', '9478')).toBe('withdrew');
  });

  it('returns fetch_failed when fedexPoints is null (ESPN cupPoints stat absent)', () => {
    // Position is filled in (player finished) but ESPN hasn't published FedEx
    // points yet — distinct from a legitimate 0 (MC/WD).
    const history = { ...baseHistory, results: [
      { player, eventId: '401001', eventName: 'X', positionDisplay: 'T5', fedexPoints: null },
    ]};
    expect(classifyLineupResult(history, '401001', '9478')).toBe('fetch_failed');
  });
});
