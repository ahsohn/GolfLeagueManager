# Standings Graph Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an interactive line graph showing team ranking changes over the season to the home page.

**Architecture:** New API endpoint calculates cumulative points and rankings per tournament from lineups table. StandingsGraph component uses Recharts to render interactive line chart with legend-based highlighting.

**Tech Stack:** Next.js 14, TypeScript, Recharts, Tailwind CSS

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/app/api/standings/history/route.ts` | API endpoint returning historical rankings |
| Create | `src/components/StandingsGraph.tsx` | Recharts line graph with legend interaction |
| Modify | `src/app/page.tsx:177-179` | Add StandingsGraph section after standings table |
| Modify | `package.json` | Add recharts dependency |

---

## Chunk 1: Dependencies and API

### Task 1: Install Recharts

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install recharts**

```bash
npm install recharts
```

- [ ] **Step 2: Verify installation**

```bash
npm ls recharts
```
Expected: `recharts@2.x.x`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add recharts dependency for standings graph"
```

---

### Task 2: Create API Endpoint

**Files:**
- Create: `src/app/api/standings/history/route.ts`

- [ ] **Step 1: Create the API route file**

```typescript
import { NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { sql } from '@/lib/db';

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

interface TournamentPoints {
  tournament_id: string;
  tournament_name: string;
  deadline: string;
  team_id: number;
  team_name: string;
  points: number;
}

export async function GET() {
  noStore();
  try {
    // Get all completed tournaments with points per team
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
    ` as TournamentPoints[];

    if (rows.length === 0) {
      return NextResponse.json({ tournaments: [], teams: [] });
    }

    // Get unique tournaments in order
    const tournamentMap = new Map<string, string>();
    rows.forEach(row => {
      if (!tournamentMap.has(row.tournament_id)) {
        tournamentMap.set(row.tournament_id, row.tournament_name);
      }
    });
    const tournaments = Array.from(tournamentMap.values());

    // Get unique teams
    const teamMap = new Map<number, string>();
    rows.forEach(row => {
      if (!teamMap.has(row.team_id)) {
        teamMap.set(row.team_id, row.team_name);
      }
    });

    // Calculate cumulative points and rankings per tournament
    const teamIds = Array.from(teamMap.keys()).sort((a, b) => a - b);
    const cumulativePoints: Record<number, number> = {};
    teamIds.forEach(id => { cumulativePoints[id] = 0; });

    const rankingsPerTournament: Record<number, number[]> = {};
    teamIds.forEach(id => { rankingsPerTournament[id] = []; });

    let currentTournamentId = '';
    const tournamentPoints: Record<number, number> = {};

    rows.forEach((row, index) => {
      if (row.tournament_id !== currentTournamentId) {
        // New tournament - calculate rankings for previous if exists
        if (currentTournamentId !== '') {
          // Add points from previous tournament
          teamIds.forEach(id => {
            cumulativePoints[id] += (tournamentPoints[id] || 0);
          });

          // Calculate rankings based on cumulative points
          const sorted = teamIds
            .map(id => ({ id, points: cumulativePoints[id] }))
            .sort((a, b) => b.points - a.points);

          // Assign ranks (handle ties)
          let rank = 1;
          sorted.forEach((team, idx) => {
            if (idx > 0 && team.points < sorted[idx - 1].points) {
              rank = idx + 1;
            }
            rankingsPerTournament[team.id].push(rank);
          });
        }

        currentTournamentId = row.tournament_id;
        teamIds.forEach(id => { tournamentPoints[id] = 0; });
      }

      tournamentPoints[row.team_id] = Number(row.points);

      // Handle last tournament
      if (index === rows.length - 1) {
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
      }
    });

    // Build response
    const teams = teamIds.map((id, index) => ({
      team_id: id,
      team_name: teamMap.get(id) || '',
      color: TEAM_COLORS[index % TEAM_COLORS.length],
      rankings: rankingsPerTournament[id],
    }));

    return NextResponse.json({ tournaments, teams });
  } catch (error) {
    console.error('Standings history error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Test the API endpoint**

Run: `npm run dev`
Then: `curl http://localhost:3000/api/standings/history`
Expected: JSON with `tournaments` array and `teams` array (may be empty if no closed tournaments)

- [ ] **Step 3: Commit**

```bash
git add src/app/api/standings/history/route.ts
git commit -m "feat: add API endpoint for standings history"
```

---

## Chunk 2: Graph Component

### Task 3: Create StandingsGraph Component

**Files:**
- Create: `src/components/StandingsGraph.tsx`

- [ ] **Step 1: Create the component file**

```typescript
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
}

interface StandingsHistoryData {
  tournaments: string[];
  teams: TeamData[];
}

interface ChartDataPoint {
  tournament: string;
  [key: string]: string | number;
}

export default function StandingsGraph() {
  const [data, setData] = useState<StandingsHistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedTeam, setSelectedTeam] = useState<number | null>(null);

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

  // Transform data for Recharts
  const chartData: ChartDataPoint[] = data.tournaments.map((tournament, index) => {
    const point: ChartDataPoint = { tournament };
    data.teams.forEach(team => {
      point[`team_${team.team_id}`] = team.rankings[index];
    });
    return point;
  });

  const handleLegendClick = (teamId: number) => {
    setSelectedTeam(selectedTeam === teamId ? null : teamId);
  };

  // Abbreviate tournament names if too long
  const abbreviate = (name: string) => {
    if (name.length <= 15) return name;
    return name.substring(0, 12) + '...';
  };

  return (
    <div>
      {/* Chart */}
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
              reversed
              domain={[1, 13]}
              ticks={[1, 3, 5, 7, 9, 11, 13]}
              tick={{ fontSize: 12, fill: '#6B7280' }}
              label={{ value: 'Rank', angle: -90, position: 'insideLeft', fontSize: 12, fill: '#6B7280' }}
              width={50}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (active && payload && payload.length > 0) {
                  const teamEntry = payload[0];
                  const teamId = Number(String(teamEntry.dataKey).replace('team_', ''));
                  const team = data.teams.find(t => t.team_id === teamId);
                  return (
                    <div className="bg-white border border-cream-dark rounded-lg shadow-lg p-3">
                      <p className="font-semibold text-charcoal">{team?.team_name}</p>
                      <p className="text-sm text-charcoal-light">{label}</p>
                      <p className="text-sm font-medium" style={{ color: team?.color }}>
                        Rank: {teamEntry.value}
                      </p>
                    </div>
                  );
                }
                return null;
              }}
            />
            {data.teams.map(team => (
              <Line
                key={team.team_id}
                type="monotone"
                dataKey={`team_${team.team_id}`}
                stroke={team.color}
                strokeWidth={selectedTeam === null || selectedTeam === team.team_id ? 2 : 1}
                strokeOpacity={selectedTeam === null || selectedTeam === team.team_id ? 1 : 0.2}
                dot={false}
                activeDot={{ r: 6, strokeWidth: 2 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 mt-4">
        {data.teams.map(team => (
          <button
            key={team.team_id}
            onClick={() => handleLegendClick(team.team_id)}
            className={`
              flex items-center gap-2 px-2 py-1 rounded text-sm transition-all
              ${selectedTeam === team.team_id
                ? 'bg-cream-dark font-medium'
                : 'hover:bg-cream-dark/50'}
              ${selectedTeam !== null && selectedTeam !== team.team_id
                ? 'opacity-40'
                : ''}
            `}
          >
            <span
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: team.color }}
            />
            <span className="text-charcoal">{team.team_name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify component compiles**

Run: `npm run build`
Expected: Build succeeds with no TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add src/components/StandingsGraph.tsx
git commit -m "feat: add StandingsGraph component with Recharts"
```

---

## Chunk 3: Home Page Integration

### Task 4: Add Graph to Home Page

**Files:**
- Modify: `src/app/page.tsx:177-179`

- [ ] **Step 1: Add import at top of file**

Find the imports section at the top of `src/app/page.tsx` and add:
```typescript
import StandingsGraph from '@/components/StandingsGraph';
```

- [ ] **Step 2: Add graph section after standings table**

Find the closing `</div>` of the Standings Card (around line 177) and add this new section immediately after, before the `{/* Quick Actions */}` comment:

```typescript
        {/* Season Progress Graph */}
        <div className="card mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-display text-xl font-bold text-charcoal flex items-center gap-2">
              <svg className="w-5 h-5 text-masters-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
              </svg>
              Season Progress
            </h2>
          </div>
          <StandingsGraph />
        </div>
```

- [ ] **Step 3: Test locally**

Run: `npm run dev`
Navigate: `http://localhost:3000`
Expected:
- Graph card appears below standings table
- If no closed tournaments: shows "Graph available after first tournament completes"
- If closed tournaments exist: shows line chart with all teams

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: add standings graph to home page"
```

---

## Final Verification

- [ ] **Step 1: Run full build**

```bash
npm run build
```
Expected: Build succeeds with no errors

- [ ] **Step 2: Manual end-to-end test**

1. Start dev server: `npm run dev`
2. Log in as team owner
3. Navigate to home page
4. Verify graph section appears below standings
5. Click on team names in legend - verify highlighting works
6. Test on mobile viewport - verify responsive layout

- [ ] **Step 3: Final commit if any adjustments needed**

```bash
git add -A
git commit -m "chore: final adjustments for standings graph"
```
