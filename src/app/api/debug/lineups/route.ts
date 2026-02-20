import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tournamentId = searchParams.get('tournament_id') || 'T002';

    // Get raw lineups
    const lineupRows = await sql`
      SELECT tournament_id, team_id, slot, fedex_points
      FROM lineups
      WHERE tournament_id = ${tournamentId}
      ORDER BY team_id, slot
    `;

    // Get distinct teams with lineups
    const distinctTeams = await sql`
      SELECT DISTINCT team_id
      FROM lineups
      WHERE tournament_id = ${tournamentId}
      ORDER BY team_id
    `;

    // Get count per team
    const countPerTeam = await sql`
      SELECT team_id, COUNT(*) as count
      FROM lineups
      WHERE tournament_id = ${tournamentId}
      GROUP BY team_id
      ORDER BY team_id
    `;

    // Filter to teams 5 and 7
    const teams5and7 = lineupRows.filter(
      (r) => Number(r.team_id) === 5 || Number(r.team_id) === 7
    );

    return NextResponse.json({
      tournamentId,
      totalRows: lineupRows.length,
      distinctTeams: distinctTeams.map((t) => t.team_id),
      countPerTeam,
      teams5and7,
      rawFirst10: lineupRows.slice(0, 10),
      team5Rows: lineupRows.filter((r) => Number(r.team_id) === 5),
      team7Rows: lineupRows.filter((r) => Number(r.team_id) === 7),
    });
  } catch (error) {
    console.error('Debug error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
