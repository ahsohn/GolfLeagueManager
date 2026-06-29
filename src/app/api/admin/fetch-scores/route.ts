import { NextRequest, NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { sql } from '@/lib/db';
import { ESPNClient, type LeaderboardEntry } from '@/lib/egolfapi';
import {
  fetchAndCacheHistories,
  mergeProposedResults,
  type CacheIO,
  type CacheRowRecord,
  type LineupRow,
  type FetchScoresResponse,
} from '@/lib/scoring';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  noStore();
  try {
    const { tournament_id } = await request.json();
    if (!tournament_id) {
      return NextResponse.json({ error: 'tournament_id required' }, { status: 400 });
    }

    const tournamentRows = await sql`
      SELECT tournament_id, name, espn_event_id, season
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

    // Inner JOINs assume referential integrity (FK constraints enforce it).
    // A lineup whose roster/golfer rows have been deleted would silently disappear here;
    // in practice the schema prevents that, so we don't add LEFT JOINs and null-handling.
    // Load lineup rows joined with roster + golfer for names and espn_ids.
    const lineupRows = await sql`
      SELECT
        l.team_id, t.team_name, l.slot, g.name AS golfer_name, g.espn_id, l.fedex_points
      FROM lineups l
      JOIN teams   t ON t.team_id = l.team_id
      JOIN rosters r ON r.team_id = l.team_id AND r.slot = l.slot
      JOIN golfers g ON g.golfer_id = r.golfer_id
      WHERE l.tournament_id = ${tournament_id}
      ORDER BY t.team_name, l.slot
    `;
    const lineups: LineupRow[] = lineupRows.map((r) => ({
      team_id: Number(r.team_id),
      team_name: String(r.team_name),
      slot: Number(r.slot),
      golfer_name: String(r.golfer_name),
      espn_id: r.espn_id == null ? null : String(r.espn_id),
      fedex_points: r.fedex_points == null ? null : Number(r.fedex_points),
    }));

    const uniqueEspnIds = Array.from(
      new Set(lineups.map((l) => l.espn_id).filter((x): x is string => x !== null)),
    );

    const io: CacheIO = {
      async cacheRead(ids, s) {
        // fetchAndCacheHistories guards against empty ids before calling here,
        // but keep the check defensive in case CacheIO is reused elsewhere.
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

    // The event leaderboard is the authoritative source for per-event FedEx
    // points: it publishes cupPoints the moment an event finishes, while the
    // per-player history endpoint lags and reports 0 for hours/days afterward.
    // Overlay it on top of the history-based results; merge falls back to
    // history for any golfer the leaderboard doesn't cover.
    const leaderboardByEspnId = new Map<string, LeaderboardEntry>();
    try {
      const board = await client.getEventField(espnEventId, season);
      if (board && board.tournament.id === espnEventId) {
        for (const entry of board.entries) {
          if (entry.player.espnId) leaderboardByEspnId.set(entry.player.espnId, entry);
        }
      }
    } catch (err) {
      console.warn('fetch-scores: event leaderboard fetch failed, using player history only:', err);
    }

    const merged = mergeProposedResults(lineups, histories, espnEventId, leaderboardByEspnId);

    // If every fetch failed, surface as a 502 — likely an ESPN-wide outage.
    const fetchAttempts = uniqueEspnIds.length;
    const fetchFailures = merged.summary.fetch_failed;
    if (fetchAttempts > 0 && fetchFailures === fetchAttempts) {
      return NextResponse.json(
        { error: 'All ESPN history requests failed. Try again or enter results manually.' },
        { status: 502 },
      );
    }

    const response: FetchScoresResponse = {
      tournament_id: String(tournament.tournament_id),
      espn_event_id: espnEventId,
      season,
      proposed: merged.proposed,
      summary: merged.summary,
    };
    return NextResponse.json(response);
  } catch (error) {
    console.error('fetch-scores error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
