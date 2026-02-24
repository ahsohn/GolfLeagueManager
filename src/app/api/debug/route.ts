import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

export async function GET() {
  const dbUrl = process.env.DATABASE_URL || 'NOT SET';
  // Only show the host part for security
  const match = dbUrl.match(/@([^/]+)/);
  const host = match ? match[1] : 'unknown';

  // Query lineups directly
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`SELECT tournament_id, team_id, slot, fedex_points FROM lineups WHERE tournament_id = 'T002' AND team_id = 11`;

  return NextResponse.json({
    db_host: host,
    has_url: !!process.env.DATABASE_URL,
    team11_lineups: rows
  });
}
