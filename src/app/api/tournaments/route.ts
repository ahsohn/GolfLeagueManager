import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
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
