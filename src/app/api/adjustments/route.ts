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
        g_old.name as old_golfer_name,
        g_new.name as new_golfer_name,
        a.old_points,
        a.new_points,
        a.note
      FROM admin_adjustments a
      LEFT JOIN tournaments t ON a.tournament_id = t.tournament_id
      LEFT JOIN teams tm ON a.team_id = tm.team_id
      LEFT JOIN rosters r_old ON a.team_id = r_old.team_id AND a.old_slot = r_old.slot
      LEFT JOIN golfers g_old ON r_old.golfer_id = g_old.golfer_id
      LEFT JOIN rosters r_new ON a.team_id = r_new.team_id AND a.new_slot = r_new.slot
      LEFT JOIN golfers g_new ON r_new.golfer_id = g_new.golfer_id
      ORDER BY a.timestamp DESC
    `;

    return NextResponse.json(rows);
  } catch (error) {
    console.error('Admin adjustments error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
