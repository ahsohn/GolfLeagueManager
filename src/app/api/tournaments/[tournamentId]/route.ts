import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { unstable_noStore as noStore } from 'next/cache';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  noStore(); // Prevent caching
  try {
    const { tournamentId: id } = await params;

    // Query sequentially
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

    const lineupRows = await sql`
      SELECT tournament_id, team_id, slot, fedex_points
      FROM lineups
      WHERE tournament_id = ${id}
      ORDER BY team_id, slot
    `;

    const rosterRows = await sql`
      SELECT r.team_id, r.slot, g.name AS golfer_name, g.espn_id
      FROM rosters r
      JOIN golfers g ON g.golfer_id = r.golfer_id
    `;

    if (tournamentRows.length === 0) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    const tournament = tournamentRows[0];

    // Create lookup maps
    const rosterMap = new Map<string, { golfer_name: string; espn_id: string | null }>();
    for (const r of rosterRows) {
      const key = `${Number(r.team_id)}-${Number(r.slot)}`;
      rosterMap.set(key, { golfer_name: r.golfer_name as string, espn_id: (r.espn_id as string) || null });
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
        const rosterEntry = rosterMap.get(`${teamId}-${l.slot}`);
        return {
          slot: l.slot,
          golfer_name: rosterEntry?.golfer_name || 'Unknown',
          espn_id: rosterEntry?.espn_id || null,
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

    return NextResponse.json({ tournament, lineups });
  } catch (error) {
    console.error('Tournament detail error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
