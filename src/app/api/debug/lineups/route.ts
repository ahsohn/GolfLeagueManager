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

    // Check rosters for teams 5 and 7
    const rosterRows = await sql`
      SELECT r.team_id, r.slot, g.name AS golfer_name
      FROM rosters r
      JOIN golfers g ON g.golfer_id = r.golfer_id
      WHERE r.team_id IN (5, 7)
      ORDER BY r.team_id, r.slot
    `;

    // Build roster map like the tournament API does
    const rosterMap = new Map<string, string>();
    for (const r of rosterRows) {
      const key = `${r.team_id}-${r.slot}`;
      rosterMap.set(key, r.golfer_name as string);
    }

    // Check what keys exist for teams 5 and 7
    const team5Keys = Array.from(rosterMap.keys()).filter(k => k.startsWith('5-'));
    const team7Keys = Array.from(rosterMap.keys()).filter(k => k.startsWith('7-'));

    const dbUrl = process.env.DATABASE_URL || '';
    const urlHost = dbUrl.match(/@([^/]+)/)?.[1] || 'unknown';

    return NextResponse.json({
      dbHost: urlHost,
      timestamp: new Date().toISOString(),
      tournamentId,
      totalRows: lineupRows.length,
      distinctTeams: distinctTeams.map((t) => t.team_id),
      countPerTeam,
      teams5and7,
      team5Rows: lineupRows.filter((r) => Number(r.team_id) === 5),
      team7Rows: lineupRows.filter((r) => Number(r.team_id) === 7),
    });
  } catch (error) {
    console.error('Debug error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
