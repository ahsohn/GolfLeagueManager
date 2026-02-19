import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Query tournament, teams, lineups, and rosters separately to avoid JOIN issues
    // Log the tournament ID being queried
    console.log('Tournament detail API - querying tournament_id:', JSON.stringify(id), 'type:', typeof id);

    const [tournamentRows, teamRows, lineupRows, rosterRows] = await Promise.all([
      sql`
        SELECT tournament_id, name, deadline, status
        FROM tournaments
        WHERE tournament_id = ${id}
      `,
      sql`
        SELECT team_id, team_name
        FROM teams
        ORDER BY team_id
      `,
      sql`
        SELECT team_id, slot, fedex_points
        FROM lineups
        WHERE tournament_id = ${id}
      `,
      sql`
        SELECT r.team_id, r.slot, g.name AS golfer_name
        FROM rosters r
        JOIN golfers g ON g.golfer_id = r.golfer_id
      `,
    ]);

    // Log what we found
    console.log('Tournament detail API - found lineups:', lineupRows.length, 'rows');
    console.log('Tournament detail API - lineup team_ids:', lineupRows.map(l => l.team_id));

    if (tournamentRows.length === 0) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    const tournament = tournamentRows[0];

    // Create lookup maps
    const rosterMap = new Map<string, string>();
    for (const r of rosterRows) {
      const key = `${r.team_id}-${r.slot}`;
      rosterMap.set(key, r.golfer_name as string);
    }

    // Group lineups by team
    const lineupsByTeam = new Map<number, { slot: number; fedex_points: number | null }[]>();
    for (const l of lineupRows) {
      const teamId = Number(l.team_id);
      if (!lineupsByTeam.has(teamId)) {
        lineupsByTeam.set(teamId, []);
      }
      lineupsByTeam.get(teamId)!.push({
        slot: Number(l.slot),
        fedex_points: l.fedex_points as number | null,
      });
    }

    // Build final lineup structure
    const lineups = teamRows.map((team) => {
      const teamId = team.team_id as number;
      const teamLineups = lineupsByTeam.get(teamId) || [];

      const lineup = teamLineups.map((l) => {
        const golferName = rosterMap.get(`${teamId}-${l.slot}`) || 'Unknown';
        return {
          slot: l.slot,
          golfer_name: golferName,
          fedex_points: l.fedex_points,
        };
      });

      return {
        team_id: teamId,
        team_name: team.team_name as string,
        lineup,
        total_points: lineup.reduce((sum, l) => sum + (l.fedex_points ?? 0), 0),
      };
    });

    return NextResponse.json({
      tournament,
      lineups,
      _debug: {
        tournamentId: id,
        lineupRowsCount: lineupRows.length,
        lineupTeamIds: Array.from(new Set(lineupRows.map(l => l.team_id))),
      }
    });
  } catch (error) {
    console.error('Tournament detail error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
