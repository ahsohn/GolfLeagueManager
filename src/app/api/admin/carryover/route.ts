import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { RosterEntry, Tournament } from '@/types';
import { buildCarryoverLineup } from '@/lib/lineup-validator';

export async function POST(request: NextRequest) {
  try {
    const { tournament_id } = await request.json();

    if (!tournament_id) {
      return NextResponse.json(
        { error: 'tournament_id required' },
        { status: 400 }
      );
    }

    // Get the tournament
    const tournamentRows = await sql`
      SELECT tournament_id, name, deadline, status
      FROM tournaments
      WHERE tournament_id = ${tournament_id}
    `;

    if (tournamentRows.length === 0) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    const tournament = tournamentRows[0] as Tournament;

    // Get all teams
    const teamsRows = await sql`SELECT team_id, team_name FROM teams`;
    const allTeamIds = teamsRows.map((t) => t.team_id as number);

    // Get teams that already have lineups for this tournament
    const existingLineupsRows = await sql`
      SELECT DISTINCT team_id
      FROM lineups
      WHERE tournament_id = ${tournament_id}
    `;
    const teamsWithLineups = new Set(existingLineupsRows.map((r) => r.team_id as number));

    // Find teams without lineups
    const teamsWithoutLineups = allTeamIds.filter((id) => !teamsWithLineups.has(id));

    if (teamsWithoutLineups.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'All teams already have lineups',
        carryovers: [],
      });
    }

    // Get the previous tournament (most recent before this one by deadline)
    const previousTournamentRows = await sql`
      SELECT tournament_id, deadline
      FROM tournaments
      WHERE deadline < ${tournament.deadline}
      ORDER BY deadline DESC
      LIMIT 1
    `;

    const previousTournamentId = previousTournamentRows.length > 0
      ? previousTournamentRows[0].tournament_id as string
      : null;

    const carryoverResults: { team_id: number; team_name: string; slots: number[] }[] = [];

    // Process each team without a lineup
    for (const teamId of teamsWithoutLineups) {
      // Get the team's roster
      const rosterRows = await sql`
        SELECT team_id, slot, golfer_id, times_used
        FROM rosters
        WHERE team_id = ${teamId}
      `;
      const roster = rosterRows as RosterEntry[];

      // Get previous lineup slots (if there was a previous tournament)
      let previousSlots: number[] = [];
      if (previousTournamentId) {
        const prevLineupRows = await sql`
          SELECT slot
          FROM lineups
          WHERE team_id = ${teamId} AND tournament_id = ${previousTournamentId}
        `;
        previousSlots = prevLineupRows.map((r) => r.slot as number);
      }

      // Build the carryover lineup
      const carryoverSlots = buildCarryoverLineup(roster, previousSlots);

      if (carryoverSlots.length > 0) {
        // Insert the carryover lineup
        for (const slot of carryoverSlots) {
          await sql`
            INSERT INTO lineups (tournament_id, team_id, slot)
            VALUES (${tournament_id}, ${teamId}, ${slot})
          `;
        }

        const teamRow = teamsRows.find((t) => t.team_id === teamId);
        carryoverResults.push({
          team_id: teamId,
          team_name: teamRow?.team_name as string || `Team ${teamId}`,
          slots: carryoverSlots,
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Applied carryover lineups for ${carryoverResults.length} team(s)`,
      carryovers: carryoverResults,
    });
  } catch (error) {
    console.error('Carryover error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
