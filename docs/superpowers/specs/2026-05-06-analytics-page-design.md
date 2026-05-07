# Analytics Page Design

## Overview

Add a new `/analytics` page that hosts league-wide statistics. The first (and only) widget in v1 is a **Top 20 Slots** ranked table showing which roster slots have produced the most fantasy points across the season, with all golfers who have ever occupied each slot listed inline.

The page is designed as a container for future analytics. Other ideas were brainstormed (tournament winners, team consistency, waiver win/loss, hindsight optimal lineups, head-to-head matrix, slot usage heatmap) and **deferred to follow-up specs**. Anything requiring per-golfer-per-tournament point data — notably waiver win/loss and hindsight optimal — depends on a separate cache spec that does not exist yet.

## Requirements

- **Location:** New page at `/analytics`, linked from the home page Quick Actions grid
- **Auth:** Same pattern as other pages — redirect to `/login` if not signed in
- **First widget:** Top 20 slots ranked by total fantasy points
  - Unit of ranking is `(team_id, slot)` — one of the 130 league slots (13 teams × 10)
  - Each row lists every golfer who has ever occupied that slot, with the current golfer indicated
  - Ties broken by `times_started ASC` (more efficient slot ranks higher)
- **Caching:** `noStore()` + `dynamic = 'force-dynamic'` + `revalidate = 0` per CLAUDE.md (this reads frequently-updated data)

## Architecture

### New Files

| File | Purpose |
|------|---------|
| `src/app/analytics/page.tsx` | Page shell, auth gate, fetches data, renders TopSlotsTable |
| `src/app/api/analytics/top-slots/route.ts` | GET endpoint returning the top 20 slots |
| `src/components/TopSlotsTable.tsx` | Pure rendering component |
| `src/components/__tests__/TopSlotsTable.test.tsx` | Component test with mock data |

### Modified Files

| File | Change |
|------|---------|
| `src/app/page.tsx` | Add an "Analytics" tile to the Quick Actions grid |

### Data Flow

```
Page loads → auth check → fetch /api/analytics/top-slots → render TopSlotsTable
```

### API Response Shape

```typescript
interface TopSlotsResponse {
  slots: Array<{
    team_id: number;
    team_name: string;
    slot: number;             // 1..10
    total_points: number;     // sum of fedex_points for this (team, slot)
    times_started: number;    // count of tournaments where this slot was started AND scored
    golfers: Array<{
      name: string;
      current: boolean;       // true for the golfer currently in the slot
    }>;
  }>;
  max_points: number;         // top entry's total_points, used for bar scaling
}
```

### API Query Logic

Two queries:

1. **Top 20 slots** — aggregate `lineups` by `(team_id, slot)`:
   ```sql
   SELECT
     l.team_id,
     t.team_name,
     l.slot,
     COALESCE(SUM(l.fedex_points), 0)::int AS total_points,
     COUNT(l.fedex_points)::int             AS times_started
   FROM lineups l
   JOIN teams t USING (team_id)
   WHERE l.fedex_points IS NOT NULL
   GROUP BY l.team_id, t.team_name, l.slot
   ORDER BY total_points DESC, times_started ASC
   LIMIT 20;
   ```

2. **Golfers per slot** — for the 20 `(team_id, slot)` pairs from query 1, gather all golfers who ever sat in the slot:
   - The **current** golfer from `rosters` joined to `golfers` (flagged `current: true`).
   - Every **dropped** golfer from `waiver_log` for that `(team_id, slot)`, ordered by `timestamp ASC`. These are previously-occupying golfers (the original drafted golfer is the first dropped if any waivers occurred for that slot).

   Returned order: chronological — earliest dropped first, then current at the end. This means a slot that never had a waiver shows just the current golfer.

   Implementation note: `waiver_log.dropped_golfer` is `TEXT` (the golfer's name as a string at the time of the swap), not a foreign key, so we don't need to join `golfers` for dropped entries.

The two queries can run sequentially in the same handler — the second one filters by the 20 `(team_id, slot)` pairs returned from the first.

## UI Design

### Page Layout

Follows the same structure as other pages (`/history`, `/waivers`, etc.):

- Standard `<header>` with title "Analytics" and the user's team chip + Sign Out
- Single card containing the Top Slots table
- Header above the table: title "Top 20 Slots" with a small subtitle "Slots with the most total fantasy points"

### Table Component (`TopSlotsTable`)

5 columns:

| # | Team / Slot | Golfer(s) | Starts | Points |
|---|---|---|---|---|
| 1 | Team Name · Slot 7 | Scottie Scheffler *(current)*, Tony Finau | 6 | ▓▓▓▓▓▓▓▓▓▓ 4,250 |
| 2 | Other Team · Slot 3 | Rory McIlroy *(current)* | 5 | ▓▓▓▓▓▓▓▓ 3,420 |

- **# column:** rank, with `rank-1`/`rank-2`/`rank-3` row styling (already defined in `globals.css`) for the top three
- **Team / Slot column:** team name on top, "Slot N" as a smaller secondary line; team name links to `/team/[teamId]`
- **Golfer(s) column:** comma-separated list. The current golfer is bolded and tagged with a small "current" pill. If the list is long (rare — would require many waivers), wrap naturally
- **Starts column:** numeric, right-aligned. Hidden on `< sm` to keep mobile readable
- **Points column:** inline horizontal bar (width = `total_points / max_points`) in `masters-green`, with the formatted number to the right of the bar

### Empty State

If the API returns `slots: []` (no completed tournaments yet):

> "No tournament results yet — analytics will appear after the first tournament closes."

Centered in the card, italic, `text-charcoal-light`.

### Loading State

Skeleton matching the table shape, similar pattern to existing pages.

### Navigation Entry

Add an "Analytics" tile in the Quick Actions grid on `src/app/page.tsx`, sitting alongside Waivers / Past Results / Waiver History / Adjustments. Use a chart-style icon (existing inline-SVG pattern, no new icon dependency).

## Testing

- **Component test** — `TopSlotsTable.test.tsx`:
  - Renders 20 rows when given 20 slots
  - Bolds and pills the current golfer
  - Bar widths are proportional to `total_points / max_points`
  - Empty state renders when `slots: []`
- **No unit test for the SQL** — it's straightforward aggregation; verify manually after seeding
- **Manual smoke test** — visit `/analytics` against real DB after deploy, confirm rankings match the standings/lineups data

## Out of Scope

- Other analytics widgets (tournament winners, team consistency, waiver win/loss, hindsight optimal, head-to-head matrix, slot usage heatmap) — deferred to follow-up specs
- Per-golfer-per-tournament results cache — required by some deferred analytics; will be its own spec
- Filtering / date range selectors on the top-slots table — v1 is season-to-date only
- CSV export or sharable links

## Open Questions

None.
