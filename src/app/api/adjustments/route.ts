import { NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  noStore();
  try {
    const rows = await sql`
      SELECT
        a.id,
        a.timestamp,
        a.tournament_id,
        t.name as tournament_name,
        a.team_id,
        tm.team_name,
        a.old_slot,
        a.new_slot,
        a.old_points,
        a.new_points,
        a.note
      FROM admin_adjustments a
      LEFT JOIN tournaments t ON a.tournament_id = t.tournament_id
      LEFT JOIN teams tm ON a.team_id = tm.team_id
      ORDER BY a.timestamp DESC
    `;

    return NextResponse.json(rows);
  } catch (error) {
    console.error('Admin adjustments error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
