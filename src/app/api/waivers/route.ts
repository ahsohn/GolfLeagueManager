import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Explicit integer parsing to avoid type mismatch issues
    const teamId = parseInt(String(body.teamId), 10);
    const dropGolferId = parseInt(String(body.dropGolferId), 10);
    const addGolferId = parseInt(String(body.addGolferId), 10);
    const slot = parseInt(String(body.slot), 10);

    if (isNaN(teamId) || isNaN(dropGolferId) || isNaN(addGolferId) || isNaN(slot)) {
      return NextResponse.json(
        { error: 'teamId, dropGolferId, addGolferId, and slot required' },
        { status: 400 }
      );
    }

    // Validate drop golfer is on team's roster at the specified slot
    const dropRows = await sql`
      SELECT golfer_id FROM rosters
      WHERE team_id = ${teamId} AND golfer_id = ${dropGolferId} AND slot = ${slot}
    `;
    if (dropRows.length === 0) {
      return NextResponse.json(
        { error: 'Golfer to drop is not on your roster at the specified slot' },
        { status: 400 }
      );
    }

    // Validate add golfer exists and is not rostered
    const [addGolferRows, rosteredRows] = await Promise.all([
      sql`SELECT golfer_id, name FROM golfers WHERE golfer_id = ${addGolferId}`,
      sql`SELECT golfer_id FROM rosters WHERE golfer_id = ${addGolferId}`,
    ]);

    if (addGolferRows.length === 0) {
      return NextResponse.json({ error: 'Golfer to add does not exist' }, { status: 400 });
    }
    if (rosteredRows.length > 0) {
      return NextResponse.json({ error: 'Golfer to add is already on a roster' }, { status: 400 });
    }

    const addGolferName = addGolferRows[0].name as string;

    // Check if golfer was originally on this team - must return to original slot
    const originalSlotRows = await sql`
      SELECT original_slot FROM slot_history
      WHERE team_id = ${teamId} AND golfer_id = ${addGolferId}
    `;
    if (originalSlotRows.length > 0) {
      const originalSlot = originalSlotRows[0].original_slot as number;
      if (slot !== originalSlot) {
        return NextResponse.json(
          { error: `${addGolferName} was originally in slot ${originalSlot} and must return to that slot` },
          { status: 400 }
        );
      }
    }

    // Get drop golfer name for the log
    const dropGolferRows = await sql`SELECT name FROM golfers WHERE golfer_id = ${dropGolferId}`;
    const dropGolferName = (dropGolferRows[0]?.name as string) ?? 'Unknown';

    // Update roster and log waiver
    // Note: times_used tracks SLOT usage, not golfer usage, so it persists through waivers
    await sql`
      UPDATE rosters
      SET golfer_id = ${addGolferId}
      WHERE team_id = ${teamId} AND slot = ${slot}
    `;
    await sql`
      INSERT INTO waiver_log (timestamp, team_id, dropped_golfer, added_golfer, slot)
      VALUES (${new Date().toISOString()}, ${teamId}, ${dropGolferName}, ${addGolferName}, ${slot})
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Waiver error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
