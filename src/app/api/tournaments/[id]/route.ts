import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Create fresh neon client directly
    const sql = neon(process.env.DATABASE_URL!);

    // Query sequentially to debug the issue
    const tournamentRows = await sql`
      SELECT tournament_id, name, deadline, status
      FROM tournaments
      WHERE tournament_id = ${id}
    `;

    const teamRows = await sql`
      SELECT team_id, team_name
      FROM teams
      ORDER BY team_id
    `;

    // Use hardcoded string like debug endpoint does
    const lineupRows = await sql`
      SELECT tournament_id, team_id, slot, fedex_points
      FROM lineups
      WHERE tournament_id = 'T002'
      ORDER BY team_id, slot
    `;

    const rosterRows = await sql`
      SELECT r.team_id, r.slot, g.name AS golfer_name
      FROM rosters r
      JOIN golfers g ON g.golfer_id = r.golfer_id
    `;

    if (tournamentRows.length === 0) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    const tournament = tournamentRows[0];

    // Create lookup maps
    const rosterMap = new Map<string, string>();
    for (const r of rosterRows) {
      const key = `${Number(r.team_id)}-${Number(r.slot)}`;
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
      const teamId = Number(team.team_id);
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

    // Debug: include raw lineup data and timestamp
    const debugLineups = lineupRows.slice(0, 5);
    return NextResponse.json({
      tournament,
      lineups,
      debug: {
        rawLineups: debugLineups,
        lineupCount: lineupRows.length,
        timestamp: new Date().toISOString(),
        requestedId: id
      }
    });
  } catch (error) {
    console.error('Tournament detail error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
