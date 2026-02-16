import { NextResponse } from 'next/server';
import { getSheetData, SHEET_NAMES } from '@/lib/sheets';
import { parseGolfers, parseRosters } from '@/lib/data';

// Disable caching to always fetch fresh data from Google Sheets
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [golfersData, rostersData] = await Promise.all([
      getSheetData(SHEET_NAMES.GOLFERS),
      getSheetData(SHEET_NAMES.ROSTERS),
    ]);

    const golfers = parseGolfers(golfersData);
    const rosters = parseRosters(rostersData);

    // Get all rostered golfer IDs
    const rosteredIds = new Set(rosters.map((r) => r.golfer_id));

    // Filter to unrostered golfers
    const available = golfers
      .filter((g) => !rosteredIds.has(g.golfer_id))
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json(available);
  } catch (error) {
    console.error('Available golfers error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
