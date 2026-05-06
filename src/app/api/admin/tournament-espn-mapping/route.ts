import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const { tournament_id, espn_event_id, season } = await request.json();

    if (!tournament_id || !espn_event_id || !Number.isInteger(season)) {
      return NextResponse.json(
        { error: 'tournament_id, espn_event_id, and integer season required' },
        { status: 400 },
      );
    }

    const rows = await sql`SELECT 1 FROM tournaments WHERE tournament_id = ${tournament_id}`;
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    await sql`
      UPDATE tournaments
      SET espn_event_id = ${espn_event_id}, season = ${season}
      WHERE tournament_id = ${tournament_id}
    `;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (typeof error?.message === 'string' && error.message.includes('duplicate key')) {
      return NextResponse.json(
        { error: 'That ESPN event id is already mapped to another tournament' },
        { status: 409 },
      );
    }
    console.error('tournament-espn-mapping error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
