// src/app/api/analytics/top-slots/route.ts
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { unstable_noStore as noStore } from 'next/cache';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export interface TopSlotEntry {
  team_id: number;
  team_name: string;
  slot: number;
  total_points: number;
  times_started: number;
  golfers: Array<{ name: string; current: boolean }>;
}

export interface TopSlotsResponse {
  slots: TopSlotEntry[];
  max_points: number;
}

const LIMIT = 20;

export async function GET() {
  noStore();
  try {
    // Query 1: Top 20 (team_id, slot) pairs by total fedex_points
    const topRows = await sql`
      SELECT
        l.team_id,
        t.team_name,
        l.slot,
        COALESCE(SUM(l.fedex_points), 0)::int AS total_points,
        COUNT(l.fedex_points)::int            AS times_started
      FROM lineups l
      JOIN teams t USING (team_id)
      WHERE l.fedex_points IS NOT NULL
      GROUP BY l.team_id, t.team_name, l.slot
      ORDER BY total_points DESC, times_started ASC
      LIMIT ${LIMIT}
    `;

    if (topRows.length === 0) {
      return NextResponse.json({ slots: [], max_points: 0 } satisfies TopSlotsResponse);
    }

    const teamIds = Array.from(new Set(topRows.map((r) => Number(r.team_id))));
    const slots = Array.from(new Set(topRows.map((r) => Number(r.slot))));

    // Query 2a: Current golfer for every (team_id, slot) in our set
    const currentRows = await sql`
      SELECT r.team_id, r.slot, g.name
      FROM rosters r
      JOIN golfers g USING (golfer_id)
      WHERE r.team_id = ANY(${teamIds}::int[])
        AND r.slot   = ANY(${slots}::int[])
    `;

    // Query 2b: Every dropped golfer (chronological) for the same set
    const droppedRows = await sql`
      SELECT team_id, slot, dropped_golfer, timestamp
      FROM waiver_log
      WHERE team_id = ANY(${teamIds}::int[])
        AND slot    = ANY(${slots}::int[])
      ORDER BY timestamp ASC
    `;

    // Build lookup: key = `${team_id}:${slot}` -> ordered golfer list
    const key = (teamId: number, slot: number) => `${teamId}:${slot}`;
    const currentByKey = new Map<string, string>();
    for (const row of currentRows) {
      currentByKey.set(key(Number(row.team_id), Number(row.slot)), String(row.name));
    }
    const droppedByKey = new Map<string, string[]>();
    for (const row of droppedRows) {
      const k = key(Number(row.team_id), Number(row.slot));
      const list = droppedByKey.get(k) ?? [];
      list.push(String(row.dropped_golfer));
      droppedByKey.set(k, list);
    }

    const result: TopSlotEntry[] = topRows.map((row) => {
      const teamId = Number(row.team_id);
      const slot = Number(row.slot);
      const k = key(teamId, slot);
      const dropped = droppedByKey.get(k) ?? [];
      const current = currentByKey.get(k);
      const golfers: TopSlotEntry['golfers'] = [
        ...dropped.map((name) => ({ name, current: false })),
      ];
      if (current) {
        golfers.push({ name: current, current: true });
      }
      return {
        team_id: teamId,
        team_name: String(row.team_name),
        slot,
        total_points: Number(row.total_points),
        times_started: Number(row.times_started),
        golfers,
      };
    });

    const max_points = result[0]?.total_points ?? 0;
    return NextResponse.json({ slots: result, max_points } satisfies TopSlotsResponse);
  } catch (error) {
    console.error('Top slots error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
