# Admin Adjustments Page Design

## Overview

Add a page to display admin lineup adjustments, providing transparency into commissioner-made changes. The page mirrors the existing waiver history page pattern.

## Requirements

- **Visibility:** Logged-in team owners only
- **Data displayed:** Tournament, team, slot change, point change, note (no admin email)
- **Filtering:** None — simple chronological list, newest first
- **Navigation:** Main nav link after "Waivers"

## Architecture

### New Files

| File | Purpose |
|------|---------|
| `src/app/adjustments/page.tsx` | Client component with auth check |
| `src/app/api/adjustments/route.ts` | GET endpoint with cache-busting |

### Data Flow

```
Page loads → useAuth() checks login → fetch /api/adjustments → render list
```

### API Query

```sql
SELECT a.*, t.name as tournament_name, tm.team_name
FROM admin_adjustments a
LEFT JOIN tournaments t ON a.tournament_id = t.tournament_id
LEFT JOIN teams tm ON a.team_id = tm.team_id
ORDER BY a.timestamp DESC
```

### Response Shape

```typescript
interface AdjustmentEntry {
  id: number;
  timestamp: string;
  tournament_name: string;
  team_name: string;
  old_slot: number;
  new_slot: number;
  old_points: number | null;
  new_points: number | null;
  note: string | null;
}
```

## UI Layout

### Page Structure

- Header with back arrow linking to home
- Title: "Admin Adjustments" with gear icon
- List of adjustments grouped by date

### Each Entry Displays

- Time (e.g., "2:34 PM")
- Team name badge (green background)
- Tournament name
- Slot change: "Slot 3 → Slot 7"
- Points change: "45 pts → 52 pts" (if points changed)
- Note in italics (if present)

### States

- **Loading:** Centered spinner with golf emoji
- **Empty:** "No admin adjustments have been made yet."
- **Unauthorized:** Redirect to `/login`

## Navigation

Add "Adjustments" link with gear icon to main navigation in `src/app/layout.tsx`.

**Nav order:** Standings → Lineup → Roster → Waivers → **Adjustments** → (Admin items)

## Implementation Notes

- Follow cache-busting pattern: `unstable_noStore`, `dynamic = 'force-dynamic'`, `revalidate = 0`
- Mirror waiver history page structure and styling
- Use existing CSS classes: `.card`, team badges, date grouping
