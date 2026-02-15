import { SHEET_NAMES } from '../sheets';

describe('sheets', () => {
  it('exports correct sheet names', () => {
    expect(SHEET_NAMES).toEqual({
      TEAMS: 'Teams',
      GOLFERS: 'Golfers',
      ROSTERS: 'Rosters',
      TOURNAMENTS: 'Tournaments',
      LINEUPS: 'Lineups',
      STANDINGS: 'Standings',
      WAIVER_LOG: 'WaiverLog',
      SLOT_HISTORY: 'SlotHistory',
      CONFIG: 'Config',
    });
  });
});
