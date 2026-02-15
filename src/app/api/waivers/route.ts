import { NextRequest, NextResponse } from 'next/server';
import {
  getSheetData,
  appendSheetRow,
  updateSheetRow,
  SHEET_NAMES,
} from '@/lib/sheets';
import { parseRosters, parseGolfers } from '@/lib/data';

export async function POST(request: NextRequest) {
  try {
    const { teamId, dropGolferId, addGolferId, slot } = await request.json();

    if (!teamId || !dropGolferId || !addGolferId || !slot) {
      return NextResponse.json(
        { error: 'teamId, dropGolferId, addGolferId, and slot required' },
        { status: 400 }
      );
    }

    const [rostersData, golfersData] = await Promise.all([
      getSheetData(SHEET_NAMES.ROSTERS),
      getSheetData(SHEET_NAMES.GOLFERS),
    ]);

    const rosters = parseRosters(rostersData);
    const golfers = parseGolfers(golfersData);

    // Validate drop golfer is on team's roster at the specified slot
    const dropEntry = rosters.find(
      (r) => r.team_id === teamId && r.golfer_id === dropGolferId && r.slot === slot
    );
    if (!dropEntry) {
      return NextResponse.json(
        { error: 'Golfer to drop is not on your roster at the specified slot' },
        { status: 400 }
      );
    }

    // Validate add golfer exists and is not rostered
    const addGolfer = golfers.find((g) => g.golfer_id === addGolferId);
    if (!addGolfer) {
      return NextResponse.json(
        { error: 'Golfer to add does not exist' },
        { status: 400 }
      );
    }

    const isRostered = rosters.some((r) => r.golfer_id === addGolferId);
    if (isRostered) {
      return NextResponse.json(
        { error: 'Golfer to add is already on a roster' },
        { status: 400 }
      );
    }

    // Find row index of roster entry to update (add 2 for header and 1-indexing)
    const dropRowIndex =
      rosters.findIndex(
        (r) => r.team_id === teamId && r.slot === slot
      ) + 2;

    // Update roster entry with new golfer, reset times_used to 0
    await updateSheetRow(SHEET_NAMES.ROSTERS, dropRowIndex, [
      teamId,
      slot,
      addGolferId,
      0, // Reset times_used for new golfer
    ]);

    // Log the waiver
    const dropGolferName =
      golfers.find((g) => g.golfer_id === dropGolferId)?.name ?? 'Unknown';
    await appendSheetRow(SHEET_NAMES.WAIVER_LOG, [
      new Date().toISOString(),
      teamId,
      dropGolferName,
      addGolfer.name,
      slot,
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Waiver error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
