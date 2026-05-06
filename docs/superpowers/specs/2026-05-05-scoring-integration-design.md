# Scoring Integration — Design

**Date:** 2026-05-05
**Status:** Approved, pending implementation plan

## Goal

Replace the manual CSV-scraper round-trip used to populate `lineups.fedex_points` with a one-click action that pulls per-event FedEx points from ESPN via the `egolfapi` package. Admin reviews the fetched values in a confirmation step before committing.

## Context

### Current scoring flow (to be replaced)

1. Admin opens `/admin/results/[id]`.
2. Downloads a CSV of lineups (each row includes the rostered golfer's `espn_id`).
3. Runs an external Python scraper that fills in `fedex_points`.
4. Uploads the CSV back; the page submits to `/api/admin/results`, which updates `lineups.fedex_points` and recalculates `standings.total_points`.

### What `egolfapi` provides

The package (private GitHub repo, sibling to GLM) exposes a typed client over ESPN's PGA endpoints. Relevant for scoring:

- `ESPNClient.getSchedule(season)` — list of season events (`{ eventId, name, startDate, endDate }`). Used for the event-id picker.
- `ESPNClient.getPlayerHistory(espnId, season)` — per-player season history with `PlayerEventResult[]` containing `eventId`, `positionDisplay`, `fedexPoints`. **The only ESPN endpoint that exposes per-event FedEx points.**

`getLeaderboard()`, `getHistoricalLeaderboard()`, and `getFedexStandings()` do not expose per-event FedEx points and are not used in this design.

### Key constraint discovered during brainstorming

Per-event FedEx points only come from `/athletes/{id}/stats`. Scoring one tournament therefore requires walking each rostered golfer's history (~50 unique `espn_id`s per event). At egolfapi's 1.5s default rate-limit that's ~75 seconds — exceeds Vercel Hobby's 60s function ceiling. Dropping the rate-limit to 500ms (still polite at 2 req/sec) gives ~25s, comfortably within Hobby limits.

## Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | Post-tournament one-click scoring (not live, not cron) | Matches existing workflow; live FedEx points aren't awarded mid-tournament anyway |
| 2 | Add `tournaments.espn_event_id` as a separate UNIQUE column (not a PK rename) | Avoids dropping/re-adding the FK from `lineups.tournament_id`; same end-state semantically |
| 3 | Synchronous API route at 500ms rate-limit, `maxDuration: 60`, Vercel Hobby | Simplest deployable path within free-tier constraints |
| 4 | New `player_history_cache` table (24h TTL) keyed on (espn_id, season) | Makes back-to-back tournament scoring near-instant; opportunistic, no janitor needed |
| 5 | Vendor egolfapi TS source under `src/lib/egolfapi/` | Package is private; vendoring avoids PAT setup and rebuild ceremony |
| 6 | Preview/confirmation step before save | Admin can verify values, spot DNP/MC players, edit anything wrong |
| 7 | Bundle two fixes to the existing adjust dialog | (a) filter out already-picked slots (latent bug); (b) show fetched points per candidate |

## Architecture

### Data flow

```
Admin clicks "Pull Results from ESPN"
        │
        ▼
POST /api/admin/fetch-scores  { tournament_id }
        │
        ├─ Look up tournament's espn_event_id and season
        ├─ Get list of unique (espn_id, slot, team_id) from lineups
        ├─ For each unique espn_id:
        │     • Check player_history_cache(espn_id, season) — fresh if < 24h
        │     • If miss/stale: ESPNClient.getPlayerHistory(espn_id, season)
        │     • Upsert into cache
        ├─ For each lineup entry:
        │     • Find matching event in cached history → fedexPoints
        │     • Classify status: played | missed_cut | wd | did_not_play | manual_entry | fetch_failed
        └─ Return { proposed: [...], warnings: [...] } — no DB writes to lineups
        │
        ▼
Page populates inputs with proposed values, highlights warnings
Admin reviews, edits anything questionable, may use Adjust dialog for DNP rows
Admin clicks "Save Results" → existing /api/admin/results path (unchanged)
```

The new fetch route is read-only against `lineups`. The existing `/api/admin/results` remains the only path that persists `fedex_points`.

### Components

- **`src/lib/egolfapi/`** — vendored TypeScript source: `client.ts`, `endpoints.ts`, `parsers.ts`, `normalize.ts`, `types.ts`, `index.ts`.
- **`src/lib/scoring/`** — new module:
  - `findEventResult(history, espnEventId)` — pure function, returns `PlayerEventResult | null`.
  - `classifyLineupResult(history, espnEventId, hasEspnId)` — pure function, returns the status badge enum.
  - `mergeProposedResults(lineups, historyByEspnId, espnEventId)` — pure function, returns the proposed-results array consumed by the UI.
  - `fetchAndCacheHistories(espnIds, season)` — orchestrator; reads cache, fetches misses via egolfapi, upserts. Returns `Map<espnId, PlayerSeasonHistory>`.
- **`src/app/api/admin/fetch-scores/route.ts`** — new route, `maxDuration: 60`. Composes the above.
- **`src/app/api/admin/espn-schedule/route.ts`** — new route, calls `getSchedule(season)`, used by the picker.
- **`src/app/api/admin/tournament-espn-mapping/route.ts`** — new route, sets `espn_event_id` and `season` on a tournament.
- **`<EspnEventPicker>`** — new React component, used in tournament create/edit form and in the backfill page.
- **`src/app/admin/backfill-events/page.tsx`** — new page for the one-time mapping of existing tournaments.

### Schema changes

**Migration 0004 — tournament event mapping**
```sql
ALTER TABLE tournaments ADD COLUMN espn_event_id TEXT UNIQUE;
ALTER TABLE tournaments ADD COLUMN season INTEGER;
CREATE INDEX idx_tournaments_espn_event_id ON tournaments(espn_event_id);
```

**Migration 0005 — player history cache**
```sql
CREATE TABLE player_history_cache (
  espn_id    TEXT NOT NULL,
  season     INTEGER NOT NULL,
  payload    JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (espn_id, season)
);
CREATE INDEX idx_player_history_cache_fetched ON player_history_cache(fetched_at);
```

**Migration 0006 — finalize NOT NULL after backfill**
```sql
ALTER TABLE tournaments ALTER COLUMN season SET NOT NULL;
ALTER TABLE tournaments ALTER COLUMN espn_event_id SET NOT NULL;
```

## Preview UX

Each lineup row on `/admin/results/[id]` gets a status badge after fetch-scores returns:

| Badge | Meaning | Visual |
|---|---|---|
| Played, scored | Position + points populated | Green dot, "T15 · 67 pts" |
| Played, 0 pts | Made cut / finished but earned no FedEx | Gray dot, "T62 · 0 pts" |
| Did not play | Golfer not in this event's history | Amber dot, "DNP — adjust lineup?" |
| Cut / WD | MC or WD position | Amber dot, "MC · 0 pts" or "WD · 0 pts" |
| No espn_id on roster | Can't look up — manual entry required | Red dot, "Manual entry needed" |
| Fetch failed | Per-player network/parse error | Red dot, "Fetch failed — retry or enter manually" |

Summary banner: *"Fetched 47 of 52 results — 3 did not play, 1 missed cut, 1 missing ESPN id."*

DNP rows visually emphasize the existing per-row **Adjust** button.

### Adjust dialog improvements

1. **Filter fix.** Replace `slot.slot !== adjustment.oldSlot` with a filter that also excludes other slots already in this tournament's lineup (latent bug — currently allows duplicate-slot picks).
2. **Show fetched results on each candidate.** The proposed-results map is passed into the modal. Each candidate row gets the same status badge:
   ```
   Slot 7: Patrick Cantlay        T22 · 35 pts    [3/8 uses]
   Slot 9: Matt Fitzpatrick        DNP            [2/8 uses]
   ```
   Selecting a played candidate pre-populates the points input (still editable). DNP candidates remain pickable (admin discretion) but flagged.

## Picker & Backfill

### Picker (`<EspnEventPicker>`)

- Calls `GET /api/admin/espn-schedule?season=YYYY`.
- Server route invokes `ESPNClient.getSchedule(season)`, returns `events: { eventId, name, startDate, endDate }[]`.
- Picker pre-filters/sorts by name similarity to the GLM tournament name; full list shown as fallback.
- On selection, fills hidden `espn_event_id` field in the parent form.

### Backfill page (`/admin/backfill-events`)

One row per tournament with `espn_event_id IS NULL`. Each row independent — admin saves one at a time. POST to `/api/admin/tournament-espn-mapping` updates only `espn_event_id` and `season`; `tournament_id` PK is unchanged.

### Schedule cache

`getSchedule(season)` is one cheap ESPN call; cache in memory in the API route per request. No DB-backed cache needed.

## Error handling

| Scenario | Behavior |
|---|---|
| Tournament has no `espn_event_id` | 400 with "Map this tournament first" |
| Lineup row has no `espn_id` | Include with `status: "manual_entry"`; don't block |
| `getPlayerHistory` throws for one player | Mark that row `status: "fetch_failed"`; continue |
| `getPlayerHistory` throws for all players | 502 with summary (likely ESPN outage) |
| No matching event in history | `status: "did_not_play"` |
| Event matched, `fedexPoints = 0`, `positionDisplay = "MC"` | `status: "missed_cut"` |
| Cache hit but stale | Refetch; on refetch failure fall back to stale row with `cache_stale` warning |

The route returns 200 with structured per-row status even when some entries fail. Nothing destructive happens server-side until admin clicks "Save Results".

## Edge cases

- **Re-running scoring after a save.** Fetch ignores existing `fedex_points`. Preview shows fetched value alongside current value when they differ.
- **Tournament status `closed`.** Permitted — existing /admin/results already allows post-close edits.
- **Waiver-added golfer.** Their `espn_id` is on the roster; first scoring run after the waiver fetches and caches.
- **Season boundary.** Use `tournaments.season` (set at creation/backfill); never derive from "current year" at scoring time.
- **Cache version invalidation.** If `PlayerSeasonHistory` shape changes, bump a `CACHE_VERSION` constant and treat older rows as misses.

## Testing

- **Unit tests** under `src/lib/scoring/`:
  - `findEventResult(history, espnEventId)`
  - `classifyLineupResult(history, espnEventId, hasEspnId)`
  - `mergeProposedResults(lineups, historyByEspnId, espnEventId)`
- **Integration test** for `/api/admin/fetch-scores` using egolfapi fixtures (a player-history fixture is added to `egolfapi/fixtures/_golden/`).
- **No E2E test** — manual verification on a Vercel preview branch is sufficient.

## Vendor sync workflow

`scripts/sync-egolfapi.ts`:
- `--from <path>` (default: `../../egolfapi/egolfapi`)
- Copies `typescript/src/{client,endpoints,parsers,normalize,types,index}.ts` to `src/lib/egolfapi/`.
- Rewrites `.js` import suffixes to bare paths (Next.js doesn't need them).
- Writes source git SHA to `src/lib/egolfapi/_VERSION.txt` for traceability.

Run manually after upstream fixes. No automation.

## Rollout order

1. Run migration 0004 (nullable columns).
2. Run migration 0005 (cache table).
3. Vendor egolfapi via `sync-egolfapi.ts`.
4. Deploy backfill page, picker, fetch-scores route, and updated /admin/results page. The "Pull Results from ESPN" button is disabled when `espn_event_id IS NULL`.
5. Admin walks the backfill page, fills in all existing tournaments.
6. Run migration 0006 (set columns NOT NULL).

## Out of scope

- Live (in-progress) leaderboard display.
- Cron-based automated scoring.
- Public-facing API for non-admin users.
- Backfilling historical FedEx points across prior seasons (separate exercise if ever needed).
- Publishing egolfapi to npm.
