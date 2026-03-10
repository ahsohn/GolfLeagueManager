import { NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const TEAM_COLORS = [
  '#2E7D32', // green
  '#1565C0', // blue
  '#C62828', // red
  '#F9A825', // gold
  '#6A1B9A', // purple
  '#00838F', // teal
  '#EF6C00', // orange
  '#4527A0', // indigo
  '#00695C', // dark teal
  '#AD1457', // pink
  '#558B2F', // lime
  '#D84315', // deep orange
  '#37474F', // blue grey
];

interface TournamentPoints {
  tournament_id: string;
  tournament_name: string;
  deadline: string;
  team_id: number;
  team_name: string;
  points: number;
}

export async function GET() {
  noStore();
  try {
    // Get all completed tournaments with points per team
    const rows = await sql`
      SELECT
        t.tournament_id,
        t.name as tournament_name,
        t.deadline,
        tm.team_id,
        tm.team_name,
        COALESCE(SUM(l.fedex_points), 0) as points
      FROM tournaments t
      CROSS JOIN teams tm
      LEFT JOIN lineups l ON l.tournament_id = t.tournament_id AND l.team_id = tm.team_id
      WHERE t.status = 'closed'
      GROUP BY t.tournament_id, t.name, t.deadline, tm.team_id, tm.team_name
      ORDER BY t.deadline ASC, tm.team_id ASC
    ` as TournamentPoints[];

    if (rows.length === 0) {
      return NextResponse.json({ tournaments: [], teams: [] });
    }

    // Get unique tournaments in order
    const tournamentMap = new Map<string, string>();
    rows.forEach(row => {
      if (!tournamentMap.has(row.tournament_id)) {
        tournamentMap.set(row.tournament_id, row.tournament_name);
      }
    });
    const tournaments = Array.from(tournamentMap.values());

    // Get unique teams
    const teamMap = new Map<number, string>();
    rows.forEach(row => {
      if (!teamMap.has(row.team_id)) {
        teamMap.set(row.team_id, row.team_name);
      }
    });

    // Calculate cumulative points and rankings per tournament
    const teamIds = Array.from(teamMap.keys()).sort((a, b) => a - b);
    const cumulativePoints: Record<number, number> = {};
    teamIds.forEach(id => { cumulativePoints[id] = 0; });

    const rankingsPerTournament: Record<number, number[]> = {};
    teamIds.forEach(id => { rankingsPerTournament[id] = []; });

    let currentTournamentId = '';
    const tournamentPoints: Record<number, number> = {};

    rows.forEach((row, index) => {
      if (row.tournament_id !== currentTournamentId) {
        // New tournament - calculate rankings for previous if exists
        if (currentTournamentId !== '') {
          // Add points from previous tournament
          teamIds.forEach(id => {
            cumulativePoints[id] += (tournamentPoints[id] || 0);
          });

          // Calculate rankings based on cumulative points
          const sorted = teamIds
            .map(id => ({ id, points: cumulativePoints[id] }))
            .sort((a, b) => b.points - a.points);

          // Assign ranks (handle ties)
          let rank = 1;
          sorted.forEach((team, idx) => {
            if (idx > 0 && team.points < sorted[idx - 1].points) {
              rank = idx + 1;
            }
            rankingsPerTournament[team.id].push(rank);
          });
        }

        currentTournamentId = row.tournament_id;
        teamIds.forEach(id => { tournamentPoints[id] = 0; });
      }

      tournamentPoints[row.team_id] = Number(row.points);

      // Handle last tournament
      if (index === rows.length - 1) {
        teamIds.forEach(id => {
          cumulativePoints[id] += (tournamentPoints[id] || 0);
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
      }
    });

    // Build response
    const teams = teamIds.map((id, index) => ({
      team_id: id,
      team_name: teamMap.get(id) || '',
      color: TEAM_COLORS[index % TEAM_COLORS.length],
      rankings: rankingsPerTournament[id],
    }));

    return NextResponse.json({ tournaments, teams });
  } catch (error) {
    console.error('Standings history error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
