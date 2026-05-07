import { mergeProposedResults } from '@/lib/scoring/merge-proposed-results';
import type { HistoryByEspnId } from '@/lib/scoring/types';
import type { PlayerSeasonHistory } from '@/lib/egolfapi';

const playerA = { espnId: '9478', displayName: 'Scottie Scheffler', shortName: 'S. Scheffler', normalizedName: 'scottie scheffler' };
const playerB = { espnId: '5467', displayName: 'Rory McIlroy', shortName: 'R. McIlroy', normalizedName: 'rory mcilroy' };

const historyA: PlayerSeasonHistory = {
  player: playerA, season: 2026,
  results: [{ player: playerA, eventId: '401002', eventName: 'Genesis', positionDisplay: 'T5', fedexPoints: 220 }],
};
const historyB: PlayerSeasonHistory = {
  player: playerB, season: 2026,
  results: [], // didn't play
};

const lineups = [
  { team_id: 1, team_name: 'Aces', slot: 1, golfer_name: 'Scottie Scheffler', espn_id: '9478', fedex_points: null },
  { team_id: 1, team_name: 'Aces', slot: 4, golfer_name: 'Rory McIlroy',     espn_id: '5467', fedex_points: 0 },
  { team_id: 2, team_name: 'Birdies', slot: 2, golfer_name: 'Unknown',       espn_id: null,    fedex_points: null },
];

describe('mergeProposedResults', () => {
  it('builds a ProposedResult for each lineup row', () => {
    const histories: HistoryByEspnId = new Map([
      ['9478', historyA],
      ['5467', historyB],
    ]);
    const result = mergeProposedResults(lineups, histories, '401002');

    expect(result.proposed).toHaveLength(3);
    expect(result.summary.total).toBe(3);
  });

  it('populates fetched_fedex_points and position_display for played rows', () => {
    const histories: HistoryByEspnId = new Map([['9478', historyA], ['5467', historyB]]);
    const result = mergeProposedResults(lineups, histories, '401002');

    const scheffler = result.proposed.find((r) => r.espn_id === '9478')!;
    expect(scheffler.status).toBe('played');
    expect(scheffler.fetched_fedex_points).toBe(220);
    expect(scheffler.position_display).toBe('T5');
  });

  it('zeroes fetched_fedex_points for did_not_play rows', () => {
    const histories: HistoryByEspnId = new Map([['9478', historyA], ['5467', historyB]]);
    const result = mergeProposedResults(lineups, histories, '401002');

    const rory = result.proposed.find((r) => r.espn_id === '5467')!;
    expect(rory.status).toBe('did_not_play');
    expect(rory.fetched_fedex_points).toBe(0);
    expect(rory.position_display).toBeNull();
  });

  it('classifies rows with no espn_id as manual_entry', () => {
    const histories: HistoryByEspnId = new Map();
    const result = mergeProposedResults(lineups, histories, '401002');

    const unknown = result.proposed.find((r) => r.team_id === 2)!;
    expect(unknown.status).toBe('manual_entry');
  });

  it('classifies rows whose espn_id has a null entry in the map as fetch_failed', () => {
    const histories: HistoryByEspnId = new Map([['9478', null]]);
    const result = mergeProposedResults(lineups.slice(0, 1), histories, '401002');

    expect(result.proposed[0].status).toBe('fetch_failed');
  });

  it('counts each status correctly in summary', () => {
    const histories: HistoryByEspnId = new Map([['9478', historyA], ['5467', historyB]]);
    const result = mergeProposedResults(lineups, histories, '401002');

    expect(result.summary.played).toBe(1);
    expect(result.summary.did_not_play).toBe(1);
    expect(result.summary.manual_entry).toBe(1);
    expect(result.summary.missed_cut).toBe(0);
    expect(result.summary.withdrew).toBe(0);
    expect(result.summary.fetch_failed).toBe(0);
  });

  it('preserves current_fedex_points from the input lineup', () => {
    const histories: HistoryByEspnId = new Map([['9478', historyA], ['5467', historyB]]);
    const result = mergeProposedResults(lineups, histories, '401002');

    expect(result.proposed.find((r) => r.espn_id === '9478')!.current_fedex_points).toBeNull();
    expect(result.proposed.find((r) => r.espn_id === '5467')!.current_fedex_points).toBe(0);
  });

  it('populates position_display for missed_cut rows', () => {
    const mcHistory: PlayerSeasonHistory = {
      player: playerA, season: 2026,
      results: [{ player: playerA, eventId: '401002', eventName: 'Genesis', positionDisplay: 'MC', fedexPoints: 0 }],
    };
    const result = mergeProposedResults(
      [lineups[0]],
      new Map([['9478', mcHistory]]),
      '401002',
    );
    expect(result.proposed[0].status).toBe('missed_cut');
    expect(result.proposed[0].position_display).toBe('MC');
    expect(result.proposed[0].fetched_fedex_points).toBe(0);
  });

  it('populates position_display for withdrew rows', () => {
    const wdHistory: PlayerSeasonHistory = {
      player: playerA, season: 2026,
      results: [{ player: playerA, eventId: '401002', eventName: 'Genesis', positionDisplay: 'WD', fedexPoints: 0 }],
    };
    const result = mergeProposedResults(
      [lineups[0]],
      new Map([['9478', wdHistory]]),
      '401002',
    );
    expect(result.proposed[0].status).toBe('withdrew');
    expect(result.proposed[0].position_display).toBe('WD');
  });
});
