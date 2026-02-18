import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tournament_id, results } = body;

    if (!tournament_id || !Array.isArray(results)) {
      return NextResponse.json(
        { error: 'tournament_id and results array required' },
        { status: 400 }
      );
    }

    // Parse tournament_id and results with explicit integer types
    const tournamentId = String(tournament_id);
    const parsedResults = results.map((r: { team_id: number; slot: number; fedex_points: number }) => ({
      team_id: parseInt(String(r.team_id), 10),
      slot: parseInt(String(r.slot), 10),
      fedex_points: parseInt(String(r.fedex_points), 10),
    }));

    // Get current lineup state to determine which slots need times_used incremented
    const existingLineups = await sql`
      SELECT team_id, slot, fedex_points
      FROM lineups
      WHERE tournament_id = ${tournamentId}
    `;

    const existingMap = new Map(
      (existingLineups as { team_id: number; slot: number; fedex_points: number | null }[])
        .map((l) => [`${Number(l.team_id)}:${Number(l.slot)}`, l.fedex_points])
    );

    // Determine which slots are being scored for the first time (fedex_points was NULL)
    const slotsToIncrement = parsedResults.filter(
      (r) => existingMap.get(`${r.team_id}:${r.slot}`) === null
    );

    // Run all updates in a transaction
    await sql.transaction([
      // Update fedex_points for each result
      ...parsedResults.map((r) =>
        sql`
          UPDATE lineups
          SET fedex_points = ${r.fedex_points}
          WHERE tournament_id = ${tournamentId}
            AND team_id = ${r.team_id}
            AND slot = ${r.slot}
        `
      ),
      // Increment times_used for newly-scored slots
      ...slotsToIncrement.map((r) =>
        sql`
          UPDATE rosters
          SET times_used = times_used + 1
          WHERE team_id = ${r.team_id} AND slot = ${r.slot}
        `
      ),
    ]);

    // Recalculate standings separately to avoid type mismatch in subquery
    const allLineups = await sql`SELECT team_id, fedex_points FROM lineups`;
    const teamTotals = new Map<number, number>();
    for (const l of allLineups) {
      const tid = Number(l.team_id);
      teamTotals.set(tid, (teamTotals.get(tid) || 0) + (Number(l.fedex_points) || 0));
    }

    // Update each team's standings
    const teamEntries = Array.from(teamTotals.entries());
    for (const entry of teamEntries) {
      const teamId = entry[0];
      const total = entry[1];
      await sql`UPDATE standings SET total_points = ${total} WHERE team_id = ${teamId}`;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Admin results error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
