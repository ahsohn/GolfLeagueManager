import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const rows = await sql`
      SELECT
        wl.id,
        wl.timestamp,
        wl.team_id,
        t.team_name,
        wl.dropped_golfer,
        wl.added_golfer,
        wl.slot
      FROM waiver_log wl
      LEFT JOIN teams t ON wl.team_id = t.team_id
      ORDER BY wl.timestamp DESC
    `;

    return NextResponse.json(rows);
  } catch (error) {
    console.error('Waiver history error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
