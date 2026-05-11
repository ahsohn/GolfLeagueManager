# Analytics: Season Points Progress Graph

**Date:** 2026-05-10
**Status:** Approved

## Summary

Add a "Season Points Progress" graph to `/analytics` modeled on the front-page rank graph (`StandingsGraph`), but with cumulative season points on the Y-axis instead of rank. The legend supports multi-select highlighting: clicking team names toggles them into a selected set; selected teams render at full opacity while unselected teams dim to 0.2. The front-page rank graph is upgraded to use the same multi-select behavior.

## Motivation

The front page shows team trajectory by rank. Rank flattens the magnitude of leads — two teams can be ranked #1 and #2 whether they're tied or 500 points apart. A points-over-time view makes those gaps legible. Multi-select lets a viewer compare any subset of teams without the rest crowding the chart.

## Approach

**Shared component with a `metric` prop.**

`StandingsGraph` is refactored to accept `metric: 'rank' | 'points'` (default `'rank'`). Both pages render the same component with different props. This is preferred over separate components because the two graphs share their data source, X-axis, legend, and overall Recharts structure — only the Y-axis config and tooltip label differ.

## Components

### API: `/api/standings/history`

Extend the existing response to include cumulative points per team. The route already computes `cumulativePoints` internally before deriving rankings; expose it.

Response shape (additive change — existing `rankings` field stays):

```ts
{
  tournaments: string[];
  teams: Array<{
    team_id: number;
    team_name: string;
    color: string;
    rankings: number[];          // existing
    cumulative_points: number[]; // new — same length as tournaments
  }>;
}
```

`cumulative_points[i]` is the team's running season total after tournament `i`.

### Component: `StandingsGraph`

New prop:

```ts
interface Props {
  metric?: 'rank' | 'points'; // default 'rank'
}
```

State change:

```ts
// before
const [selectedTeam, setSelectedTeam] = useState<number | null>(null);

// after
const [selectedTeams, setSelectedTeams] = useState<Set<number>>(new Set());
```

Selection semantics:
- Empty set = all teams shown at full opacity (current default behavior).
- Non-empty set = teams in the set render at opacity 1.0 / strokeWidth 2; teams not in the set render at opacity 0.2 / strokeWidth 1.
- Clicking a legend button toggles that team's membership in the set.

Y-axis branching:
- `metric === 'rank'` (current): `reversed`, `domain={[1, 13]}`, `ticks={[1, 3, 5, 7, 9, 11, 13]}`, label "Rank".
- `metric === 'points'`: not reversed, `domain={[0, 'dataMax']}`, label "Points", tick formatter with thousands separators (e.g. `(v) => v.toLocaleString()`).

Tooltip branching:
- `metric === 'rank'`: "Rank: {value}" (current).
- `metric === 'points'`: "Points: {value.toLocaleString()}".

Data key for `Line` switches: for points, reads `team.cumulative_points[i]` instead of `team.rankings[i]` when building the Recharts data shape.

### Pages

- `src/app/page.tsx` — unchanged (default `metric="rank"`).
- `src/app/analytics/page.tsx` — add a new card above "Top 20 Slots":

```tsx
<div className="card mb-8">
  <div className="flex items-center justify-between mb-6">
    <h2 className="font-display text-xl font-bold text-charcoal flex items-center gap-2">
      <svg className="w-5 h-5 text-masters-green" ... />
      Season Points Progress
    </h2>
  </div>
  <StandingsGraph metric="points" />
</div>
```

## Data Flow

```
Browser → GET /api/standings/history
       → component receives { tournaments, teams: [...{rankings, cumulative_points}] }
       → builds Recharts data points keyed by team_id
       → renders LineChart with branched Y-axis + legend with Set-based selection
```

One API call serves both graphs. Each page mounts its own `StandingsGraph` instance, so the API is hit once per page.

## Error Handling

- No closed tournaments → existing empty state ("Graph available after first tournament completes") reused.
- Cumulative points of 0 for a team (no points yet) → line renders flat at 0; not an error.
- API fetch failure → existing error state reused.

## Testing

**API**

- Add a unit test for `/api/standings/history`: feed synthetic tournament/lineup rows, assert each team's `cumulative_points` array has length equal to `tournaments.length` and values are monotonically non-decreasing.

**Component**

- Render `<StandingsGraph metric="points" />` with mocked fetch, assert Y-axis label is "Points" and not reversed.
- Click two legend buttons, assert both teams' lines have full opacity and a third team's line has reduced opacity.
- Click a selected legend button again, assert it's deselected.
- With empty selection, assert all teams render at full opacity.
- Render `<StandingsGraph />` (default), assert it still behaves as rank graph.

## Files Touched

| File | Change |
|---|---|
| `src/app/api/standings/history/route.ts` | Add `cumulative_points` to each team in response |
| `src/components/StandingsGraph.tsx` | Add `metric` prop, switch to `Set<number>` selection, branch Y-axis/tooltip |
| `src/app/analytics/page.tsx` | Add "Season Points Progress" card rendering `<StandingsGraph metric="points" />` |

## Out of Scope

- Per-tournament (non-cumulative) view.
- Hiding unselected teams entirely (decision: dim, don't hide).
- New API endpoint — extend the existing one.
- Other analytics widgets.
