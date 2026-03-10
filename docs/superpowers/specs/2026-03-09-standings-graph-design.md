# Standings Graph Design

## Overview

Add an interactive line graph to the home page showing how team rankings change over the season. Each team has a colored line, with ranking position (1st-13th) on the Y-axis and tournaments on the X-axis.

## Requirements

- **Location:** Home page, below the standings table
- **Y-axis:** Ranking position (1st at top, 13th at bottom)
- **X-axis:** Each completed tournament as a data point
- **Interaction:** Click/tap team in legend to highlight their line
- **Library:** Recharts (React charting library)

## Architecture

### New Files

| File | Purpose |
|------|---------|
| `src/app/api/standings/history/route.ts` | API endpoint returning historical rankings |
| `src/components/StandingsGraph.tsx` | Recharts line graph component |

### Data Flow

```
Page loads → fetch /api/standings/history → render StandingsGraph component
```

### API Response Shape

```typescript
interface StandingsHistory {
  tournaments: string[];  // ["The Sentry", "Sony Open", ...]
  teams: {
    team_id: number;
    team_name: string;
    color: string;        // Hex color from palette
    rankings: number[];   // [3, 2, 1, 1, 2, ...] position per tournament
  }[];
}
```

### API Query Logic

1. Get all completed tournaments ordered by deadline ASC
2. For each tournament, calculate cumulative points per team from lineups
3. Derive ranking (1-13) from cumulative totals at each point
4. Assign consistent colors to teams based on team_id

## UI Design

### Chart Component

- **Library:** Recharts `LineChart` with `Line`, `XAxis`, `YAxis`, `Tooltip`, `Legend`
- **Y-axis:** Inverted scale (1 at top, 13 at bottom), label "Rank"
- **X-axis:** Tournament names (abbreviated if needed)
- **Lines:** One per team, 13 distinct colors, strokeWidth 2

### Interaction

- **Legend:** Displayed below chart, shows all teams with color swatches
- **Click/tap legend item:** Highlights that team's line, dims others to 20% opacity
- **Click/tap again:** Returns to normal view
- **Tooltip (desktop hover):** Shows team name, tournament, rank at that point

### Color Palette

13 distinct colors assigned by team_id for consistency:
```typescript
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
```

### Card Container

- Wrapper: `.card` class matching existing home page sections
- Header: "Season Progress" with chart icon
- Matches spacing/shadows of standings table

### Responsive Behavior

- **Desktop:** Full width, 400px height
- **Mobile:** Full width, 300px height
- **Legend:** Wraps to 2-3 rows on narrow screens

### States

- **Loading:** Skeleton placeholder matching chart dimensions
- **Empty:** "Graph available after first tournament completes"
- **Error:** Standard error message with retry

## Home Page Integration

Add new section in `src/app/page.tsx` after the standings table:

```tsx
{/* Season Progress Graph */}
<div className="card mb-8">
  <h2 className="font-display text-xl font-bold text-charcoal flex items-center gap-2 mb-6">
    <span>Season Progress</span>
  </h2>
  <StandingsGraph />
</div>
```

## Dependencies

Add to `package.json`:
```json
"recharts": "^2.12.0"
```

## Implementation Notes

- Use cache-busting on API route (noStore, force-dynamic, revalidate=0)
- Calculate rankings server-side to minimize client computation
- Color assignment must be deterministic (same team always gets same color)
- Handle edge case: ties in points → same rank for tied teams
