import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tournamentId = searchParams.get('tournamentId') || 'T002';

    // Query ALL lineups for this tournament
    const lineupRows = await sql`
      SELECT tournament_id, team_id, slot, fedex_points
      FROM lineups
      WHERE tournament_id = ${tournamentId}
      ORDER BY team_id, slot
    `;

    // Also get a count
    const countResult = await sql`
      SELECT COUNT(*) as count FROM lineups WHERE tournament_id = ${tournamentId}
    `;

    return NextResponse.json({
      tournamentId,
      totalRows: countResult[0]?.count,
      lineups: lineupRows,
    });
  } catch (error) {
    console.error('Debug lineups error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
