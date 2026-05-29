import { NextRequest, NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { sql } from '@/lib/db';
import { ESPNClient } from '@/lib/egolfapi';
import { computeFieldStatuses, isFieldPublished } from '@/lib/field-status';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

const CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours

interface CachedField {
  published: boolean;
  espn_ids: string[];
}

export async function GET(request: NextRequest) {
  noStore();
  try {
    const { searchParams } = new URL(request.url);
    const teamId = parseInt(searchParams.get('teamId') ?? '', 10);
    const tournamentId = searchParams.get('tournamentId');

    if (isNaN(teamId) || !tournamentId) {
      return NextResponse.json(
        { error: 'teamId and tournamentId required' },
        { status: 400 },
      );
    }

    const tournamentRows = await sql`
      SELECT espn_event_id, season FROM tournaments WHERE tournament_id = ${tournamentId}
    `;
    if (tournamentRows.length === 0) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }
    const espnEventId =
      tournamentRows[0].espn_event_id == null ? null : String(tournamentRows[0].espn_event_id);
    const season =
      tournamentRows[0].season == null ? null : Number(tournamentRows[0].season);

    const rosterRows = await sql`
      SELECT r.slot, g.espn_id
      FROM rosters r
      JOIN golfers g ON g.golfer_id = r.golfer_id
      WHERE r.team_id = ${teamId}
      ORDER BY r.slot
    `;
    const roster = rosterRows.map((r) => ({
      slot: Number(r.slot),
      espn_id: r.espn_id == null ? null : String(r.espn_id),
    }));

    // Defensive: an unmapped tournament has no field to show.
    if (!espnEventId || season == null) {
      return NextResponse.json({
        field_available: false,
        statuses: computeFieldStatuses(roster, new Set<string>(), false),
      });
    }

    const cached = await readFieldCache(espnEventId);
    let field: CachedField | null = cached?.fresh ? cached.value : null;

    if (!field) {
      try {
        const client = new ESPNClient({ delayMs: 500 });
        const board = await client.getEventField(espnEventId, season);
        const published = isFieldPublished(board, espnEventId);
        const espn_ids = published ? board!.entries.map((e) => e.player.espnId) : [];
        field = { published, espn_ids };
        await writeFieldCache(espnEventId, field);
      } catch (err) {
        console.warn('lineup/field ESPN fetch failed:', err);
        // Fall back to stale cache if present; otherwise report unavailable.
        field = cached?.value ?? null;
      }
    }

    if (!field) {
      return NextResponse.json({
        field_available: false,
        statuses: computeFieldStatuses(roster, new Set<string>(), false),
      });
    }

    const statuses = computeFieldStatuses(roster, new Set(field.espn_ids), field.published);
    return NextResponse.json({ field_available: field.published, statuses });
  } catch (error) {
    console.error('lineup/field error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

async function readFieldCache(
  espnEventId: string,
): Promise<{ value: CachedField; fresh: boolean } | null> {
  const rows = await sql`
    SELECT payload, fetched_at FROM event_field_cache WHERE espn_event_id = ${espnEventId}
  `;
  if (rows.length === 0) return null;
  const value = rows[0].payload as CachedField;
  const fetchedAt = new Date(rows[0].fetched_at as string).getTime();
  const fresh = Date.now() - fetchedAt < CACHE_TTL_MS;
  return { value, fresh };
}

async function writeFieldCache(espnEventId: string, field: CachedField): Promise<void> {
  await sql`
    INSERT INTO event_field_cache (espn_event_id, payload, fetched_at)
    VALUES (${espnEventId}, ${JSON.stringify(field)}::jsonb, NOW())
    ON CONFLICT (espn_event_id)
    DO UPDATE SET payload = EXCLUDED.payload, fetched_at = NOW()
  `;
}
