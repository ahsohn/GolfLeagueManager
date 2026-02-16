import { NextRequest, NextResponse } from 'next/server';
import { getSheetData, SHEET_NAMES } from '@/lib/sheets';
import {
  parseTournaments,
  parseTeams,
  parseLineups,
  parseGolfers,
  parseRosters,
} from '@/lib/data';

// Disable caching to always fetch fresh data from Google Sheets
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [tournamentsData, teamsData, lineupsData, golfersData, rostersData] =
      await Promise.all([
        getSheetData(SHEET_NAMES.TOURNAMENTS),
        getSheetData(SHEET_NAMES.TEAMS),
        getSheetData(SHEET_NAMES.LINEUPS),
        getSheetData(SHEET_NAMES.GOLFERS),
        getSheetData(SHEET_NAMES.ROSTERS),
      ]);

    const tournaments = parseTournaments(tournamentsData);
    const tournament = tournaments.find((t) => t.tournament_id === id);

    if (!tournament) {
      return NextResponse.json(
        { error: 'Tournament not found' },
        { status: 404 }
      );
    }

    const teams = parseTeams(teamsData);
    const allLineups = parseLineups(lineupsData);
    const golfers = parseGolfers(golfersData);
    const rosters = parseRosters(rostersData);

    // Filter lineups for this tournament
    const tournamentLineups = allLineups.filter(
      (l) => l.tournament_id === id
    );

    // Group by team and include golfer names (lookup via roster slot -> golfer)
    const lineupsByTeam = teams.map((team) => {
      const teamLineup = tournamentLineups
        .filter((l) => l.team_id === team.team_id)
        .map((l) => {
          // Find the roster entry for this slot to get golfer_id
          const rosterEntry = rosters.find(
            (r) => r.team_id === team.team_id && r.slot === l.slot
          );
          const golfer = rosterEntry
            ? golfers.find((g) => g.golfer_id === rosterEntry.golfer_id)
            : null;
          return {
            slot: l.slot,
            golfer_name: golfer?.name ?? 'Unknown',
            fedex_points: l.fedex_points,
          };
        });

      return {
        team_id: team.team_id,
        team_name: team.team_name,
        lineup: teamLineup,
        total_points: teamLineup.reduce(
          (sum, l) => sum + (l.fedex_points ?? 0),
          0
        ),
      };
    });

    return NextResponse.json({
      tournament,
      lineups: lineupsByTeam,
    });
  } catch (error) {
    console.error('Tournament detail error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
