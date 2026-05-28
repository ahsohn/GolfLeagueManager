# Lineup "Who's Playing This Week" Indicator — Design

**Date:** 2026-05-27
**Status:** Approved (ready for implementation plan)

## Problem

When owners set their lineup for a tournament, they have no in-app signal for
which of their golfers are actually in the field that week. They have to check
elsewhere and may unknowingly start a golfer who isn't playing.

## Goal

On the lineup page, show next to each golfer whether that golfer is in the
tournament's field, **when ESPN has published that information**. This is purely
informational — it must **never** block or alter golfer selection.

## Non-Goals

- Does not apply to the waivers or roster pages — lineup page (`/lineup`) only.
- Does not surface mid-tournament states (cut / WD / live position) for
  lineup-setting; by the time those exist the lineup is locked.
- Does not change lineup validation, slot-usage rules, or submission behavior.

## Data Source

ESPN's leaderboard endpoint (`/leaderboard?event=<espn_event_id>`) returns the
event's field. Every entry carries `player.espnId`; the set of those IDs **is**
the field. We match each roster golfer's `golfers.espn_id` against that set.

Tournaments already carry `espn_event_id` + `season` (migrations 0004/0006) and
golfers already carry `espn_id` (migration 0003), so no changes to those tables.

A new focused client method `getEventField(eventId, season)` makes **one** direct
leaderboard call and returns the parsed `Leaderboard | null`. It deliberately
does **not** reuse `ESPNClient.getHistoricalLeaderboard`, whose
player-aggregation fallback fires dozens of ESPN requests — unacceptable latency
and rate-limit cost for an interactive page.

## "Field Not Published Yet" Rule (primary correctness risk)

ESPN does not populate the field until tournament week. Before that, the
endpoint returns zero competitors, or returns the *current* week's event. If
rendered naively, every golfer would show "Not in field" — misleading.

**Rule:** the field is considered *published* only when the returned board's
`tournament.id` equals our `espn_event_id` **and** `entries.length > 0`. The
`id` match guards against ESPN returning a different (current-week) event.

When the field is **not** published: show **no pills at all**, plus one subtle
line near the top of the roster — *"Field not announced yet."*

## Per-Golfer Status

Three states, rendered as the minimal pill style (chosen during brainstorming):

| Status         | Condition                                        | UI                       |
|----------------|--------------------------------------------------|--------------------------|
| `playing`      | golfer's `espn_id` is in the published field     | green **Playing** pill   |
| `not_in_field` | field published, golfer's `espn_id` absent       | gray **Not in field** pill |
| `unknown`      | golfer has no `espn_id`, OR field not published  | no pill                  |

A pure function does the mapping (no I/O, fully unit-testable):

```
computeFieldStatuses(rosterEspnIds, fieldEspnIds, fieldPublished)
  -> { slot, status }[]
```

## Endpoint

New route **`GET /api/lineup/field?teamId=<id>&tournamentId=<id>`**, following the
existing `team-roster-status` conventions (`noStore()`,
`export const dynamic = 'force-dynamic'`, `export const revalidate = 0`,
`maxDuration`). Matching happens server-side so the page stays simple.

Response:

```json
{ "field_available": true, "statuses": [ { "slot": 1, "status": "playing" } ] }
```

`field_available: false` means the field is not published (or could not be
fetched) — the page renders no pills and shows the "Field not announced yet" note.

## Caching

New table, same pattern as `player_history_cache`:

```sql
-- drizzle/migrations/0007_event_field_cache.sql
CREATE TABLE IF NOT EXISTS event_field_cache (
  espn_event_id TEXT PRIMARY KEY,
  fetched_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  payload       JSONB NOT NULL
);
```

`payload` stores the field espn_id list plus a `published` flag. The cache is
keyed per **event**, so it is shared across all 13 teams.

- Serve cached value if younger than the TTL (~3 hours; field is stable
  within a day, pre-deadline withdrawals are rare and non-critical).
- Otherwise refetch via `getEventField` and upsert.
- On ESPN failure: fall back to stale cache if present; else return
  `field_available: false`.

Run the migration once against Neon, per the project's migration workflow
(paste into Neon console or psql).

## Lineup Page Behavior

After the existing roster load (`/api/lineup`), the page fires a second request
to `/api/lineup/field`. While in flight, a subtle *"checking field…"* hint
shows. When it resolves, pills render per the status table.

Selection logic is **unchanged** — `canSelect`, `togglePlayer`, and the 4-pick /
8-use rules are untouched. Pills are informational. If the request fails, pills
stay hidden and the page is fully usable.

## Error Handling

- ESPN / network failure, or route 5xx → page silently shows no pills.
- Golfer with `null` espn_id → `unknown` → no pill.
- Tournament missing `espn_event_id` (defensive; NOT NULL since 0006) →
  `field_available: false`.

## Testing

- Unit-test `computeFieldStatuses`: playing / not_in_field / unknown (null id) /
  field-unavailable (all unknown) cases.
- Unit-test the "is field published" guard (id match + non-empty entries)
  against an ESPN fixture.
- Follow the existing Jest + fixture style in `src/lib/__tests__/`.

## Files Touched

- `src/lib/egolfapi/client.ts` — new `getEventField(eventId, season)`.
- `src/lib/field-status.ts` — new pure module: `computeFieldStatuses`,
  field-published guard.
- `drizzle/migrations/0007_event_field_cache.sql` — new cache table.
- `src/app/api/lineup/field/route.ts` — new endpoint (cache + match).
- `src/app/lineup/page.tsx` — fetch field statuses, render pills + note.
- `src/lib/__tests__/...` — unit tests for the pure functions.
