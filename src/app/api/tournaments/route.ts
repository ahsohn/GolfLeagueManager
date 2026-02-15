import { NextResponse } from 'next/server';
import { getSheetData, SHEET_NAMES } from '@/lib/sheets';
import { parseTournaments } from '@/lib/data';

export async function GET() {
  try {
    const data = await getSheetData(SHEET_NAMES.TOURNAMENTS);
    const tournaments = parseTournaments(data);

    // Sort by deadline descending (most recent first)
    tournaments.sort(
      (a, b) => new Date(b.deadline).getTime() - new Date(a.deadline).getTime()
    );

    return NextResponse.json(tournaments);
  } catch (error) {
    console.error('Tournaments error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
