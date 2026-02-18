import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const { tournament_id, results } = await request.json();

    if (!tournament_id || !Array.isArray(results)) {
      return NextResponse.json(
        { error: 'tournament_id and results array required' },
        { status: 400 }
      );
    }

    // results format: [{ team_id: number, slot: number, fedex_points: number }]

    // Get current lineup state to determine which slots need times_used incremented
    const existingLineups = await sql`
      SELECT team_id, slot, fedex_points
      FROM lineups
      WHERE tournament_id = ${tournament_id}
    `;

    const existingMap = new Map(
      (existingLineups as { team_id: number; slot: number; fedex_points: number | null }[])
        .map((l) => [`${l.team_id}:${l.slot}`, l.fedex_points])
    );

    // Determine which slots are being scored for the first time (fedex_points was NULL)
    const slotsToIncrement = (results as { team_id: number; slot: number; fedex_points: number }[])
      .filter((r) => existingMap.get(`${r.team_id}:${r.slot}`) === null);

    // Run all updates in a transaction
    await sql.transaction([
      // Update fedex_points for each result
      ...results.map((r: { team_id: number; slot: number; fedex_points: number }) =>
        sql`
          UPDATE lineups
          SET fedex_points = ${r.fedex_points}
          WHERE tournament_id = ${tournament_id}
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
      // Recalculate standings for all teams
      sql`
        UPDATE standings s
        SET total_points = (
          SELECT COALESCE(SUM(fedex_points), 0)
          FROM lineups
          WHERE team_id = s.team_id
        )
      `,
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Admin results error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
