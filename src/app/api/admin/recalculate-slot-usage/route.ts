import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { unstable_noStore as noStore } from 'next/cache';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  noStore();

  try {
    // Calculate correct times_used from lineups table
    // A slot is "used" when it appears in a lineup for a scored tournament (fedex_points IS NOT NULL)
    const calculated = await sql`
      SELECT
        r.team_id,
        r.slot,
        r.times_used as current_times_used,
        COALESCE(l.actual_uses, 0) as calculated_times_used
      FROM rosters r
      LEFT JOIN (
        SELECT team_id, slot, COUNT(*) as actual_uses
        FROM lineups
        WHERE fedex_points IS NOT NULL
        GROUP BY team_id, slot
      ) l ON r.team_id = l.team_id AND r.slot = l.slot
      ORDER BY r.team_id, r.slot
    `;

    // Find discrepancies
    const discrepancies = calculated.filter(
      (row) => row.current_times_used !== row.calculated_times_used
    );

    return NextResponse.json({
      total_slots: calculated.length,
      discrepancies_found: discrepancies.length,
      discrepancies,
      message: discrepancies.length > 0
        ? 'Use POST to fix these discrepancies'
        : 'All slot counts are correct'
    });
  } catch (error) {
    console.error('Error calculating slot usage:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST() {
  noStore();

  try {
    // Update all rosters with correct times_used calculated from lineups
    await sql`
      UPDATE rosters r
      SET times_used = COALESCE(
        (SELECT COUNT(*)
         FROM lineups l
         WHERE l.team_id = r.team_id
           AND l.slot = r.slot
           AND l.fedex_points IS NOT NULL),
        0
      )
    `;

    // Fetch the updated values to confirm
    const updated = await sql`
      SELECT
        r.team_id,
        t.team_name,
        r.slot,
        r.times_used,
        g.name as golfer_name
      FROM rosters r
      JOIN teams t ON r.team_id = t.team_id
      JOIN golfers g ON r.golfer_id = g.golfer_id
      ORDER BY r.team_id, r.slot
    `;

    return NextResponse.json({
      success: true,
      message: 'All slot usage counts have been recalculated from lineup history',
      updated_rosters: updated
    });
  } catch (error) {
    console.error('Error fixing slot usage:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
