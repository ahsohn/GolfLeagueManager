import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [tournamentRows, lineupRows] = await Promise.all([
      sql`
        SELECT tournament_id, name, deadline, status
        FROM tournaments
        WHERE tournament_id = ${id}
      `,
      sql`
        SELECT
          tm.team_id,
          tm.team_name,
          l.slot,
          g.name AS golfer_name,
          l.fedex_points
        FROM teams tm
        LEFT JOIN lineups l
          ON l.team_id = tm.team_id AND l.tournament_id = ${id}
        LEFT JOIN rosters r
          ON r.team_id = tm.team_id AND r.slot = l.slot
        LEFT JOIN golfers g
          ON g.golfer_id = r.golfer_id
        ORDER BY tm.team_id, l.slot
      `,
    ]);

    if (tournamentRows.length === 0) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    const tournament = tournamentRows[0];

    // Group lineup rows by team
    const teamMap = new Map<number, {
      team_id: number;
      team_name: string;
      lineup: { slot: number; golfer_name: string; fedex_points: number | null }[];
    }>();

    for (const row of lineupRows) {
      const teamId = row.team_id as number;
      if (!teamMap.has(teamId)) {
        teamMap.set(teamId, {
          team_id: teamId,
          team_name: row.team_name as string,
          lineup: [],
        });
      }
      if (row.slot !== null) {
        teamMap.get(teamId)!.lineup.push({
          slot: row.slot as number,
          golfer_name: (row.golfer_name as string) ?? 'Unknown',
          fedex_points: row.fedex_points as number | null,
        });
      }
    }

    const lineups = Array.from(teamMap.values()).map((team) => ({
      ...team,
      total_points: team.lineup.reduce((sum, l) => sum + (l.fedex_points ?? 0), 0),
    }));

    return NextResponse.json({ tournament, lineups });
  } catch (error) {
    console.error('Tournament detail error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
