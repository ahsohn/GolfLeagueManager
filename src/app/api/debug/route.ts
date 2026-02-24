import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

export async function GET() {
  const dbUrl = process.env.DATABASE_URL || 'NOT SET';
  const match = dbUrl.match(/@([^/]+)/);
  const host = match ? match[1] : 'unknown';

  const sql = neon(process.env.DATABASE_URL!);

  // Test with hardcoded string
  const hardcoded = await sql`SELECT team_id, slot, fedex_points FROM lineups WHERE tournament_id = 'T002' AND team_id = 11`;

  // Test with parameterized query (like the tournament route does)
  const tournamentId = 'T002';
  const parameterized = await sql`SELECT team_id, slot, fedex_points FROM lineups WHERE tournament_id = ${tournamentId} AND team_id = 11`;

  return NextResponse.json({
    db_host: host,
    hardcoded_query: hardcoded,
    parameterized_query: parameterized
  });
}
