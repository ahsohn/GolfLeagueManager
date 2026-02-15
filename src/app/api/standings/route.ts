import { NextResponse } from 'next/server';
import { getSheetData, SHEET_NAMES } from '@/lib/sheets';
import { parseTeams, parseStandings } from '@/lib/data';

export async function GET() {
  try {
    const [teamsData, standingsData] = await Promise.all([
      getSheetData(SHEET_NAMES.TEAMS),
      getSheetData(SHEET_NAMES.STANDINGS),
    ]);

    const teams = parseTeams(teamsData);
    const standings = parseStandings(standingsData);

    // Join teams with standings
    const result = teams.map((team) => {
      const standing = standings.find((s) => s.team_id === team.team_id);
      return {
        team_id: team.team_id,
        team_name: team.team_name,
        owner_email: team.owner_email,
        total_points: standing?.total_points ?? 0,
      };
    });

    // Sort by points descending
    result.sort((a, b) => b.total_points - a.total_points);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Standings error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
