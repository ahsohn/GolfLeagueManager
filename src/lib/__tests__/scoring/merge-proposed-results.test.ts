import { mergeProposedResults } from '@/lib/scoring/merge-proposed-results';
import type { HistoryByEspnId } from '@/lib/scoring/types';
import type { LeaderboardEntry, PlayerSeasonHistory, PlayerStatus } from '@/lib/egolfapi';

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

  describe('leaderboard overlay (authoritative per-event FedEx points)', () => {
    const lbEntry = (
      espnId: string,
      cupPoints: number | null,
      status: PlayerStatus = 'active',
      positionDisplay = 'T5',
    ): LeaderboardEntry => ({
      player: { espnId, displayName: '', shortName: null, normalizedName: '' },
      position: null,
      positionDisplay,
      tied: false,
      scoreToPar: null,
      scoreToParDisplay: null,
      totalStrokes: null,
      cupPoints,
      status,
      notStarted: false,
      thru: null,
      thruDisplay: null,
      teeTime: null,
      rounds: [],
    });

    it('prefers leaderboard cupPoints over the stale player-history value', () => {
      // History reports 0 (the bug this fixes); leaderboard has the real 250.
      const staleHistory: PlayerSeasonHistory = {
        player: playerA, season: 2026,
        results: [{ player: playerA, eventId: '401002', eventName: 'Genesis', positionDisplay: 'T6', fedexPoints: 0 }],
      };
      const result = mergeProposedResults(
        [lineups[0]],
        new Map([['9478', staleHistory]]),
        '401002',
        new Map([['9478', lbEntry('9478', 250, 'active', 'T6')]]),
      );
      expect(result.proposed[0].status).toBe('played');
      expect(result.proposed[0].fetched_fedex_points).toBe(250);
      expect(result.proposed[0].position_display).toBe('T6');
    });

    it('falls back to history when the leaderboard cupPoints is unpublished (null)', () => {
      const result = mergeProposedResults(
        [lineups[0]],
        new Map([['9478', historyA]]),
        '401002',
        new Map([['9478', lbEntry('9478', null)]]),
      );
      expect(result.proposed[0].status).toBe('played');
      expect(result.proposed[0].fetched_fedex_points).toBe(220); // from historyA
    });

    it('maps a cut leaderboard entry to missed_cut with MC display and 0 points', () => {
      const result = mergeProposedResults(
        [lineups[0]],
        new Map(),
        '401002',
        new Map([['9478', lbEntry('9478', 0, 'cut')]]),
      );
      expect(result.proposed[0].status).toBe('missed_cut');
      expect(result.proposed[0].position_display).toBe('MC');
      expect(result.proposed[0].fetched_fedex_points).toBe(0);
    });

    it('maps a withdrawn leaderboard entry to withdrew', () => {
      const result = mergeProposedResults(
        [lineups[0]],
        new Map(),
        '401002',
        new Map([['9478', lbEntry('9478', 0, 'wd')]]),
      );
      expect(result.proposed[0].status).toBe('withdrew');
      expect(result.proposed[0].position_display).toBe('WD');
    });

    it('falls back to did_not_play when a golfer is absent from the leaderboard field', () => {
      const result = mergeProposedResults(
        [lineups[1]], // Rory, history with no event entry
        new Map([['5467', historyB]]),
        '401002',
        new Map([['9478', lbEntry('9478', 250)]]), // only Scheffler in field
      );
      expect(result.proposed[0].status).toBe('did_not_play');
      expect(result.proposed[0].fetched_fedex_points).toBe(0);
    });
  });
});
