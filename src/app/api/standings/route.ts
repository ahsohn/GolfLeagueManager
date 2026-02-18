import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Query teams and standings separately to avoid LEFT JOIN type mismatch issues
    const [teamRows, standingsRows] = await Promise.all([
      sql`SELECT team_id, team_name, owner_email FROM teams`,
      sql`SELECT team_id, total_points FROM standings`,
    ]);

    // Build a map of team_id -> total_points
    const standingsMap = new Map<number, number>();
    for (const s of standingsRows) {
      standingsMap.set(Number(s.team_id), Number(s.total_points) || 0);
    }

    // Merge and sort by points descending
    const result = teamRows
      .map((t) => ({
        team_id: t.team_id,
        team_name: t.team_name,
        owner_email: t.owner_email,
        total_points: standingsMap.get(Number(t.team_id)) || 0,
      }))
      .sort((a, b) => b.total_points - a.total_points);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Standings error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
