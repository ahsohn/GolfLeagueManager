# Analytics Points-Progress Graph — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a cumulative-points-over-time graph to `/analytics`, modeled on the front-page rank graph, and upgrade both graphs to support multi-select legend highlighting.

**Architecture:** Extract the standings-history transform into a pure, testable lib function and extend its output with `cumulative_points`. Refactor `StandingsGraph` to take a `metric: 'rank' | 'points'` prop and replace single-select highlight state with a `Set<number>`. Render the existing component on `/analytics` with `metric="points"`; front page keeps the default `metric="rank"`.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Recharts, Tailwind, Jest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-05-10-analytics-points-graph-design.md`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/lib/standings-history.ts` | Create | Pure function `buildStandingsHistory(rows)` that turns the SQL result rows into `{ tournaments, teams: [...{rankings, cumulative_points}] }`. No DB / no Next imports. |
| `src/lib/__tests__/standings-history.test.ts` | Create | Unit tests for `buildStandingsHistory`. |
| `src/app/api/standings/history/route.ts` | Modify | Thin wrapper: run the SQL, call `buildStandingsHistory`, return JSON. `TEAM_COLORS` stays here (it's wire-format, not domain logic). |
| `src/components/StandingsGraph.tsx` | Modify | Add `metric?: 'rank' \| 'points'` prop (default `'rank'`). Change `selectedTeam: number \| null` → `selectedTeams: Set<number>`. Branch Y-axis config + tooltip on `metric`. |
| `src/components/__tests__/StandingsGraph.test.tsx` | Create | Render tests: default rank behavior, `metric="points"` behavior, multi-select toggle, empty state. |
| `src/app/analytics/page.tsx` | Modify | Add "Season Points Progress" card above the Top 20 Slots card, render `<StandingsGraph metric="points" />`. |

Files that change together stay together. Pure data logic lives in `src/lib/`; UI in `src/components/`; route is a thin wrapper.

---

## Chunk 1: Extract pure standings-history transform (refactor, no behavior change)

This chunk has zero user-visible effect. It moves the transform out of the route into a testable pure function. After this chunk, all existing functionality works exactly as before, and we have test coverage on the transform.

### Task 1: Extract `buildStandingsHistory` pure function

**Files:**
- Create: `src/lib/standings-history.ts`
- Create: `src/lib/__tests__/standings-history.test.ts`
- Modify: `src/app/api/standings/history/route.ts`

- [ ] **Step 1: Write the failing test for the pure function**

Create `src/lib/__tests__/standings-history.test.ts`:

```ts
import { buildStandingsHistory, type StandingsHistoryRow } from '@/lib/standings-history';

const COLORS = ['#A', '#B', '#C'];

describe('buildStandingsHistory', () => {
  it('returns empty result when given no rows', () => {
    const result = buildStandingsHistory([], COLORS);
    expect(result).toEqual({ tournaments: [], teams: [] });
  });

  it('preserves tournament order from input (ordered by deadline asc)', () => {
    const rows: StandingsHistoryRow[] = [
      // Tournament T1 (earlier deadline) — both teams play
      { tournament_id: 'T1', tournament_name: 'Open', deadline: '2026-01-01', team_id: 1, team_name: 'Alpha', points: 100 },
      { tournament_id: 'T1', tournament_name: 'Open', deadline: '2026-01-01', team_id: 2, team_name: 'Beta',  points: 50 },
      // Tournament T2
      { tournament_id: 'T2', tournament_name: 'Masters', deadline: '2026-02-01', team_id: 1, team_name: 'Alpha', points: 25 },
      { tournament_id: 'T2', tournament_name: 'Masters', deadline: '2026-02-01', team_id: 2, team_name: 'Beta',  points: 100 },
    ];
    const result = buildStandingsHistory(rows, COLORS);
    expect(result.tournaments).toEqual(['Open', 'Masters']);
  });

  it('computes rankings based on cumulative points per tournament', () => {
    const rows: StandingsHistoryRow[] = [
      { tournament_id: 'T1', tournament_name: 'Open', deadline: '2026-01-01', team_id: 1, team_name: 'Alpha', points: 100 },
      { tournament_id: 'T1', tournament_name: 'Open', deadline: '2026-01-01', team_id: 2, team_name: 'Beta',  points: 50 },
      { tournament_id: 'T2', tournament_name: 'Masters', deadline: '2026-02-01', team_id: 1, team_name: 'Alpha', points: 25 },
      { tournament_id: 'T2', tournament_name: 'Masters', deadline: '2026-02-01', team_id: 2, team_name: 'Beta',  points: 100 },
    ];
    const result = buildStandingsHistory(rows, COLORS);
    const alpha = result.teams.find(t => t.team_id === 1)!;
    const beta  = result.teams.find(t => t.team_id === 2)!;
    // After T1: Alpha 100, Beta 50 → ranks 1, 2
    // After T2: Alpha 125, Beta 150 → ranks 2, 1
    expect(alpha.rankings).toEqual([1, 2]);
    expect(beta.rankings).toEqual([2, 1]);
  });

  it('assigns colors cyclically from the provided palette', () => {
    const rows: StandingsHistoryRow[] = [
      { tournament_id: 'T1', tournament_name: 'Open', deadline: '2026-01-01', team_id: 1, team_name: 'Alpha', points: 0 },
      { tournament_id: 'T1', tournament_name: 'Open', deadline: '2026-01-01', team_id: 2, team_name: 'Beta',  points: 0 },
      { tournament_id: 'T1', tournament_name: 'Open', deadline: '2026-01-01', team_id: 3, team_name: 'Gamma', points: 0 },
      { tournament_id: 'T1', tournament_name: 'Open', deadline: '2026-01-01', team_id: 4, team_name: 'Delta', points: 0 },
    ];
    const result = buildStandingsHistory(rows, ['#A', '#B', '#C']);
    expect(result.teams.map(t => t.color)).toEqual(['#A', '#B', '#C', '#A']);
  });

  it('handles ties in rankings (same rank for tied teams, next rank skips)', () => {
    const rows: StandingsHistoryRow[] = [
      { tournament_id: 'T1', tournament_name: 'Open', deadline: '2026-01-01', team_id: 1, team_name: 'Alpha', points: 100 },
      { tournament_id: 'T1', tournament_name: 'Open', deadline: '2026-01-01', team_id: 2, team_name: 'Beta',  points: 100 },
      { tournament_id: 'T1', tournament_name: 'Open', deadline: '2026-01-01', team_id: 3, team_name: 'Gamma', points: 50 },
    ];
    const result = buildStandingsHistory(rows, COLORS);
    const a = result.teams.find(t => t.team_id === 1)!;
    const b = result.teams.find(t => t.team_id === 2)!;
    const g = result.teams.find(t => t.team_id === 3)!;
    expect(a.rankings[0]).toBe(1);
    expect(b.rankings[0]).toBe(1);
    expect(g.rankings[0]).toBe(3); // standard competition ranking — 2 is skipped
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails (no file yet)**

```
npm test -- standings-history
```
Expected: FAIL — `Cannot find module '@/lib/standings-history'`.

- [ ] **Step 3: Implement the pure function**

Create `src/lib/standings-history.ts` by moving the transformation logic out of the existing route. Preserve existing behavior exactly — do **not** add `cumulative_points` yet (that's the next task; we want a refactor with no behavior change here).

```ts
// src/lib/standings-history.ts

export interface StandingsHistoryRow {
  tournament_id: string;
  tournament_name: string;
  deadline: string;
  team_id: number;
  team_name: string;
  points: number | string; // SQL may return string for SUM
}

export interface StandingsHistoryTeam {
  team_id: number;
  team_name: string;
  color: string;
  rankings: number[];
}

export interface StandingsHistoryResult {
  tournaments: string[];
  teams: StandingsHistoryTeam[];
}

export function buildStandingsHistory(
  rows: StandingsHistoryRow[],
  palette: string[],
): StandingsHistoryResult {
  if (rows.length === 0) {
    return { tournaments: [], teams: [] };
  }

  // Unique tournaments in input order (caller orders by deadline asc)
  const tournamentMap = new Map<string, string>();
  rows.forEach(row => {
    if (!tournamentMap.has(row.tournament_id)) {
      tournamentMap.set(row.tournament_id, row.tournament_name);
    }
  });
  const tournaments = Array.from(tournamentMap.values());

  // Unique teams
  const teamMap = new Map<number, string>();
  rows.forEach(row => {
    if (!teamMap.has(row.team_id)) {
      teamMap.set(row.team_id, row.team_name);
    }
  });

  const teamIds = Array.from(teamMap.keys()).sort((a, b) => a - b);

  const cumulativePoints: Record<number, number> = {};
  const rankingsPerTournament: Record<number, number[]> = {};
  teamIds.forEach(id => {
    cumulativePoints[id] = 0;
    rankingsPerTournament[id] = [];
  });

  const tournamentPoints: Record<number, number> = {};
  let currentTournamentId = '';

  const flushTournament = () => {
    teamIds.forEach(id => {
      cumulativePoints[id] += (tournamentPoints[id] || 0);
    });
    const sorted = teamIds
      .map(id => ({ id, points: cumulativePoints[id] }))
      .sort((a, b) => b.points - a.points);
    let rank = 1;
    sorted.forEach((team, idx) => {
      if (idx > 0 && team.points < sorted[idx - 1].points) {
        rank = idx + 1;
      }
      rankingsPerTournament[team.id].push(rank);
    });
  };

  rows.forEach((row, index) => {
    if (row.tournament_id !== currentTournamentId) {
      if (currentTournamentId !== '') flushTournament();
      currentTournamentId = row.tournament_id;
      teamIds.forEach(id => { tournamentPoints[id] = 0; });
    }
    tournamentPoints[row.team_id] = Number(row.points);
    if (index === rows.length - 1) flushTournament();
  });

  const teams: StandingsHistoryTeam[] = teamIds.map((id, index) => ({
    team_id: id,
    team_name: teamMap.get(id) || '',
    color: palette[index % palette.length],
    rankings: rankingsPerTournament[id],
  }));

  return { tournaments, teams };
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```
npm test -- standings-history
```
Expected: PASS — all 5 tests.

- [ ] **Step 5: Wire the pure function into the route**

Edit `src/app/api/standings/history/route.ts`. Keep the SQL query and `TEAM_COLORS` constant where they are; replace the inline transformation with a call to `buildStandingsHistory`.

```ts
import { NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { sql } from '@/lib/db';
import { buildStandingsHistory, type StandingsHistoryRow } from '@/lib/standings-history';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const TEAM_COLORS = [
  '#2E7D32', '#1565C0', '#C62828', '#F9A825', '#6A1B9A',
  '#00838F', '#EF6C00', '#4527A0', '#00695C', '#AD1457',
  '#558B2F', '#D84315', '#37474F',
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
```

- [ ] **Step 6: Run the full test suite to make sure nothing broke**

```
npm test
```
Expected: all tests pass (the standings-history tests plus any pre-existing tests).

- [ ] **Step 7: Manual smoke check — front page graph still renders correctly**

```
npm run dev
```
Open http://localhost:3000, log in, scroll to "Season Progress". The rank graph should render identically to before this refactor.

- [ ] **Step 8: Commit**

```
git add src/lib/standings-history.ts src/lib/__tests__/standings-history.test.ts src/app/api/standings/history/route.ts
git commit -m "refactor(standings-history): extract pure transform into src/lib"
```

---

## Chunk 2: Add `cumulative_points` to the standings-history output

### Task 2: Extend `buildStandingsHistory` to emit cumulative_points

**Files:**
- Modify: `src/lib/standings-history.ts`
- Modify: `src/lib/__tests__/standings-history.test.ts`

- [ ] **Step 1: Write the failing test for `cumulative_points`**

Append to `src/lib/__tests__/standings-history.test.ts`:

```ts
describe('buildStandingsHistory cumulative_points', () => {
  const rows: StandingsHistoryRow[] = [
    { tournament_id: 'T1', tournament_name: 'Open',    deadline: '2026-01-01', team_id: 1, team_name: 'Alpha', points: 100 },
    { tournament_id: 'T1', tournament_name: 'Open',    deadline: '2026-01-01', team_id: 2, team_name: 'Beta',  points: 50 },
    { tournament_id: 'T2', tournament_name: 'Masters', deadline: '2026-02-01', team_id: 1, team_name: 'Alpha', points: 25 },
    { tournament_id: 'T2', tournament_name: 'Masters', deadline: '2026-02-01', team_id: 2, team_name: 'Beta',  points: 100 },
  ];

  it('includes cumulative_points per team, same length as tournaments', () => {
    const result = buildStandingsHistory(rows, ['#A', '#B']);
    expect(result.teams[0].cumulative_points).toHaveLength(result.tournaments.length);
    expect(result.teams[1].cumulative_points).toHaveLength(result.tournaments.length);
  });

  it('cumulative_points are running totals per team', () => {
    const result = buildStandingsHistory(rows, ['#A', '#B']);
    const alpha = result.teams.find(t => t.team_id === 1)!;
    const beta  = result.teams.find(t => t.team_id === 2)!;
    expect(alpha.cumulative_points).toEqual([100, 125]);
    expect(beta.cumulative_points).toEqual([50, 150]);
  });

  it('cumulative_points are monotonically non-decreasing', () => {
    const result = buildStandingsHistory(rows, ['#A', '#B']);
    for (const team of result.teams) {
      for (let i = 1; i < team.cumulative_points.length; i++) {
        expect(team.cumulative_points[i]).toBeGreaterThanOrEqual(team.cumulative_points[i - 1]);
      }
    }
  });

  it('returns 0 for a team that played no eligible tournaments', () => {
    const sparseRows: StandingsHistoryRow[] = [
      { tournament_id: 'T1', tournament_name: 'Open', deadline: '2026-01-01', team_id: 1, team_name: 'Alpha', points: 100 },
      { tournament_id: 'T1', tournament_name: 'Open', deadline: '2026-01-01', team_id: 2, team_name: 'Beta',  points: 0 },
    ];
    const result = buildStandingsHistory(sparseRows, ['#A', '#B']);
    const beta = result.teams.find(t => t.team_id === 2)!;
    expect(beta.cumulative_points).toEqual([0]);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```
npm test -- standings-history
```
Expected: FAIL with "Property 'cumulative_points' does not exist on type 'StandingsHistoryTeam'" or runtime "expected undefined to have length…".

- [ ] **Step 3: Update the type and capture cumulative points in the flush**

Edit `src/lib/standings-history.ts`:

1. Add `cumulative_points: number[];` to `StandingsHistoryTeam`.
2. Initialize a parallel `cumulativePointsPerTournament: Record<number, number[]>` alongside `rankingsPerTournament`.
3. In `flushTournament`, after updating each team's `cumulativePoints[id]`, push the new value into `cumulativePointsPerTournament[id]`.
4. Include `cumulative_points` in the returned `teams` array.

Concrete diff:

```ts
export interface StandingsHistoryTeam {
  team_id: number;
  team_name: string;
  color: string;
  rankings: number[];
  cumulative_points: number[]; // NEW
}
```

```ts
  const cumulativePoints: Record<number, number> = {};
  const rankingsPerTournament: Record<number, number[]> = {};
  const cumulativePointsPerTournament: Record<number, number[]> = {}; // NEW
  teamIds.forEach(id => {
    cumulativePoints[id] = 0;
    rankingsPerTournament[id] = [];
    cumulativePointsPerTournament[id] = []; // NEW
  });
```

```ts
  const flushTournament = () => {
    teamIds.forEach(id => {
      cumulativePoints[id] += (tournamentPoints[id] || 0);
      cumulativePointsPerTournament[id].push(cumulativePoints[id]); // NEW
    });
    // rest unchanged
  };
```

```ts
  const teams: StandingsHistoryTeam[] = teamIds.map((id, index) => ({
    team_id: id,
    team_name: teamMap.get(id) || '',
    color: palette[index % palette.length],
    rankings: rankingsPerTournament[id],
    cumulative_points: cumulativePointsPerTournament[id], // NEW
  }));
```

- [ ] **Step 4: Run the test to confirm it passes**

```
npm test -- standings-history
```
Expected: PASS — all standings-history tests (original 5 + new 4).

- [ ] **Step 5: Commit**

```
git add src/lib/standings-history.ts src/lib/__tests__/standings-history.test.ts
git commit -m "feat(standings-history): emit cumulative_points per team per tournament"
```

---

## Chunk 3: Generalize `StandingsGraph` (metric prop + multi-select)

### Task 3: Add `metric` prop and multi-select selection state to `StandingsGraph`

**Files:**
- Create: `src/components/__tests__/StandingsGraph.test.tsx`
- Modify: `src/components/StandingsGraph.tsx`

Recharts SVG output is awkward to assert against in jsdom (no layout dimensions). The legend buttons are real DOM and carry the selection state via their classes — assert on those.

- [ ] **Step 1: Write the failing component tests**

Create `src/components/__tests__/StandingsGraph.test.tsx`:

```tsx
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import StandingsGraph from '../StandingsGraph';

const sampleResponse = {
  tournaments: ['Open', 'Masters'],
  teams: [
    { team_id: 1, team_name: 'Alpha', color: '#A', rankings: [1, 2], cumulative_points: [100, 125] },
    { team_id: 2, team_name: 'Beta',  color: '#B', rankings: [2, 1], cumulative_points: [50, 150] },
    { team_id: 3, team_name: 'Gamma', color: '#C', rankings: [3, 3], cumulative_points: [10, 20]  },
  ],
};

beforeEach(() => {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve(sampleResponse),
    } as Response),
  ) as jest.Mock;
});

afterEach(() => {
  jest.resetAllMocks();
});

const findLegendButton = async (teamName: string) => {
  const btn = await screen.findByRole('button', { name: new RegExp(teamName) });
  return btn;
};

describe('StandingsGraph', () => {
  it('renders a legend button for each team after fetch', async () => {
    render(<StandingsGraph />);
    expect(await findLegendButton('Alpha')).toBeInTheDocument();
    expect(await findLegendButton('Beta')).toBeInTheDocument();
    expect(await findLegendButton('Gamma')).toBeInTheDocument();
  });

  it('renders the empty state when the API returns no tournaments', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ tournaments: [], teams: [] }),
    });
    render(<StandingsGraph />);
    expect(
      await screen.findByText(/Graph available after first tournament completes/i),
    ).toBeInTheDocument();
  });

  describe('multi-select highlighting', () => {
    it('starts with no team dimmed (all selected)', async () => {
      render(<StandingsGraph />);
      const alpha = await findLegendButton('Alpha');
      const beta  = await findLegendButton('Beta');
      expect(alpha.className).not.toMatch(/opacity-40/);
      expect(beta.className).not.toMatch(/opacity-40/);
    });

    it('dims other teams when one is selected', async () => {
      render(<StandingsGraph />);
      const alpha = await findLegendButton('Alpha');
      const beta  = await findLegendButton('Beta');
      fireEvent.click(alpha);
      expect(alpha.className).not.toMatch(/opacity-40/);
      expect(beta.className).toMatch(/opacity-40/);
    });

    it('keeps multiple teams highlighted when two are clicked', async () => {
      render(<StandingsGraph />);
      const alpha = await findLegendButton('Alpha');
      const beta  = await findLegendButton('Beta');
      const gamma = await findLegendButton('Gamma');
      fireEvent.click(alpha);
      fireEvent.click(beta);
      expect(alpha.className).not.toMatch(/opacity-40/);
      expect(beta.className).not.toMatch(/opacity-40/);
      expect(gamma.className).toMatch(/opacity-40/);
    });

    it('deselects a team when its legend button is clicked again', async () => {
      render(<StandingsGraph />);
      const alpha = await findLegendButton('Alpha');
      const beta  = await findLegendButton('Beta');
      fireEvent.click(alpha);
      fireEvent.click(alpha); // toggle off
      // Back to all-selected (no dimming)
      expect(alpha.className).not.toMatch(/opacity-40/);
      expect(beta.className).not.toMatch(/opacity-40/);
    });
  });

  describe('metric prop', () => {
    it('defaults to rank metric (Y-axis label says "Rank")', async () => {
      const { container } = render(<StandingsGraph />);
      await findLegendButton('Alpha');
      // Recharts renders axis labels as <text> elements inside the SVG
      await waitFor(() => {
        expect(container.querySelector('svg')).toBeInTheDocument();
      });
      expect(container.textContent).toContain('Rank');
    });

    it('uses Points label when metric="points"', async () => {
      const { container } = render(<StandingsGraph metric="points" />);
      await findLegendButton('Alpha');
      await waitFor(() => {
        expect(container.querySelector('svg')).toBeInTheDocument();
      });
      expect(container.textContent).toContain('Points');
    });
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```
npm test -- StandingsGraph
```
Expected: FAIL — multi-select and metric prop tests fail because current behavior is single-select and rank-only.

- [ ] **Step 3: Refactor `StandingsGraph` to add `metric` prop + multi-select**

Replace the contents of `src/components/StandingsGraph.tsx` with:

```tsx
'use client';

import { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface TeamData {
  team_id: number;
  team_name: string;
  color: string;
  rankings: number[];
  cumulative_points: number[];
}

interface StandingsHistoryData {
  tournaments: string[];
  teams: TeamData[];
}

interface ChartDataPoint {
  tournament: string;
  [key: string]: string | number;
}

type Metric = 'rank' | 'points';

interface Props {
  metric?: Metric;
}

export default function StandingsGraph({ metric = 'rank' }: Props) {
  const [data, setData] = useState<StandingsHistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedTeams, setSelectedTeams] = useState<Set<number>>(new Set());

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/standings/history');
        if (!res.ok) throw new Error('Failed to fetch');
        const json = await res.json();
        setData(json);
      } catch {
        setError('Failed to load standings history');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="h-[300px] md:h-[400px] bg-cream-dark/30 rounded-lg animate-pulse flex items-center justify-center">
        <p className="text-charcoal-light">Loading graph...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-[300px] md:h-[400px] flex items-center justify-center">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  if (!data || data.tournaments.length === 0) {
    return (
      <div className="h-[300px] md:h-[400px] flex items-center justify-center bg-cream-dark/20 rounded-lg">
        <p className="text-charcoal-light italic">Graph available after first tournament completes</p>
      </div>
    );
  }

  const valueFor = (team: TeamData, i: number) =>
    metric === 'rank' ? team.rankings[i] : team.cumulative_points[i];

  const chartData: ChartDataPoint[] = data.tournaments.map((tournament, index) => {
    const point: ChartDataPoint = { tournament };
    data.teams.forEach(team => {
      point[`team_${team.team_id}`] = valueFor(team, index);
    });
    return point;
  });

  const toggleTeam = (teamId: number) => {
    setSelectedTeams(prev => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  };

  const isHighlighted = (teamId: number) =>
    selectedTeams.size === 0 || selectedTeams.has(teamId);

  const abbreviate = (name: string) => {
    if (name.length <= 15) return name;
    return name.substring(0, 12) + '...';
  };

  const yAxisProps =
    metric === 'rank'
      ? {
          reversed: true as const,
          domain: [1, 13] as [number, number],
          ticks: [1, 3, 5, 7, 9, 11, 13],
          label: { value: 'Rank', angle: -90, position: 'insideLeft' as const, fontSize: 12, fill: '#6B7280' },
          width: 50,
          tickFormatter: undefined,
        }
      : {
          reversed: false as const,
          domain: [0, 'dataMax'] as [number, string],
          ticks: undefined,
          label: { value: 'Points', angle: -90, position: 'insideLeft' as const, fontSize: 12, fill: '#6B7280' },
          width: 70,
          tickFormatter: (v: number) => v.toLocaleString(),
        };

  return (
    <div>
      <div className="h-[300px] md:h-[400px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 20, right: 20, left: 0, bottom: 20 }}>
            <XAxis
              dataKey="tournament"
              tick={{ fontSize: 11, fill: '#6B7280' }}
              tickFormatter={abbreviate}
              angle={-45}
              textAnchor="end"
              height={80}
            />
            <YAxis
              {...yAxisProps}
              tick={{ fontSize: 12, fill: '#6B7280' }}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (active && payload && payload.length > 0) {
                  const teamEntry = payload[0];
                  const teamId = Number(String(teamEntry.dataKey).replace('team_', ''));
                  const team = data.teams.find(t => t.team_id === teamId);
                  const value = teamEntry.value as number;
                  const valueLabel =
                    metric === 'rank'
                      ? `Rank: ${value}`
                      : `Points: ${value.toLocaleString()}`;
                  return (
                    <div className="bg-white border border-cream-dark rounded-lg shadow-lg p-3">
                      <p className="font-semibold text-charcoal">{team?.team_name}</p>
                      <p className="text-sm text-charcoal-light">{label}</p>
                      <p className="text-sm font-medium" style={{ color: team?.color }}>
                        {valueLabel}
                      </p>
                    </div>
                  );
                }
                return null;
              }}
            />
            {data.teams.map(team => {
              const highlighted = isHighlighted(team.team_id);
              return (
                <Line
                  key={team.team_id}
                  type="linear"
                  dataKey={`team_${team.team_id}`}
                  stroke={team.color}
                  strokeWidth={highlighted ? 2 : 1}
                  strokeOpacity={highlighted ? 1 : 0.2}
                  dot={false}
                  activeDot={{ r: 6, strokeWidth: 2 }}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 mt-4">
        {data.teams.map(team => {
          const isSelected = selectedTeams.has(team.team_id);
          const anySelected = selectedTeams.size > 0;
          const dimmed = anySelected && !isSelected;
          return (
            <button
              key={team.team_id}
              onClick={() => toggleTeam(team.team_id)}
              aria-pressed={isSelected}
              className={`
                flex items-center gap-2 px-2 py-1 rounded text-sm transition-all
                ${isSelected ? 'bg-cream-dark font-medium' : 'hover:bg-cream-dark/50'}
                ${dimmed ? 'opacity-40' : ''}
              `}
            >
              <span
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: team.color }}
              />
              <span className="text-charcoal">{team.team_name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

Key changes vs. the previous version:
- New `metric` prop with default `'rank'` → existing front-page callsite needs no change.
- `selectedTeam: number | null` → `selectedTeams: Set<number>`. Empty set means "show all" (no dimming).
- `valueFor` picks `rankings[i]` or `cumulative_points[i]` based on `metric`.
- Y-axis config and tooltip text branch on `metric`.
- Legend button toggles set membership and exposes state via `aria-pressed`.

- [ ] **Step 4: Run the component tests**

```
npm test -- StandingsGraph
```
Expected: PASS — all 8 tests in the component test file.

- [ ] **Step 5: Run the full test suite**

```
npm test
```
Expected: every test passes.

- [ ] **Step 6: Manual smoke check — front page rank graph still works**

```
npm run dev
```
Open http://localhost:3000, scroll to "Season Progress". Click multiple team names. Confirm:
- Clicking a team highlights its line and dims others.
- Clicking a second team adds it to the highlighted set.
- Clicking a selected team again deselects it.
- With nothing selected, all lines show at full opacity (default state).
- Y-axis still shows "Rank", reversed 1→13.

- [ ] **Step 7: Commit**

```
git add src/components/StandingsGraph.tsx src/components/__tests__/StandingsGraph.test.tsx
git commit -m "feat(graph): add metric prop and multi-select to StandingsGraph"
```

---

## Chunk 4: Render the points graph on the analytics page

### Task 4: Add "Season Points Progress" card to `/analytics`

**Files:**
- Modify: `src/app/analytics/page.tsx`

- [ ] **Step 1: Add the import and the new card**

Edit `src/app/analytics/page.tsx`:

1. Add `import StandingsGraph from '@/components/StandingsGraph';` next to the existing `TopSlotsTable` import.
2. Inside `<main>`, add a new card *above* the existing Top 20 Slots card:

```tsx
<div className="card mb-8">
  <div className="flex items-center justify-between mb-6">
    <h2 className="font-display text-xl font-bold text-charcoal flex items-center gap-2">
      <svg className="w-5 h-5 text-masters-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3v18h18M7 14l3-3 4 4 5-5" />
      </svg>
      Season Points Progress
    </h2>
  </div>
  <StandingsGraph metric="points" />
</div>
```

- [ ] **Step 2: Run typecheck via the build**

```
npm run build
```
Expected: build succeeds. (This is the only typecheck command available in this repo — `next build` runs tsc.)

If you want a faster check while iterating:

```
npx tsc --noEmit
```

- [ ] **Step 3: Manual verification — analytics page**

```
npm run dev
```
Open http://localhost:3000/analytics. Confirm:
- A new "Season Points Progress" card appears above "Top 20 Slots".
- The graph renders with team lines ascending from left to right (cumulative).
- Y-axis label reads "Points", values show thousands separators on hover tooltip.
- Click one team — line stays full opacity, others dim.
- Click a second team — both stay full opacity, all others dim.
- Click a selected team again — it deselects (returns to dimmed state).
- Click all selected teams off — all teams return to full opacity.
- Existing front page (`/`) still shows the rank graph with the same multi-select behavior.

- [ ] **Step 4: Commit**

```
git add src/app/analytics/page.tsx
git commit -m "feat(analytics): add Season Points Progress graph"
```

---

## Final Verification Checklist

- [ ] `npm test` — all tests pass (standings-history × 9, StandingsGraph × 8, plus pre-existing).
- [ ] `npm run build` — succeeds with no type errors.
- [ ] Front page rank graph: legend multi-select works as expected.
- [ ] Analytics page points graph: lines ascend, multi-select works, tooltip shows "Points: X,XXX".
- [ ] Empty-state path (no closed tournaments) renders the existing message on both graphs.

## YAGNI Notes

- No new API endpoint — extend the existing one.
- No new shared selection hook — selection state lives in the component because there's exactly one consumer per page.
- No per-tournament-points view — the spec is cumulative-only.
- No hide-others mode — dimming is the agreed behavior.
- No persistence of selected teams across sessions — selection is ephemeral.
