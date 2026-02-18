import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const rows = await sql`
      SELECT
        t.team_id,
        t.team_name,
        t.owner_email,
        COALESCE(s.total_points, 0) AS total_points
      FROM teams t
      LEFT JOIN standings s ON s.team_id = t.team_id
      ORDER BY total_points DESC
    `;

    return NextResponse.json(rows);
  } catch (error) {
    console.error('Standings error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
