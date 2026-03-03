import { NextRequest, NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  noStore();
  try {
    const { teamId } = await params;
    const teamIdNum = parseInt(teamId, 10);

    if (isNaN(teamIdNum)) {
      return NextResponse.json({ error: 'Invalid team ID' }, { status: 400 });
    }

    const rows = await sql`
      SELECT
        r.team_id,
        r.slot,
        r.golfer_id,
        r.times_used,
        g.name AS golfer_name
      FROM rosters r
      JOIN golfers g ON g.golfer_id = r.golfer_id
      WHERE r.team_id = ${teamIdNum}
      ORDER BY r.slot
    `;

    return NextResponse.json(rows);
  } catch (error) {
    console.error('Roster error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
