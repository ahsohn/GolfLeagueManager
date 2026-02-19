import { NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  noStore(); // Opt out of Data Cache to ensure fresh data
  try {
    const rows = await sql`
      SELECT tournament_id, name, deadline, status
      FROM tournaments
      ORDER BY deadline DESC
    `;

    return NextResponse.json(rows);
  } catch (error) {
    console.error('Tournaments error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
