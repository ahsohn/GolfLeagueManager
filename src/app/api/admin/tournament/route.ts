import { NextRequest, NextResponse } from 'next/server';
import { getSheetData, appendSheetRow, updateSheetRow, SHEET_NAMES } from '@/lib/sheets';
import { parseTournaments } from '@/lib/data';

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

      await appendSheetRow(SHEET_NAMES.TOURNAMENTS, [
        tournament_id,
        name,
        deadline,
        status || 'open',
      ]);

      return NextResponse.json({ success: true });
    }

    if (action === 'update') {
      if (!tournament_id) {
        return NextResponse.json(
          { error: 'tournament_id required' },
          { status: 400 }
        );
      }

      const tournamentsData = await getSheetData(SHEET_NAMES.TOURNAMENTS);
      const tournaments = parseTournaments(tournamentsData);
      const rowIndex = tournaments.findIndex(
        (t) => t.tournament_id === tournament_id
      );

      if (rowIndex === -1) {
        return NextResponse.json(
          { error: 'Tournament not found' },
          { status: 404 }
        );
      }

      const current = tournaments[rowIndex];
      await updateSheetRow(SHEET_NAMES.TOURNAMENTS, rowIndex + 2, [
        tournament_id,
        name || current.name,
        deadline || current.deadline,
        status || current.status,
      ]);

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Admin tournament error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
