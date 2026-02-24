import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    // Fetch all lineups and calculate totals per team
    const allLineups = await sql`SELECT team_id, fedex_points FROM lineups`;

    const teamTotals = new Map<number, number>();
    for (const l of allLineups) {
      const tid = Number(l.team_id);
      teamTotals.set(tid, (teamTotals.get(tid) || 0) + (Number(l.fedex_points) || 0));
    }

    // Update each team's standings
    const updates: { team_id: number; total: number }[] = [];
    for (const [teamId, total] of teamTotals.entries()) {
      await sql`UPDATE standings SET total_points = ${total} WHERE team_id = ${teamId}`;
      updates.push({ team_id: teamId, total });
    }

    return NextResponse.json({
      success: true,
      message: 'Standings recalculated',
      updates: updates.sort((a, b) => b.total - a.total)
    });
  } catch (error) {
    console.error('Recalculate standings error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
