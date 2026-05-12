export interface StandingsHistoryRow {
  tournament_id: string;
  tournament_name: string;
  deadline: string;
  team_id: number;
  team_name: string;
  points: number | string;
}

export interface StandingsHistoryTeam {
  team_id: number;
  team_name: string;
  color: string;
  rankings: number[];
  cumulative_points: number[];
}

export interface StandingsHistoryResult {
  tournaments: string[];
  teams: StandingsHistoryTeam[];
}

export function buildStandingsHistory(
  rows: StandingsHistoryRow[],
  palette: string[],
): StandingsHistoryResult {
  if (rows.length === 0) {
    return { tournaments: [], teams: [] };
  }

  const tournamentMap = new Map<string, string>();
  rows.forEach(row => {
    if (!tournamentMap.has(row.tournament_id)) {
      tournamentMap.set(row.tournament_id, row.tournament_name);
    }
  });
  const tournaments = Array.from(tournamentMap.values());

  const teamMap = new Map<number, string>();
  rows.forEach(row => {
    if (!teamMap.has(row.team_id)) {
      teamMap.set(row.team_id, row.team_name);
    }
  });

  const teamIds = Array.from(teamMap.keys()).sort((a, b) => a - b);

  const cumulativePoints: Record<number, number> = {};
  const rankingsPerTournament: Record<number, number[]> = {};
  const cumulativePointsPerTournament: Record<number, number[]> = {};
  teamIds.forEach(id => {
    cumulativePoints[id] = 0;
    rankingsPerTournament[id] = [];
    cumulativePointsPerTournament[id] = [];
  });

  const tournamentPoints: Record<number, number> = {};
  let currentTournamentId = '';

  const flushTournament = () => {
    teamIds.forEach(id => {
      cumulativePoints[id] += (tournamentPoints[id] || 0);
      cumulativePointsPerTournament[id].push(cumulativePoints[id]);
    });
    const sorted = teamIds
      .map(id => ({ id, points: cumulativePoints[id] }))
      .sort((a, b) => b.points - a.points);
    let rank = 1;
    sorted.forEach((team, idx) => {
      if (idx > 0 && team.points < sorted[idx - 1].points) {
        rank = idx + 1;
      }
      rankingsPerTournament[team.id].push(rank);
    });
  };

  rows.forEach((row, index) => {
    if (row.tournament_id !== currentTournamentId) {
      if (currentTournamentId !== '') flushTournament();
      currentTournamentId = row.tournament_id;
      teamIds.forEach(id => { tournamentPoints[id] = 0; });
    }
    tournamentPoints[row.team_id] = Number(row.points);
    if (index === rows.length - 1) flushTournament();
  });

  const teams: StandingsHistoryTeam[] = teamIds.map((id, index) => ({
    team_id: id,
    team_name: teamMap.get(id) || '',
    color: palette[index % palette.length],
    rankings: rankingsPerTournament[id],
    cumulative_points: cumulativePointsPerTournament[id],
  }));

  return { tournaments, teams };
}
