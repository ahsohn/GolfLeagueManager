import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const { action, tournament_id, name, deadline, status } = await request.json();

    if (action === 'create') {
      if (!tournament_id || !name || !deadline) {
        return NextResponse.json(
          { error: 'tournament_id, name, and deadline required' },
          { status: 400 }
        );
      }

      await sql`
        INSERT INTO tournaments (tournament_id, name, deadline, status)
        VALUES (${tournament_id}, ${name}, ${deadline}, ${status ?? 'open'})
      `;

      return NextResponse.json({ success: true });
    }

    if (action === 'update') {
      if (!tournament_id) {
        return NextResponse.json({ error: 'tournament_id required' }, { status: 400 });
      }

      const rows = await sql`SELECT tournament_id, name, deadline, status FROM tournaments WHERE tournament_id = ${tournament_id}`;
      if (rows.length === 0) {
        return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
      }

      const current = rows[0];
      await sql`
        UPDATE tournaments
        SET
          name     = ${name     ?? current.name},
          deadline = ${deadline ?? current.deadline},
          status   = ${status   ?? current.status}
        WHERE tournament_id = ${tournament_id}
      `;

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Admin tournament error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
