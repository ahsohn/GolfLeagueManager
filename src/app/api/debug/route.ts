import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  // Use shared db client like tournament route does
  const allT002 = await sql`
    SELECT team_id, slot, fedex_points
    FROM lineups
    WHERE tournament_id = 'T002'
    ORDER BY team_id, slot
  `;

  // Count nulls vs non-nulls
  const nullCount = allT002.filter(r => r.fedex_points === null).length;
  const nonNullCount = allT002.filter(r => r.fedex_points !== null).length;

  return NextResponse.json({
    total_records: allT002.length,
    null_count: nullCount,
    non_null_count: nonNullCount,
    sample_records: allT002.slice(0, 10),
    timestamp: new Date().toISOString()
  });
}
