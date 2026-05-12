import { NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { sql } from '@/lib/db';
import { buildStandingsHistory, type StandingsHistoryRow } from '@/lib/standings-history';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const TEAM_COLORS = [
  '#2E7D32', // green
  '#1565C0', // blue
  '#C62828', // red
  '#F9A825', // gold
  '#6A1B9A', // purple
  '#00838F', // teal
  '#EF6C00', // orange
  '#4527A0', // indigo
  '#00695C', // dark teal
  '#AD1457', // pink
  '#558B2F', // lime
  '#D84315', // deep orange
  '#37474F', // blue grey
];

export async function GET() {
  noStore();
  try {
    const rows = await sql`
      SELECT
        t.tournament_id,
        t.name as tournament_name,
        t.deadline,
        tm.team_id,
        tm.team_name,
        COALESCE(SUM(l.fedex_points), 0) as points
      FROM tournaments t
      CROSS JOIN teams tm
      LEFT JOIN lineups l ON l.tournament_id = t.tournament_id AND l.team_id = tm.team_id
      WHERE t.status = 'closed'
      GROUP BY t.tournament_id, t.name, t.deadline, tm.team_id, tm.team_name
      ORDER BY t.deadline ASC, tm.team_id ASC
    ` as StandingsHistoryRow[];

    return NextResponse.json(buildStandingsHistory(rows, TEAM_COLORS));
  } catch (error) {
    console.error('Standings history error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
