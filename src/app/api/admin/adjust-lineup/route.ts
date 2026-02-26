import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tournament_id, team_id, old_slot, new_slot, new_points, admin_note, admin_email } = body;

    // Validate required fields
    if (!tournament_id || !team_id || !old_slot || !new_slot || new_points === undefined || !admin_email) {
      return NextResponse.json(
        { error: 'Missing required fields: tournament_id, team_id, old_slot, new_slot, new_points, admin_email' },
        { status: 400 }
      );
    }

    const tournamentId = String(tournament_id);
    const teamId = parseInt(String(team_id), 10);
    const oldSlot = parseInt(String(old_slot), 10);
    const newSlot = parseInt(String(new_slot), 10);
    const newPoints = parseInt(String(new_points), 10);
    const normalizedAdminEmail = String(admin_email).toLowerCase().trim();
    const note = admin_note ? String(admin_note) : null;

    // Verify admin is a commissioner
    const configRows = await sql`SELECT value FROM config WHERE key = 'commissioner_emails'`;
    const commissionerEmails = (configRows[0]?.value as string) ?? '';
    const isCommissioner = commissionerEmails
      .toLowerCase()
      .split(',')
      .map((e: string) => e.trim())
      .includes(normalizedAdminEmail);

    if (!isCommissioner) {
      return NextResponse.json(
        { error: 'Unauthorized: Only commissioners can adjust lineups' },
        { status: 403 }
      );
    }

    // Check if new slot exists in team's roster and get times_used
    const rosterCheck = await sql`
      SELECT times_used FROM rosters
      WHERE team_id = ${teamId} AND slot = ${newSlot}
    `;

    if (rosterCheck.length === 0) {
      return NextResponse.json(
        { error: `Slot ${newSlot} not found in team's roster` },
        { status: 400 }
      );
    }

    const currentUses = Number(rosterCheck[0].times_used);
    if (currentUses >= 8) {
      return NextResponse.json(
        { error: `Cannot use slot ${newSlot}: already at maximum 8 uses (current: ${currentUses})` },
        { status: 400 }
      );
    }

    // Get old lineup entry for audit log
    const oldLineup = await sql`
      SELECT l.fedex_points, r.slot as roster_slot
      FROM lineups l
      JOIN rosters r ON l.team_id = r.team_id AND l.slot = r.slot
      WHERE l.tournament_id = ${tournamentId}
        AND l.team_id = ${teamId}
        AND l.slot = ${oldSlot}
    `;

    if (oldLineup.length === 0) {
      return NextResponse.json(
        { error: `No lineup entry found for slot ${oldSlot} in this tournament` },
        { status: 404 }
      );
    }

    const oldPoints = oldLineup[0].fedex_points;
    const timestamp = new Date().toISOString();
    const adminNoteText = note ? `Admin adjustment: ${note}` : 'Admin adjustment';

    // Run all updates in a transaction
    await sql.transaction([
      // Delete old lineup entry
      sql`
        DELETE FROM lineups
        WHERE tournament_id = ${tournamentId}
          AND team_id = ${teamId}
          AND slot = ${oldSlot}
      `,
      // Insert new lineup entry with admin note
      sql`
        INSERT INTO lineups (tournament_id, team_id, slot, fedex_points, admin_note)
        VALUES (${tournamentId}, ${teamId}, ${newSlot}, ${newPoints}, ${adminNoteText})
      `,
      // Decrement old slot times_used
      sql`
        UPDATE rosters
        SET times_used = times_used - 1
        WHERE team_id = ${teamId} AND slot = ${oldSlot}
      `,
      // Increment new slot times_used
      sql`
        UPDATE rosters
        SET times_used = times_used + 1
        WHERE team_id = ${teamId} AND slot = ${newSlot}
      `,
      // Insert audit record
      sql`
        INSERT INTO admin_adjustments
        (timestamp, tournament_id, team_id, old_slot, new_slot, old_points, new_points, note, admin_email)
        VALUES (${timestamp}, ${tournamentId}, ${teamId}, ${oldSlot}, ${newSlot}, ${oldPoints}, ${newPoints}, ${note}, ${normalizedAdminEmail})
      `,
    ]);

    // Recalculate standings
    const allLineups = await sql`SELECT team_id, fedex_points FROM lineups`;
    const teamTotals = new Map<number, number>();
    for (const l of allLineups) {
      const tid = Number(l.team_id);
      teamTotals.set(tid, (teamTotals.get(tid) || 0) + (Number(l.fedex_points) || 0));
    }

    // Update each team's standings
    const teamEntries = Array.from(teamTotals.entries());
    for (const entry of teamEntries) {
      const teamIdEntry = entry[0];
      const total = entry[1];
      await sql`UPDATE standings SET total_points = ${total} WHERE team_id = ${teamIdEntry}`;
    }

    return NextResponse.json({
      success: true,
      message: `Lineup adjusted: slot ${oldSlot} → slot ${newSlot} with ${newPoints} points`
    });
  } catch (error) {
    console.error('Admin adjust-lineup error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
