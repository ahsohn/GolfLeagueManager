import { NextRequest, NextResponse } from 'next/server';
import { getSheetData, SHEET_NAMES } from '@/lib/sheets';
import { parseRosters, parseGolfers } from '@/lib/data';
import { RosterWithGolfers } from '@/types';

// Disable caching to always fetch fresh data from Google Sheets
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { teamId } = await params;
    const teamIdNum = parseInt(teamId, 10);

    if (isNaN(teamIdNum)) {
      return NextResponse.json({ error: 'Invalid team ID' }, { status: 400 });
    }

    const [rostersData, golfersData] = await Promise.all([
      getSheetData(SHEET_NAMES.ROSTERS),
      getSheetData(SHEET_NAMES.GOLFERS),
    ]);

    const rosters = parseRosters(rostersData);
    const golfers = parseGolfers(golfersData);

    const teamRoster = rosters
      .filter((r) => r.team_id === teamIdNum)
      .map((r): RosterWithGolfers => ({
        ...r,
        golfer_name:
          golfers.find((g) => g.golfer_id === r.golfer_id)?.name ?? 'Unknown',
      }))
      .sort((a, b) => a.slot - b.slot);

    return NextResponse.json(teamRoster);
  } catch (error) {
    console.error('Roster error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
