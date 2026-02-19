import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { RosterEntry, LineupEntry, Tournament } from '@/types';
import {
  validateLineupSelection,
  getDefaultLineup,
  isDeadlinePassed,
  canUseSlot,
} from '@/lib/lineup-validator';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const teamId = parseInt(searchParams.get('teamId') ?? '', 10);
    const tournamentId = searchParams.get('tournamentId');

    if (isNaN(teamId) || !tournamentId) {
      return NextResponse.json(
        { error: 'teamId and tournamentId required' },
        { status: 400 }
      );
    }

    const [tournamentRows, rosterRows, currentLineupRows] = await Promise.all([
      sql`SELECT tournament_id, name, deadline, status FROM tournaments WHERE tournament_id = ${tournamentId}`,
      sql`
        SELECT r.team_id, r.slot, r.golfer_id, r.times_used, g.name AS golfer_name
        FROM rosters r
        JOIN golfers g ON g.golfer_id = r.golfer_id
        WHERE r.team_id = ${teamId}
        ORDER BY r.slot
      `,
      sql`SELECT slot FROM lineups WHERE team_id = ${teamId} AND tournament_id = ${tournamentId}`,
    ]);

    if (tournamentRows.length === 0) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    const tournament = tournamentRows[0] as Tournament;
    const teamRoster = rosterRows as (RosterEntry & { golfer_name: string })[];
    const currentLineup = currentLineupRows as { slot: number }[];

    // Get previous tournament lineup for smart defaults
    const previousLineupRows = await sql`
      SELECT l.slot
      FROM lineups l
      JOIN tournaments t ON t.tournament_id = l.tournament_id
      WHERE l.team_id = ${teamId}
        AND t.deadline < ${tournament.deadline}
      ORDER BY t.deadline DESC
      LIMIT 4
    `;
    const previousLineup = previousLineupRows.map((r) => ({ slot: r.slot as number, fedex_points: null, team_id: teamId, tournament_id: '' })) as LineupEntry[];

    const defaultSlots = getDefaultLineup(teamRoster, previousLineup);

    const rosterWithState = teamRoster.map((r) => ({
      ...r,
      isSelected: currentLineup.some((l) => l.slot === r.slot),
      isDefault: defaultSlots.includes(r.slot),
      canSelect: canUseSlot(r),
    }));

    return NextResponse.json({
      tournament,
      roster: rosterWithState,
      currentLineup,
      isLocked: tournament.status === 'locked' || isDeadlinePassed(tournament.deadline),
    });
  } catch (error) {
    console.error('Lineup GET error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const teamId = parseInt(String(body.teamId), 10);
    const tournamentId = String(body.tournamentId);
    const slots = body.slots;

    if (isNaN(teamId) || !tournamentId || !Array.isArray(slots)) {
      return NextResponse.json(
        { error: 'teamId, tournamentId, and slots required' },
        { status: 400 }
      );
    }

    const [tournamentRows, rosterRows] = await Promise.all([
      sql`SELECT tournament_id, name, deadline, status FROM tournaments WHERE tournament_id = ${tournamentId}`,
      sql`SELECT team_id, slot, golfer_id, times_used FROM rosters WHERE team_id = ${teamId}`,
    ]);

    if (tournamentRows.length === 0) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    const tournament = tournamentRows[0] as Tournament;
    const teamRoster = rosterRows as RosterEntry[];

    if (tournament.status === 'locked' || isDeadlinePassed(tournament.deadline)) {
      return NextResponse.json(
        { error: 'Tournament is locked, cannot submit lineup' },
        { status: 403 }
      );
    }

    const validation = validateLineupSelection(slots, teamRoster);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // Delete existing lineup for this team+tournament, then insert new slots (upsert behaviour)
    await sql`DELETE FROM lineups WHERE tournament_id = ${tournamentId} AND team_id = ${teamId}`;

    // Insert all slots - use Promise.all for parallel execution
    const insertPromises = slots.map((slot) => {
      const slotNum = parseInt(String(slot), 10);
      return sql`INSERT INTO lineups (tournament_id, team_id, slot) VALUES (${tournamentId}, ${teamId}, ${slotNum})`;
    });
    await Promise.all(insertPromises);

    // Verify the lineup was saved
    const verifyRows = await sql`SELECT slot FROM lineups WHERE tournament_id = ${tournamentId} AND team_id = ${teamId}`;
    if (verifyRows.length !== slots.length) {
      console.error('Lineup verification failed:', { expected: slots.length, actual: verifyRows.length, teamId, tournamentId, slots });
      return NextResponse.json({ error: 'Failed to save lineup - please try again' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Lineup POST error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
