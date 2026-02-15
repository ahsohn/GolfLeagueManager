import { NextRequest, NextResponse } from 'next/server';
import { getSheetData, appendSheetRow, SHEET_NAMES } from '@/lib/sheets';
import {
  parseRosters,
  parseTournaments,
  parseLineups,
  parseGolfers,
} from '@/lib/data';
import {
  validateLineupSelection,
  getDefaultLineup,
  isDeadlinePassed,
  canUseSlot,
} from '@/lib/lineup-validator';

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

    const [rostersData, lineupsData, tournamentsData, golfersData] =
      await Promise.all([
        getSheetData(SHEET_NAMES.ROSTERS),
        getSheetData(SHEET_NAMES.LINEUPS),
        getSheetData(SHEET_NAMES.TOURNAMENTS),
        getSheetData(SHEET_NAMES.GOLFERS),
      ]);

    const rosters = parseRosters(rostersData);
    const allLineups = parseLineups(lineupsData);
    const tournaments = parseTournaments(tournamentsData);
    const golfers = parseGolfers(golfersData);

    const teamRoster = rosters.filter((r) => r.team_id === teamId);
    const tournament = tournaments.find((t) => t.tournament_id === tournamentId);

    if (!tournament) {
      return NextResponse.json(
        { error: 'Tournament not found' },
        { status: 404 }
      );
    }

    // Get current lineup for this tournament
    const currentLineup = allLineups.filter(
      (l) => l.team_id === teamId && l.tournament_id === tournamentId
    );

    // Get previous tournament lineup for defaults
    const sortedTournaments = tournaments
      .filter((t) => new Date(t.deadline) < new Date(tournament.deadline))
      .sort(
        (a, b) =>
          new Date(b.deadline).getTime() - new Date(a.deadline).getTime()
      );

    const previousTournament = sortedTournaments[0];
    const previousLineup = previousTournament
      ? allLineups.filter(
          (l) =>
            l.team_id === teamId &&
            l.tournament_id === previousTournament.tournament_id
        )
      : [];

    const defaultSlots = getDefaultLineup(teamRoster, previousLineup);

    // Build roster with selection state
    const rosterWithState = teamRoster
      .sort((a, b) => a.slot - b.slot)
      .map((r) => ({
        ...r,
        golfer_name:
          golfers.find((g) => g.golfer_id === r.golfer_id)?.name ?? 'Unknown',
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
    const { teamId, tournamentId, slots } = await request.json();

    if (!teamId || !tournamentId || !Array.isArray(slots)) {
      return NextResponse.json(
        { error: 'teamId, tournamentId, and slots required' },
        { status: 400 }
      );
    }

    const [rostersData, tournamentsData, lineupsData] = await Promise.all([
      getSheetData(SHEET_NAMES.ROSTERS),
      getSheetData(SHEET_NAMES.TOURNAMENTS),
      getSheetData(SHEET_NAMES.LINEUPS),
    ]);

    const rosters = parseRosters(rostersData);
    const tournaments = parseTournaments(tournamentsData);
    const allLineups = parseLineups(lineupsData);

    const tournament = tournaments.find((t) => t.tournament_id === tournamentId);

    if (!tournament) {
      return NextResponse.json(
        { error: 'Tournament not found' },
        { status: 404 }
      );
    }

    // Check if locked
    if (tournament.status === 'locked' || isDeadlinePassed(tournament.deadline)) {
      return NextResponse.json(
        { error: 'Tournament is locked, cannot submit lineup' },
        { status: 403 }
      );
    }

    // Validate lineup
    const teamRoster = rosters.filter((r) => r.team_id === teamId);
    const validation = validateLineupSelection(slots, teamRoster);

    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // Check if lineup already exists (update vs create)
    const existingLineup = allLineups.filter(
      (l) => l.team_id === teamId && l.tournament_id === tournamentId
    );

    if (existingLineup.length > 0) {
      // TODO: Implement update logic - for now, return error
      return NextResponse.json(
        { error: 'Lineup already exists. Updates not yet implemented.' },
        { status: 400 }
      );
    }

    // Append new lineup rows
    for (const slot of slots) {
      await appendSheetRow(SHEET_NAMES.LINEUPS, [
        tournamentId,
        teamId,
        slot,
        '', // fedex_points - empty initially
      ]);
    }

    // TODO: Increment times_used for each slot in roster

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Lineup POST error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
