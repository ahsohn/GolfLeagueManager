import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const rows = await sql`
      SELECT golfer_id, name
      FROM golfers
      WHERE golfer_id NOT IN (SELECT golfer_id FROM rosters)
      ORDER BY name
    `;

    return NextResponse.json(rows);
  } catch (error) {
    console.error('Available golfers error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
