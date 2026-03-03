import { NextRequest, NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  noStore();
  try {
    const { teamId } = await params;
    const teamIdNum = parseInt(teamId, 10);

    if (isNaN(teamIdNum)) {
      return NextResponse.json({ error: 'Invalid team ID' }, { status: 400 });
    }

    // Get team info, roster, current tournament, and lineup status
    const [teamRows, rosterRows, tournamentRows] = await Promise.all([
      sql`SELECT team_id, team_name FROM teams WHERE team_id = ${teamIdNum}`,
      sql`
        SELECT
          r.team_id,
          r.slot,
          r.golfer_id,
          r.times_used,
          g.name AS golfer_name
        FROM rosters r
        JOIN golfers g ON g.golfer_id = r.golfer_id
        WHERE r.team_id = ${teamIdNum}
        ORDER BY r.slot
      `,
      // Get the current open tournament, or most recent one
      sql`
        SELECT tournament_id, name, status, deadline
        FROM tournaments
        ORDER BY deadline DESC
        LIMIT 1
      `,
    ]);

    if (teamRows.length === 0) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    const team = teamRows[0] as { team_id: number; team_name: string };
    const roster = rosterRows as Array<{
      team_id: number;
      slot: number;
      golfer_id: number;
      times_used: number;
      golfer_name: string;
    }>;

    let currentTournament = null;
    let currentLineup: number[] = [];
    let lineupScored = false;

    if (tournamentRows.length > 0) {
      currentTournament = tournamentRows[0] as {
        tournament_id: string;
        name: string;
        status: string;
        deadline: string;
      };

      // Get this team's lineup for the current tournament
      const lineupRows = await sql`
        SELECT slot, fedex_points
        FROM lineups
        WHERE team_id = ${teamIdNum}
          AND tournament_id = ${currentTournament.tournament_id}
      `;

      currentLineup = lineupRows.map((r) => r.slot as number);
      // Check if any slot has been scored (fedex_points is not null)
      lineupScored = lineupRows.some((r) => r.fedex_points !== null);
    }

    // Calculate adjusted times_used (excluding current tournament if scored)
    const rosterWithAdjusted = roster.map((r) => {
      const inCurrentLineup = currentLineup.includes(r.slot);
      // If the slot is in the current lineup AND has been scored, subtract 1
      const adjustedTimesUsed = inCurrentLineup && lineupScored
        ? r.times_used - 1
        : r.times_used;

      return {
        ...r,
        adjusted_times_used: Math.max(0, adjustedTimesUsed),
        in_current_lineup: inCurrentLineup,
      };
    });

    return NextResponse.json({
      team,
      roster: rosterWithAdjusted,
      currentTournament: currentTournament ? {
        tournament_id: currentTournament.tournament_id,
        name: currentTournament.name,
        status: currentTournament.status,
        lineup_scored: lineupScored,
      } : null,
    });
  } catch (error) {
    console.error('Team roster error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
