import { buildStandingsHistory, type StandingsHistoryRow } from '@/lib/standings-history';

const COLORS = ['#A', '#B', '#C'];

describe('buildStandingsHistory', () => {
  it('returns empty result when given no rows', () => {
    const result = buildStandingsHistory([], COLORS);
    expect(result).toEqual({ tournaments: [], teams: [] });
  });

  it('preserves tournament order from input (ordered by deadline asc)', () => {
    const rows: StandingsHistoryRow[] = [
      { tournament_id: 'T1', tournament_name: 'Open', deadline: '2026-01-01', team_id: 1, team_name: 'Alpha', points: 100 },
      { tournament_id: 'T1', tournament_name: 'Open', deadline: '2026-01-01', team_id: 2, team_name: 'Beta',  points: 50 },
      { tournament_id: 'T2', tournament_name: 'Masters', deadline: '2026-02-01', team_id: 1, team_name: 'Alpha', points: 25 },
      { tournament_id: 'T2', tournament_name: 'Masters', deadline: '2026-02-01', team_id: 2, team_name: 'Beta',  points: 100 },
    ];
    const result = buildStandingsHistory(rows, COLORS);
    expect(result.tournaments).toEqual(['Open', 'Masters']);
  });

  it('computes rankings based on cumulative points per tournament', () => {
    const rows: StandingsHistoryRow[] = [
      { tournament_id: 'T1', tournament_name: 'Open', deadline: '2026-01-01', team_id: 1, team_name: 'Alpha', points: 100 },
      { tournament_id: 'T1', tournament_name: 'Open', deadline: '2026-01-01', team_id: 2, team_name: 'Beta',  points: 50 },
      { tournament_id: 'T2', tournament_name: 'Masters', deadline: '2026-02-01', team_id: 1, team_name: 'Alpha', points: 25 },
      { tournament_id: 'T2', tournament_name: 'Masters', deadline: '2026-02-01', team_id: 2, team_name: 'Beta',  points: 100 },
    ];
    const result = buildStandingsHistory(rows, COLORS);
    const alpha = result.teams.find(t => t.team_id === 1)!;
    const beta  = result.teams.find(t => t.team_id === 2)!;
    expect(alpha.rankings).toEqual([1, 2]);
    expect(beta.rankings).toEqual([2, 1]);
  });

  it('assigns colors cyclically from the provided palette', () => {
    const rows: StandingsHistoryRow[] = [
      { tournament_id: 'T1', tournament_name: 'Open', deadline: '2026-01-01', team_id: 1, team_name: 'Alpha', points: 0 },
      { tournament_id: 'T1', tournament_name: 'Open', deadline: '2026-01-01', team_id: 2, team_name: 'Beta',  points: 0 },
      { tournament_id: 'T1', tournament_name: 'Open', deadline: '2026-01-01', team_id: 3, team_name: 'Gamma', points: 0 },
      { tournament_id: 'T1', tournament_name: 'Open', deadline: '2026-01-01', team_id: 4, team_name: 'Delta', points: 0 },
    ];
    const result = buildStandingsHistory(rows, ['#A', '#B', '#C']);
    expect(result.teams.map(t => t.color)).toEqual(['#A', '#B', '#C', '#A']);
  });

  it('handles ties in rankings (same rank for tied teams, next rank skips)', () => {
    const rows: StandingsHistoryRow[] = [
      { tournament_id: 'T1', tournament_name: 'Open', deadline: '2026-01-01', team_id: 1, team_name: 'Alpha', points: 100 },
      { tournament_id: 'T1', tournament_name: 'Open', deadline: '2026-01-01', team_id: 2, team_name: 'Beta',  points: 100 },
      { tournament_id: 'T1', tournament_name: 'Open', deadline: '2026-01-01', team_id: 3, team_name: 'Gamma', points: 50 },
    ];
    const result = buildStandingsHistory(rows, COLORS);
    const a = result.teams.find(t => t.team_id === 1)!;
    const b = result.teams.find(t => t.team_id === 2)!;
    const g = result.teams.find(t => t.team_id === 3)!;
    expect(a.rankings[0]).toBe(1);
    expect(b.rankings[0]).toBe(1);
    expect(g.rankings[0]).toBe(3);
  });
});
