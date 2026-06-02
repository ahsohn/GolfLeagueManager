# Lineup Field Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the lineup page, show a "Playing" / "Not in field" pill next to each golfer based on ESPN's published field for the tournament, without affecting golfer selection.

**Architecture:** A new pure module (`field-status.ts`) maps roster espn_ids against the field set; a thin client method (`getEventField`) fetches the field from ESPN in one call; a new cached API route (`/api/lineup/field`) joins them server-side; the lineup page fetches statuses asynchronously after its normal load and renders pills.

**Tech Stack:** Next.js 14 App Router, TypeScript, Neon PostgreSQL (`sql` tagged template), Jest + ts-jest, Tailwind CSS.

Spec: `docs/superpowers/specs/2026-05-27-lineup-field-indicator-design.md`

---

## File Structure

- **Create** `src/lib/field-status.ts` — pure status logic: `isFieldPublished`, `computeFieldStatuses`, the `FieldStatus`/`FieldStatusEntry` types. No I/O.
- **Create** `src/lib/__tests__/field-status.test.ts` — unit tests for the pure module.
- **Modify** `src/lib/egolfapi/client.ts` — add `getEventField(eventId, season)` (one direct leaderboard call, no aggregation fallback).
- **Create** `src/lib/__tests__/egolfapi/get-event-field.test.ts` — unit test using an injected `fetchImpl`.
- **Create** `drizzle/migrations/0007_event_field_cache.sql` — per-event field cache table.
- **Create** `src/app/api/lineup/field/route.ts` — cached endpoint that returns per-slot statuses.
- **Modify** `src/app/lineup/page.tsx` — fetch field statuses, render pills + "Field not announced yet" note.
- **Modify** `CLAUDE.md` — document the new endpoint and add it to the force-dynamic route list.

---

### Task 1: Pure field-status module

**Files:**
- Create: `src/lib/field-status.ts`
- Test: `src/lib/__tests__/field-status.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/field-status.test.ts`:

```typescript
import {
  computeFieldStatuses,
  isFieldPublished,
} from '@/lib/field-status';
import type { Leaderboard } from '@/lib/egolfapi';

const roster = [
  { slot: 1, espn_id: '9478' },   // in field
  { slot: 2, espn_id: '8793' },   // not in field
  { slot: 3, espn_id: null },     // no espn id
];

describe('computeFieldStatuses', () => {
  it('marks golfers in the field as playing and absent ones as not_in_field', () => {
    const result = computeFieldStatuses(roster, new Set(['9478']), true);
    expect(result).toEqual([
      { slot: 1, status: 'playing' },
      { slot: 2, status: 'not_in_field' },
      { slot: 3, status: 'unknown' },
    ]);
  });

  it('returns unknown for every slot when the field is not published', () => {
    const result = computeFieldStatuses(roster, new Set(['9478']), false);
    expect(result.every((r) => r.status === 'unknown')).toBe(true);
  });

  it('returns unknown for a golfer with a null espn_id even when in-field ids exist', () => {
    const result = computeFieldStatuses([{ slot: 5, espn_id: null }], new Set(['1']), true);
    expect(result).toEqual([{ slot: 5, status: 'unknown' }]);
  });
});

function board(id: string, espnIds: string[]): Leaderboard {
  return {
    tournament: {
      id,
      name: '',
      isMajor: false,
      status: 'scheduled',
      startDate: null,
      endDate: null,
      numberOfRounds: 4,
      course: null,
      cut: null,
      notes: [],
    },
    entries: espnIds.map((espnId) => ({
      player: { espnId, displayName: '', shortName: null, normalizedName: '' },
      position: null,
      positionDisplay: '',
      tied: false,
      scoreToPar: null,
      scoreToParDisplay: null,
      totalStrokes: null,
      status: 'scheduled',
      notStarted: true,
      thru: null,
      thruDisplay: null,
      teeTime: null,
      rounds: [],
    })),
  };
}

describe('isFieldPublished', () => {
  it('is true when the board matches the event id and has entries', () => {
    expect(isFieldPublished(board('401001', ['9478']), '401001')).toBe(true);
  });

  it('is false when the board is null', () => {
    expect(isFieldPublished(null, '401001')).toBe(false);
  });

  it('is false when the board is for a different event (current-week fallback)', () => {
    expect(isFieldPublished(board('999999', ['9478']), '401001')).toBe(false);
  });

  it('is false when the board has no entries (field not announced yet)', () => {
    expect(isFieldPublished(board('401001', []), '401001')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- field-status`
Expected: FAIL — `Cannot find module '@/lib/field-status'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/field-status.ts`:

```typescript
import type { Leaderboard } from '@/lib/egolfapi';

export type FieldStatus = 'playing' | 'not_in_field' | 'unknown';

export interface FieldStatusEntry {
  slot: number;
  status: FieldStatus;
}

/**
 * The field is "published" only when ESPN returned the board for THIS event
 * (id match guards against the current-week fallback) and it has entries.
 * Before tournament week ESPN returns no competitors, so this is false.
 */
export function isFieldPublished(
  board: Leaderboard | null,
  espnEventId: string,
): boolean {
  return (
    board !== null &&
    board.tournament.id === espnEventId &&
    board.entries.length > 0
  );
}

/**
 * Map each roster slot to a field status. Pure — no I/O.
 * `unknown` (rendered as no pill) when the field is unpublished or the golfer
 * has no espn_id; otherwise `playing` / `not_in_field` by set membership.
 */
export function computeFieldStatuses(
  roster: ReadonlyArray<{ slot: number; espn_id: string | null }>,
  fieldEspnIds: ReadonlySet<string>,
  fieldPublished: boolean,
): FieldStatusEntry[] {
  return roster.map(({ slot, espn_id }) => {
    if (!fieldPublished || espn_id === null) {
      return { slot, status: 'unknown' };
    }
    return {
      slot,
      status: fieldEspnIds.has(espn_id) ? 'playing' : 'not_in_field',
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- field-status`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/field-status.ts src/lib/__tests__/field-status.test.ts
git commit -m "feat(field-status): add pure field-membership status logic"
```

---

### Task 2: ESPN client `getEventField`

**Files:**
- Modify: `src/lib/egolfapi/client.ts`
- Test: `src/lib/__tests__/egolfapi/get-event-field.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/egolfapi/get-event-field.test.ts`:

```typescript
import { ESPNClient } from '@/lib/egolfapi';

// Minimal ESPN /leaderboard payload: one event with two competitors.
const payload = {
  events: [
    {
      id: '401580344',
      name: 'The Masters',
      status: { type: { state: 'pre' } },
      tournament: {},
      competitions: [
        {
          venue: {},
          competitors: [
            { athlete: { id: '9478', displayName: 'Scottie Scheffler' }, status: {}, score: {}, linescores: [] },
            { athlete: { id: '8793', displayName: 'Rory McIlroy' }, status: {}, score: {}, linescores: [] },
          ],
        },
      ],
    },
  ],
};

function mockFetch(json: unknown) {
  return jest.fn().mockResolvedValue({ ok: true, json: async () => json });
}

describe('ESPNClient.getEventField', () => {
  it('parses the field into a board with one entry per competitor', async () => {
    const fetchImpl = mockFetch(payload);
    const client = new ESPNClient({ delayMs: 0, fetchImpl: fetchImpl as unknown as typeof fetch });

    const board = await client.getEventField('401580344', 2026);

    expect(board?.tournament.id).toBe('401580344');
    expect(board?.entries.map((e) => e.player.espnId)).toEqual(['9478', '8793']);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('returns null when ESPN returns no events', async () => {
    const fetchImpl = mockFetch({ events: [] });
    const client = new ESPNClient({ delayMs: 0, fetchImpl: fetchImpl as unknown as typeof fetch });

    const board = await client.getEventField('401580344', 2026);

    expect(board).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- get-event-field`
Expected: FAIL — `client.getEventField is not a function`.

- [ ] **Step 3: Add the method**

In `src/lib/egolfapi/client.ts`, add this method to the `ESPNClient` class, immediately after the existing `getLeaderboard()` method. (`LEADERBOARD_URL`, `parseLeaderboard`, and the `Leaderboard` type are already imported at the top of the file.)

```typescript
  // Single direct leaderboard call for one event's field. Unlike
  // getHistoricalLeaderboard, this never falls back to player-aggregation
  // (which fires dozens of requests) — it is meant for interactive use.
  async getEventField(
    eventId: string,
    season: number,
  ): Promise<Leaderboard | null> {
    const payload = await this.request(LEADERBOARD_URL, { event: eventId, season });
    return parseLeaderboard(payload);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- get-event-field`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/egolfapi/client.ts src/lib/__tests__/egolfapi/get-event-field.test.ts
git commit -m "feat(egolfapi): add getEventField for single-call field lookup"
```

---

### Task 3: Field cache migration

**Files:**
- Create: `drizzle/migrations/0007_event_field_cache.sql`

- [ ] **Step 1: Create the migration**

Create `drizzle/migrations/0007_event_field_cache.sql`:

```sql
-- Per-event cache of the tournament field.
-- payload shape: { "published": boolean, "espn_ids": string[] }
-- TTL is enforced at read time (~3h); no janitor needed.

CREATE TABLE IF NOT EXISTS event_field_cache (
  espn_event_id TEXT PRIMARY KEY,
  payload       JSONB NOT NULL,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_field_cache_fetched
  ON event_field_cache(fetched_at);
```

- [ ] **Step 2: Apply the migration to Neon**

Per the project workflow, run this migration once against your Neon database (paste into the Neon SQL console, or via psql against `DATABASE_URL`). The route in Task 4 will fail at runtime until the table exists.

- [ ] **Step 3: Commit**

```bash
git add drizzle/migrations/0007_event_field_cache.sql
git commit -m "feat(db): add event_field_cache table migration"
```

---

### Task 4: `/api/lineup/field` route

**Files:**
- Create: `src/app/api/lineup/field/route.ts`

This route is a thin I/O shell over the already-tested pure functions, so it has no Jest test (matching the codebase convention of testing pure `src/lib` logic, not routes). It is verified by typecheck (`npm run build`) and the manual check in Task 6.

- [ ] **Step 1: Write the route**

Create `src/app/api/lineup/field/route.ts`:

```typescript
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
```

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors. (If it complains about an unrelated pre-existing issue, confirm it is not in `src/app/api/lineup/field/route.ts`.)

- [ ] **Step 3: Commit**

```bash
git add src/app/api/lineup/field/route.ts
git commit -m "feat(api): add /api/lineup/field cached field-status endpoint"
```

---

### Task 5: Lineup page pills

**Files:**
- Modify: `src/app/lineup/page.tsx`

- [ ] **Step 1: Add the type import**

In `src/app/lineup/page.tsx`, add this import after the existing `import { Tournament } from '@/types';` line:

```typescript
import type { FieldStatus } from '@/lib/field-status';
```

- [ ] **Step 2: Add a FieldPill component**

In `src/app/lineup/page.tsx`, add this component just above the `function LineupContent() {` declaration:

```tsx
function FieldPill({ status }: { status?: FieldStatus }) {
  if (status === 'playing') {
    return (
      <span className="ml-2 text-xs font-semibold rounded-full px-2.5 py-0.5 bg-green-50 text-masters-green align-middle">
        Playing
      </span>
    );
  }
  if (status === 'not_in_field') {
    return (
      <span className="ml-2 text-xs font-semibold rounded-full px-2.5 py-0.5 bg-gray-100 text-charcoal-light align-middle">
        Not in field
      </span>
    );
  }
  return null;
}
```

- [ ] **Step 3: Add field state**

In `src/app/lineup/page.tsx`, add these three state declarations immediately after the existing `const [showWarning, setShowWarning] = useState(false);` line:

```tsx
  const [fieldStatuses, setFieldStatuses] = useState<Record<number, FieldStatus>>({});
  const [fieldAvailable, setFieldAvailable] = useState<boolean | null>(null);
  const [fieldLoading, setFieldLoading] = useState(false);
```

- [ ] **Step 4: Fetch field statuses after the roster loads**

In `src/app/lineup/page.tsx`, inside the `fetchData` function in the `useEffect`, replace this existing block:

```tsx
          if (data.currentLineup.length > 0) {
            setSelected(data.currentLineup.map((l: { slot: number }) => l.slot));
          } else {
            setSelected(
              data.roster
                .filter((r: RosterPlayer) => r.isDefault)
                .map((r: RosterPlayer) => r.slot)
            );
          }
        }
      };
      fetchData();
```

with:

```tsx
          if (data.currentLineup.length > 0) {
            setSelected(data.currentLineup.map((l: { slot: number }) => l.slot));
          } else {
            setSelected(
              data.roster
                .filter((r: RosterPlayer) => r.isDefault)
                .map((r: RosterPlayer) => r.slot)
            );
          }

          // Informational only — fetch ESPN field status without blocking the page.
          setFieldLoading(true);
          setFieldAvailable(null);
          try {
            const fieldRes = await fetch(
              `/api/lineup/field?teamId=${team.team_id}&tournamentId=${tid}`
            );
            const fieldData = await fieldRes.json();
            if (fieldData.field_available && Array.isArray(fieldData.statuses)) {
              const map: Record<number, FieldStatus> = {};
              for (const s of fieldData.statuses) map[s.slot] = s.status;
              setFieldStatuses(map);
              setFieldAvailable(true);
            } else {
              setFieldStatuses({});
              setFieldAvailable(fieldData.field_available === false ? false : null);
            }
          } catch {
            // ESPN/network failure — leave pills hidden, no note.
            setFieldStatuses({});
            setFieldAvailable(null);
          } finally {
            setFieldLoading(false);
          }
        }
      };
      fetchData();
```

- [ ] **Step 5: Render the pill on each golfer card**

In `src/app/lineup/page.tsx`, replace this existing block:

```tsx
                    <div>
                      <span className="font-medium text-charcoal">
                        {player.golfer_name}
                      </span>
                      {!player.canSelect && (
                        <span className="ml-2 text-sm text-charcoal-light">
                          (max uses reached)
                        </span>
                      )}
                    </div>
```

with:

```tsx
                    <div>
                      <span className="font-medium text-charcoal">
                        {player.golfer_name}
                      </span>
                      <FieldPill status={fieldStatuses[player.slot]} />
                      {!player.canSelect && (
                        <span className="ml-2 text-sm text-charcoal-light">
                          (max uses reached)
                        </span>
                      )}
                    </div>
```

- [ ] **Step 6: Add the loading hint and "not announced" note**

In `src/app/lineup/page.tsx`, replace the opening of the golfer list block:

```tsx
            {/* Golfer List */}
            <div className="space-y-3 mb-6">
```

with:

```tsx
            {/* Field status hints */}
            {fieldLoading && (
              <p className="text-sm text-charcoal-light mb-3">Checking who's in the field…</p>
            )}
            {!fieldLoading && fieldAvailable === false && (
              <p className="text-sm text-charcoal-light mb-3">
                Field not announced yet — playing status will appear closer to the tournament.
              </p>
            )}

            {/* Golfer List */}
            <div className="space-y-3 mb-6">
```

- [ ] **Step 7: Typecheck and run tests**

Run: `npm run build && npm test`
Expected: build succeeds; all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/app/lineup/page.tsx
git commit -m "feat(lineup): show ESPN field status pills on golfer cards"
```

---

### Task 6: Docs + end-to-end verification

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Document the endpoint in the API table**

In `CLAUDE.md`, in the "API Endpoints" table, add this row immediately after the `GET | /api/lineup | Get lineup state` row:

```markdown
| GET | /api/lineup/field | Per-slot ESPN field status (playing / not in field) |
```

- [ ] **Step 2: Add the route to the force-dynamic list**

In `CLAUDE.md`, under "Affected Routes (all GET endpoints reading frequently-updated data)", add this bullet after the `src/app/api/lineup/route.ts - Lineup state` bullet:

```markdown
- `src/app/api/lineup/field/route.ts` - ESPN field status for a team's roster
```

- [ ] **Step 3: Commit the docs**

```bash
git add CLAUDE.md
git commit -m "docs: document /api/lineup/field endpoint"
```

- [ ] **Step 4: Manual end-to-end check**

Ensure the migration from Task 3 has been applied to the database referenced by `DATABASE_URL` in `.env.local`, then:

```bash
npm run dev
```

In a browser, log in and open the lineup page for a tournament that has an `espn_event_id` and whose field ESPN has published (a current/recent event). Verify:
- Each golfer with an `espn_id` in the field shows a green **Playing** pill.
- A golfer not in the field shows a gray **Not in field** pill.
- Selecting/deselecting golfers still works exactly as before (pills do not block selection).
- For a future tournament whose field ESPN has not published, no pills appear and the "Field not announced yet" note is shown.

Optionally hit the endpoint directly to inspect the payload:

```bash
curl "http://localhost:3000/api/lineup/field?teamId=<TEAM_ID>&tournamentId=<TOURNAMENT_ID>"
```

Expected JSON: `{ "field_available": true|false, "statuses": [ { "slot": 1, "status": "playing" }, ... ] }`.

---

## Notes for the implementer

- The `sql` tagged template (from `@/lib/db`) returns an array of rows; column values come back loosely typed, hence the explicit `String(...)`/`Number(...)` coercions — match that style.
- ESPN can 403 or time out; the route already retries (3x) inside `ESPNClient.request`. Never let a field-fetch failure surface as a page error — the design requires the page to remain fully usable with pills simply hidden.
- Tailwind custom colors `masters-green`, `charcoal`, and `charcoal-light` are defined in the project's Tailwind config and already used throughout `lineup/page.tsx`.
