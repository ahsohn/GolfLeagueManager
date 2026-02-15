import {
  validateLineupSelection,
  getDefaultLineup,
  canUseSlot,
} from '../lineup-validator';
import { RosterEntry, LineupEntry } from '@/types';

describe('canUseSlot', () => {
  it('returns true when slot has fewer than 8 uses', () => {
    const roster: RosterEntry = {
      team_id: 1,
      slot: 1,
      golfer_id: 101,
      times_used: 7,
    };
    expect(canUseSlot(roster)).toBe(true);
  });

  it('returns false when slot has 8 uses', () => {
    const roster: RosterEntry = {
      team_id: 1,
      slot: 1,
      golfer_id: 101,
      times_used: 8,
    };
    expect(canUseSlot(roster)).toBe(false);
  });
});

describe('validateLineupSelection', () => {
  const roster: RosterEntry[] = [
    { team_id: 1, slot: 1, golfer_id: 101, times_used: 3 },
    { team_id: 1, slot: 2, golfer_id: 102, times_used: 8 },
    { team_id: 1, slot: 3, golfer_id: 103, times_used: 0 },
    { team_id: 1, slot: 4, golfer_id: 104, times_used: 5 },
    { team_id: 1, slot: 5, golfer_id: 105, times_used: 2 },
  ];

  it('returns valid for 4 eligible slots', () => {
    const result = validateLineupSelection([1, 3, 4, 5], roster);
    expect(result.valid).toBe(true);
  });

  it('returns invalid when selecting slot with 8 uses', () => {
    const result = validateLineupSelection([1, 2, 3, 4], roster);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Slot 2');
  });

  it('returns invalid when not selecting exactly 4 slots', () => {
    const result = validateLineupSelection([1, 3, 4], roster);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('4');
  });

  it('returns invalid when selecting slot not on roster', () => {
    const result = validateLineupSelection([1, 3, 4, 99], roster);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('not on roster');
  });
});

describe('getDefaultLineup', () => {
  const roster: RosterEntry[] = [
    { team_id: 1, slot: 1, golfer_id: 101, times_used: 3 },
    { team_id: 1, slot: 2, golfer_id: 102, times_used: 8 },
    { team_id: 1, slot: 3, golfer_id: 103, times_used: 0 },
    { team_id: 1, slot: 4, golfer_id: 104, times_used: 5 },
    { team_id: 1, slot: 5, golfer_id: 105, times_used: 2 },
  ];

  it('returns previous lineup slots when all still eligible', () => {
    const previousLineup: LineupEntry[] = [
      { tournament_id: 'T001', team_id: 1, slot: 1, fedex_points: null },
      { tournament_id: 'T001', team_id: 1, slot: 3, fedex_points: null },
      { tournament_id: 'T001', team_id: 1, slot: 4, fedex_points: null },
      { tournament_id: 'T001', team_id: 1, slot: 5, fedex_points: null },
    ];

    const defaults = getDefaultLineup(roster, previousLineup);
    expect(defaults).toEqual([1, 3, 4, 5]);
  });

  it('substitutes ineligible slots with next by slot number', () => {
    const previousLineup: LineupEntry[] = [
      { tournament_id: 'T001', team_id: 1, slot: 1, fedex_points: null },
      { tournament_id: 'T001', team_id: 1, slot: 2, fedex_points: null }, // 8 uses
      { tournament_id: 'T001', team_id: 1, slot: 4, fedex_points: null },
      { tournament_id: 'T001', team_id: 1, slot: 5, fedex_points: null },
    ];

    const defaults = getDefaultLineup(roster, previousLineup);
    // slot 2 is ineligible, should be replaced by slot 3
    expect(defaults).toContain(3);
    expect(defaults).not.toContain(2);
  });

  it('returns top 4 eligible slots when no previous lineup (first tournament)', () => {
    const defaults = getDefaultLineup(roster, []);
    // Top 4 eligible: slots 1, 3, 4, 5 (slot 2 has 8 uses)
    expect(defaults).toEqual([1, 3, 4, 5]);
  });
});
