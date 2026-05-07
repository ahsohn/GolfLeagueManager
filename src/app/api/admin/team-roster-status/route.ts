import { NextRequest, NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { sql } from '@/lib/db';
import { ESPNClient } from '@/lib/egolfapi';
import {
  fetchAndCacheHistories,
  classifyLineupResult,
  findEventResult,
  type CacheIO,
  type CacheRowRecord,
  type ProposedResult,
} from '@/lib/scoring';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  noStore();
  try {
    const { team_id, tournament_id } = await request.json();
    if (!team_id || !tournament_id) {
      return NextResponse.json({ error: 'team_id and tournament_id required' }, { status: 400 });
    }

    const tournamentRows = await sql`
      SELECT tournament_id, espn_event_id, season
      FROM tournaments
      WHERE tournament_id = ${tournament_id}
    `;
    if (tournamentRows.length === 0) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }
    const tournament = tournamentRows[0];
    if (!tournament.espn_event_id || tournament.season == null) {
      return NextResponse.json(
        { error: 'Tournament has no ESPN event id mapped. Map it on /admin/backfill-events first.' },
        { status: 400 },
      );
    }

    const espnEventId = String(tournament.espn_event_id);
    const season = Number(tournament.season);

    const rosterRows = await sql`
      SELECT r.slot, g.name AS golfer_name, g.espn_id, r.times_used
      FROM rosters r
      JOIN golfers g ON g.golfer_id = r.golfer_id
      WHERE r.team_id = ${team_id}
      ORDER BY r.slot
    `;

    const teamRows = await sql`
      SELECT team_name FROM teams WHERE team_id = ${team_id}
    `;
    if (teamRows.length === 0) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }
    const teamName = String(teamRows[0].team_name);

    const uniqueEspnIds = Array.from(
      new Set(
        rosterRows
          .map((r) => (r.espn_id == null ? null : String(r.espn_id)))
          .filter((x): x is string => x !== null),
      ),
    );

    const io: CacheIO = {
      async cacheRead(ids, s) {
        if (ids.length === 0) return [];
        const rows = await sql`
          SELECT espn_id, season, fetched_at, payload
          FROM player_history_cache
          WHERE season = ${s} AND espn_id = ANY(${ids}::text[])
        `;
        return rows.map((r) => ({
          espn_id: String(r.espn_id),
          season: Number(r.season),
          fetched_at: new Date(r.fetched_at as string),
          payload: r.payload as CacheRowRecord['payload'],
        }));
      },
      async cacheUpsert(espnId, s, payload) {
        await sql`
          INSERT INTO player_history_cache (espn_id, season, payload, fetched_at)
          VALUES (${espnId}, ${s}, ${JSON.stringify(payload)}::jsonb, NOW())
          ON CONFLICT (espn_id, season)
          DO UPDATE SET payload = EXCLUDED.payload, fetched_at = NOW()
        `;
      },
    };

    const client = new ESPNClient({ delayMs: 500 });
    const histories = await fetchAndCacheHistories(uniqueEspnIds, season, io, client);

    const rosterStatus: ProposedResult[] = rosterRows.map((r) => {
      const espnId = r.espn_id == null ? null : String(r.espn_id);
      const history = espnId ? histories.get(espnId) ?? null : null;
      const status = classifyLineupResult(history, espnEventId, espnId);
      const event = findEventResult(history, espnEventId);

      return {
        team_id: Number(team_id),
        team_name: teamName,
        slot: Number(r.slot),
        golfer_name: String(r.golfer_name),
        espn_id: espnId,
        current_fedex_points: null,
        fetched_fedex_points: status === 'played' ? event?.fedexPoints ?? 0 : 0,
        position_display: event?.positionDisplay ?? null,
        status,
        message: null,
      };
    });

    // If every fetch failed, surface as a 502 — likely an ESPN-wide outage.
    const fetchAttempts = uniqueEspnIds.length;
    const fetchFailures = rosterStatus.filter((r) => r.status === 'fetch_failed').length;
    if (fetchAttempts > 0 && fetchFailures === fetchAttempts) {
      return NextResponse.json(
        { error: 'All ESPN history requests failed. Try again or enter results manually.' },
        { status: 502 },
      );
    }

    return NextResponse.json({
      team_id: Number(team_id),
      team_name: teamName,
      tournament_id: String(tournament_id),
      espn_event_id: espnEventId,
      season,
      roster_status: rosterStatus,
    });
  } catch (error) {
    console.error('team-roster-status error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
