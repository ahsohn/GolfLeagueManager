import { NextRequest, NextResponse } from 'next/server';
import { getSheetData, updateSheetRow, SHEET_NAMES } from '@/lib/sheets';
import { parseLineups, parseRosters, parseStandings, parseTeams } from '@/lib/data';

export async function POST(request: NextRequest) {
  try {
    const { tournament_id, results } = await request.json();

    if (!tournament_id || !Array.isArray(results)) {
      return NextResponse.json(
        { error: 'tournament_id and results array required' },
        { status: 400 }
      );
    }

    // results format: [{ team_id: number, slot: number, fedex_points: number }]

    const lineupsData = await getSheetData(SHEET_NAMES.LINEUPS);
    const lineups = parseLineups(lineupsData);
    const rostersData = await getSheetData(SHEET_NAMES.ROSTERS);
    const rosters = parseRosters(rostersData);

    // Track which slots need times_used incremented (only if they didn't have points before)
    const slotsToIncrement: { team_id: number; slot: number }[] = [];

    // Update each lineup entry with points
    for (const result of results) {
      const rowIndex = lineups.findIndex(
        (l) =>
          l.tournament_id === tournament_id &&
          l.team_id === result.team_id &&
          l.slot === result.slot
      );

      if (rowIndex !== -1) {
        const lineup = lineups[rowIndex];

        // Only increment times_used if this slot didn't have points before
        if (lineup.fedex_points === null) {
          slotsToIncrement.push({ team_id: result.team_id, slot: result.slot });
        }

        await updateSheetRow(SHEET_NAMES.LINEUPS, rowIndex + 2, [
          lineup.tournament_id,
          lineup.team_id,
          lineup.slot,
          result.fedex_points,
        ]);
      }
    }

    // Increment times_used for slots that were newly scored
    for (const { team_id, slot } of slotsToIncrement) {
      const rosterRowIndex = rosters.findIndex(
        (r) => r.team_id === team_id && r.slot === slot
      );

      if (rosterRowIndex !== -1) {
        const roster = rosters[rosterRowIndex];
        await updateSheetRow(SHEET_NAMES.ROSTERS, rosterRowIndex + 2, [
          roster.team_id,
          roster.slot,
          roster.golfer_id,
          roster.times_used + 1,
        ]);
        // Update local copy to handle multiple slots for same team
        rosters[rosterRowIndex].times_used += 1;
      }
    }

    // Recalculate standings
    const updatedLineupsData = await getSheetData(SHEET_NAMES.LINEUPS);
    const updatedLineups = parseLineups(updatedLineupsData);
    const teamsData = await getSheetData(SHEET_NAMES.TEAMS);
    const teams = parseTeams(teamsData);
    const standingsData = await getSheetData(SHEET_NAMES.STANDINGS);
    const standings = parseStandings(standingsData);

    for (const team of teams) {
      const teamPoints = updatedLineups
        .filter((l) => l.team_id === team.team_id)
        .reduce((sum, l) => sum + (l.fedex_points ?? 0), 0);

      const standingRowIndex = standings.findIndex(
        (s) => s.team_id === team.team_id
      );

      if (standingRowIndex !== -1) {
        await updateSheetRow(SHEET_NAMES.STANDINGS, standingRowIndex + 2, [
          team.team_id,
          teamPoints,
        ]);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Admin results error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
