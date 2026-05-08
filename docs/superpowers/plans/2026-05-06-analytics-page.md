# Analytics Page Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `/analytics` page whose first widget is a "Top 20 Slots" ranked table showing which roster slots have produced the most fantasy points, with all golfers who ever occupied each slot listed inline.

**Architecture:** New `/analytics` page is auth-gated and fetches a new `/api/analytics/top-slots` endpoint. The endpoint runs two SQL queries (aggregate the top 20 `(team_id, slot)` pairs from `lineups`, then collect every golfer that ever sat in those slots). A pure rendering component renders the table with inline horizontal point bars. Home page Quick Actions gets an "Analytics" tile.

**Tech Stack:** Next.js 14 (App Router), TypeScript, `@neondatabase/serverless`, Tailwind CSS, Jest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-05-06-analytics-page-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/app/api/analytics/top-slots/route.ts` | GET endpoint, aggregates top 20 slots and gathers golfer history |
| Create | `src/components/TopSlotsTable.tsx` | Pure presentation — table with inline bars, empty state |
| Create | `src/components/__tests__/TopSlotsTable.test.tsx` | Component test (rendering, current-golfer pill, bar widths, empty state) |
| Create | `src/app/analytics/page.tsx` | Page shell, auth gate, fetches API, renders TopSlotsTable |
| Modify | `src/app/page.tsx` | Add "Analytics" tile to Quick Actions grid |

**TypeScript types** for the API response live inline in `route.ts` and are re-imported by `TopSlotsTable.tsx` and `analytics/page.tsx`. No additions to `src/types/index.ts` — these types are local to the analytics feature.

---

## Chunk 1: API endpoint

### Task 1: Create the API route

**Files:**
- Create: `src/app/api/analytics/top-slots/route.ts`

**Reference patterns to match:**
- `src/app/api/standings/route.ts` — uses `noStore()`, `dynamic = 'force-dynamic'`, `revalidate = 0`, `try/catch` with `console.error` and 500 response.
- `src/lib/db.ts` — exports the `sql` tagged template from `@neondatabase/serverless`.

- [ ] **Step 1: Create the route file**

```typescript
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
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Smoke test against the real DB**

Run the dev server (`npm run dev`) in another terminal, then:

```bash
curl -s http://localhost:3000/api/analytics/top-slots | head -c 500
```

Expected: a JSON object with `slots: [...]` (up to 20 entries) and `max_points: <number>`. If the database has zero `lineups` with `fedex_points`, expect `{"slots":[],"max_points":0}`.

Sanity-check: confirm `slots[0].total_points >= slots[19].total_points` (descending order).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/analytics/top-slots/route.ts
git commit -m "feat(api): add /api/analytics/top-slots endpoint"
```

---

## Chunk 2: TopSlotsTable component (TDD)

### Task 2: Write the failing component test

**Files:**
- Create: `src/components/__tests__/TopSlotsTable.test.tsx`

**Reference patterns to match:**
- `src/lib/__tests__/lineup-validator.test.ts` — Jest `describe`/`it` style
- `jest.config.js` already configures `testEnvironment: 'jest-environment-jsdom'` and the `@/` path alias
- `@testing-library/react` and `@testing-library/jest-dom` are already in devDependencies

- [ ] **Step 1: Create the test file**

```tsx
// src/components/__tests__/TopSlotsTable.test.tsx
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import TopSlotsTable from '../TopSlotsTable';
import type { TopSlotEntry } from '@/app/api/analytics/top-slots/route';

const sampleSlots: TopSlotEntry[] = [
  {
    team_id: 1,
    team_name: 'Birdie Hunters',
    slot: 7,
    total_points: 4250,
    times_started: 6,
    golfers: [
      { name: 'Tony Finau', current: false },
      { name: 'Scottie Scheffler', current: true },
    ],
  },
  {
    team_id: 2,
    team_name: 'Par Stars',
    slot: 3,
    total_points: 2125, // exactly half of max — used to assert bar width
    times_started: 4,
    golfers: [{ name: 'Rory McIlroy', current: true }],
  },
];

describe('TopSlotsTable', () => {
  it('renders one row per slot with team name, slot, points, and starts', () => {
    render(<TopSlotsTable slots={sampleSlots} maxPoints={4250} />);

    expect(screen.getByText('Birdie Hunters')).toBeInTheDocument();
    expect(screen.getByText('Slot 7')).toBeInTheDocument();
    expect(screen.getByText('4,250')).toBeInTheDocument();
    expect(screen.getByText('Par Stars')).toBeInTheDocument();
    expect(screen.getByText('Slot 3')).toBeInTheDocument();
    expect(screen.getByText('2,125')).toBeInTheDocument();
  });

  it('lists every golfer for a slot and tags only the current one', () => {
    render(<TopSlotsTable slots={sampleSlots} maxPoints={4250} />);

    expect(screen.getByText('Tony Finau')).toBeInTheDocument();
    expect(screen.getByText('Scottie Scheffler')).toBeInTheDocument();

    // Exactly two `current` pills (one per row, matching the golfer flagged current: true)
    const pills = screen.getAllByText(/^current$/i);
    expect(pills).toHaveLength(2);
  });

  it('scales the bar width proportional to total_points / maxPoints', () => {
    const { container } = render(
      <TopSlotsTable slots={sampleSlots} maxPoints={4250} />,
    );

    const bars = container.querySelectorAll<HTMLElement>('[data-testid="points-bar"]');
    expect(bars).toHaveLength(2);
    expect(bars[0].style.width).toBe('100%');
    expect(bars[1].style.width).toBe('50%');
  });

  it('renders the empty state when no slots are provided', () => {
    render(<TopSlotsTable slots={[]} maxPoints={0} />);
    expect(
      screen.getByText(/No tournament results yet/i),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/components/__tests__/TopSlotsTable.test.tsx`
Expected: FAIL with "Cannot find module '../TopSlotsTable'" (or similar — the component file doesn't exist yet).

---

### Task 3: Implement TopSlotsTable to make the test pass

**Files:**
- Create: `src/components/TopSlotsTable.tsx`

**Reference patterns to match:**
- `src/components/StandingsGraph.tsx` — `'use client'`, hooks, Tailwind classes
- `src/app/globals.css:308` — existing `.standings-table` and `rank-1`/`rank-2`/`rank-3` styles. Reuse `standings-table` for visual consistency.

- [ ] **Step 1: Implement the component**

```tsx
// src/components/TopSlotsTable.tsx
'use client';

import Link from 'next/link';
import type { TopSlotEntry } from '@/app/api/analytics/top-slots/route';

interface Props {
  slots: TopSlotEntry[];
  maxPoints: number;
}

export default function TopSlotsTable({ slots, maxPoints }: Props) {
  if (slots.length === 0) {
    return (
      <p className="text-charcoal-light italic text-center py-8">
        No tournament results yet — analytics will appear after the first tournament closes.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="standings-table w-full">
        <thead>
          <tr>
            <th className="w-12 text-left">#</th>
            <th className="text-left">Team / Slot</th>
            <th className="text-left">Golfer(s)</th>
            <th className="hidden sm:table-cell text-right w-20">Starts</th>
            <th className="text-right">Points</th>
          </tr>
        </thead>
        <tbody>
          {slots.map((s, i) => {
            const rankClass =
              i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : '';
            const widthPct = maxPoints > 0 ? (s.total_points / maxPoints) * 100 : 0;
            return (
              <tr key={`${s.team_id}-${s.slot}`} className={rankClass}>
                <td className="font-semibold text-charcoal-light">{i + 1}</td>
                <td>
                  <Link
                    href={`/team/${s.team_id}`}
                    className="font-medium hover:text-masters-green transition-colors"
                  >
                    {s.team_name}
                  </Link>
                  <div className="text-xs text-charcoal-light">Slot {s.slot}</div>
                </td>
                <td>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {s.golfers.map((g, gi) => (
                      <span
                        key={`${g.name}-${gi}`}
                        className={g.current ? 'font-semibold text-charcoal' : 'text-charcoal-light'}
                      >
                        {g.name}
                        {g.current && (
                          <span className="ml-1 text-[10px] uppercase tracking-wider bg-gold/20 text-bronze px-1.5 py-0.5 rounded-full">
                            current
                          </span>
                        )}
                        {gi < s.golfers.length - 1 && <span className="text-charcoal-light">,</span>}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="hidden sm:table-cell text-right">{s.times_started}</td>
                <td className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="flex-1 max-w-[160px] h-2 bg-cream-dark rounded-full overflow-hidden">
                      <div
                        data-testid="points-bar"
                        className="h-full bg-masters-green"
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                    <span className="font-semibold tabular-nums w-16 text-right">
                      {s.total_points.toLocaleString()}
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `npx jest src/components/__tests__/TopSlotsTable.test.tsx`
Expected: all 4 tests PASS.

- [ ] **Step 3: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/TopSlotsTable.tsx src/components/__tests__/TopSlotsTable.test.tsx
git commit -m "feat(analytics): add TopSlotsTable component with tests"
```

---

## Chunk 3: Page wiring + navigation

### Task 4: Create the analytics page

**Files:**
- Create: `src/app/analytics/page.tsx`

**Reference patterns to match:**
- `src/app/history/page.tsx` and `src/app/page.tsx` — auth gate, header, card layout, loading/empty states.

- [ ] **Step 1: Create the page**

```tsx
// src/app/analytics/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import TopSlotsTable from '@/components/TopSlotsTable';
import type { TopSlotsResponse } from '@/app/api/analytics/top-slots/route';

export default function AnalyticsPage() {
  const { team, isLoading, logout } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<TopSlotsResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isLoading && !team) {
      router.push('/login');
    }
  }, [isLoading, team, router]);

  useEffect(() => {
    if (!team) return;
    fetch('/api/analytics/top-slots')
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load');
        return r.json();
      })
      .then((json: TopSlotsResponse) => setData(json))
      .catch(() => setError('Failed to load analytics'));
  }, [team]);

  if (isLoading || !team) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream">
        <p className="text-charcoal-light">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream">
      <header className="header">
        <div className="header-content">
          <h1 className="header-title">Analytics</h1>
          <div className="flex items-center gap-4">
            <Link href="/" className="text-white/90 hover:text-white text-sm">
              ← Home
            </Link>
            <div className="flex items-center gap-2 bg-white/10 rounded-full pl-4 pr-2 py-1">
              <span className="text-white/90 font-medium">{team.team_name}</span>
              <button
                onClick={logout}
                className="text-white/90 hover:text-white hover:bg-white/10 px-3 py-1 rounded-full text-sm transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 animate-fade-in">
        <div className="card">
          <div className="mb-6">
            <h2 className="font-display text-xl font-bold text-charcoal">Top 20 Slots</h2>
            <p className="text-sm text-charcoal-light">Slots with the most total fantasy points this season.</p>
          </div>

          {error ? (
            <p className="text-red-600 text-center py-8">{error}</p>
          ) : data === null ? (
            <p className="text-charcoal-light text-center py-8">Loading...</p>
          ) : (
            <TopSlotsTable slots={data.slots} maxPoints={data.max_points} />
          )}
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Visit the page in the dev server**

With `npm run dev` running, log in and navigate to `http://localhost:3000/analytics`.
Expected: page renders with header "Analytics", card titled "Top 20 Slots", and either the table or the empty state. Top-3 rows have the gold/silver/bronze rank styling. Bar widths look proportional. Clicking a team name navigates to `/team/<id>`.

- [ ] **Step 4: Commit**

```bash
git add src/app/analytics/page.tsx
git commit -m "feat(analytics): add /analytics page with top slots widget"
```

---

### Task 5: Add Analytics tile to home page Quick Actions

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Read the current Quick Actions grid**

Open `src/app/page.tsx` and locate the `{/* Quick Actions */}` grid (around lines 193–259). It contains tiles for Waivers, Past Results, Waiver History, and Adjustments, each a `<Link>` styled as a `card`.

- [ ] **Step 2: Insert an Analytics tile**

Add a new tile **before** the Adjustments tile (so Analytics sits in 4th position, Adjustments shifts to 5th). Use the same structure as the surrounding tiles. Use a chart-style icon path:

```tsx
<Link
  href="/analytics"
  className="card hover:shadow-golf-lg transition-all group cursor-pointer text-center py-6"
>
  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cream-dark to-sand mx-auto mb-3 flex items-center justify-center group-hover:scale-110 transition-transform">
    <svg className="w-6 h-6 text-masters-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3v18h18M7 14l3-3 4 4 5-5" />
    </svg>
  </div>
  <span className="font-medium text-charcoal">Analytics</span>
</Link>
```

- [ ] **Step 3: Verify Tailwind grid still wraps cleanly**

The grid uses `grid-cols-2 md:grid-cols-4`. With 5 user tiles (or 6 for commissioners), the second row will have 1 (or 2) tiles — that's fine and matches existing behavior.

In the dev server, visit `/` and confirm the Analytics tile is present and clickable, and that other tiles still work.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(home): link to analytics page from Quick Actions"
```

---

## Chunk 4: Final verification

### Task 6: Full test + type + build pass

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all suites pass, including `TopSlotsTable.test.tsx`.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Production build**

Run: `npm run build`
Expected: build succeeds; the `/analytics` and `/api/analytics/top-slots` routes appear in the route summary.

- [ ] **Step 5: Manual end-to-end smoke test**

With the dev server running:

1. Visit `/` while logged out → redirected to `/login`. Log in.
2. Click the "Analytics" tile in Quick Actions.
3. URL is now `/analytics`. Header reads "Analytics". Top slots table renders (or empty state if no completed tournaments).
4. Top 3 rows show rank-1/2/3 styling (gold/silver/bronze accents).
5. Each row's golfer list shows commas between names; the current golfer is bolded with a "current" pill.
6. Bar widths visually scale with point totals (top row at full width).
7. Click a team name in the first row → lands on `/team/<id>`.
8. Browser back to `/analytics` works; click "← Home" → back to `/`.
9. Resize the window down (~mobile) → "Starts" column hides; the rest stays readable.

If any check fails, fix and re-test before declaring done.

- [ ] **Step 6: No commit needed** (this task only runs verification)

---

## Out of Scope

Confirmed explicitly in the spec; do not add any of these in this plan:

- Other analytics widgets (tournament winners, team consistency, waiver win/loss, hindsight optimal, head-to-head matrix, slot usage heatmap)
- Per-golfer-per-tournament results cache (its own future spec)
- Filtering or date-range selectors on the top-slots table
- CSV export
- Server-side rendering of the analytics page (kept as `'use client'` to mirror the rest of the app)

---

## Notes for the Implementer

- **Caching gotcha:** `noStore()` + `dynamic = 'force-dynamic'` + `revalidate = 0` are all required on the API route. The project's CLAUDE.md documents this — Vercel/Next.js will cache responses without all three.
- **`@neondatabase/serverless` `sql` is the tagged-template form.** Pass arrays with `${arr}::int[]` casts (see existing patterns in `src/app/api/admin/*/route.ts` if you need more examples).
- **Don't add a unit test for the SQL aggregation.** It's straightforward and the project doesn't have a DB integration test harness — manual smoke test plus the production build is sufficient.
- **Reuse existing CSS classes** (`standings-table`, `rank-1/2/3`, `card`, `header`, `header-content`, `header-title`, `badge-gold`). Don't add new global CSS.
- **Type imports across server/client boundary:** Re-importing `TopSlotEntry` / `TopSlotsResponse` from the route file works because they're plain `interface` exports. If TypeScript complains about server-only code being pulled into a client component, switch to a `import type { ... }` and verify only types are imported (Next.js drops them at build time).
