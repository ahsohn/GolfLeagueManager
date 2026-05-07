# Scoring Integration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the manual CSV-scraper round-trip used to populate `lineups.fedex_points` with a one-click "Pull Results from ESPN" action, plus a confirmation step where the admin reviews fetched values (and per-row status badges for DNP/MC/missing-id) before saving.

**Architecture:** A new `/api/admin/fetch-scores` route reads each rostered golfer's per-event FedEx points from ESPN via a vendored copy of the `egolfapi` TypeScript client. Per-player season histories are cached in a new `player_history_cache` table (24h TTL) keyed on `(espn_id, season)`, so back-to-back tournament scoring within a season only fetches new waiver-added players. Tournaments gain an `espn_event_id` column populated via a reusable picker component, plus a one-time backfill page for the existing rows. The fetch route returns a structured proposal (no DB writes); the existing `/admin/results/[id]` page renders that proposal into its already-editable inputs, and the existing `/api/admin/results` route remains the only path that persists `fedex_points`.

**Tech Stack:** Next.js 14 App Router, TypeScript, Neon PostgreSQL via `@neondatabase/serverless`, Jest with `next/jest` (jsdom), Vercel Hobby (`maxDuration: 60`), Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-05-05-scoring-integration-design.md`

---

## File Structure

**New files:**
- `drizzle/migrations/0004_tournament_espn_mapping.sql` — adds `tournaments.espn_event_id` (nullable UNIQUE) and `tournaments.season` (nullable)
- `drizzle/migrations/0005_player_history_cache.sql` — new cache table
- `drizzle/migrations/0006_finalize_tournament_columns.sql` — sets the two new columns NOT NULL after backfill
- `src/lib/egolfapi/{client,endpoints,parsers,normalize,types,index}.ts` — vendored from the upstream `egolfapi` repo (see Chunk 1)
- `src/lib/egolfapi/_VERSION.txt` — upstream git SHA for traceability
- `scripts/sync-egolfapi.ts` — copies upstream TypeScript source into the vendored directory and rewrites `.js` import suffixes
- `src/lib/scoring/types.ts` — `LineupResultStatus` enum, `ProposedResult`, `FetchScoresResponse`
- `src/lib/scoring/find-event-result.ts` — pure function: locate a `PlayerEventResult` in a `PlayerSeasonHistory` by event id
- `src/lib/scoring/classify-lineup-result.ts` — pure function: produce a `LineupResultStatus` from inputs
- `src/lib/scoring/merge-proposed-results.ts` — pure function: combine lineup rows with fetched histories into a proposal
- `src/lib/scoring/fetch-and-cache-histories.ts` — orchestrator: read cache, fetch misses via egolfapi, upsert
- `src/lib/scoring/index.ts` — barrel export
- `src/lib/__tests__/scoring/find-event-result.test.ts`
- `src/lib/__tests__/scoring/classify-lineup-result.test.ts`
- `src/lib/__tests__/scoring/merge-proposed-results.test.ts`
- `src/lib/__tests__/scoring/fetch-and-cache-histories.test.ts`
- `src/lib/__tests__/scoring/fixtures/player-history-played.json`
- `src/lib/__tests__/scoring/fixtures/player-history-missed-cut.json`
- `src/lib/__tests__/scoring/fixtures/player-history-empty.json`
- `src/app/api/admin/espn-schedule/route.ts`
- `src/app/api/admin/tournament-espn-mapping/route.ts`
- `src/app/api/admin/fetch-scores/route.ts`
- `src/components/EspnEventPicker.tsx`
- `src/app/admin/backfill-events/page.tsx`

**Modified files:**
- `src/types/index.ts` — extend `Tournament` interface with `espn_event_id` and `season`
- `src/app/api/tournaments/route.ts` — return `espn_event_id` and `season` on the list endpoint
- `src/app/api/tournaments/[tournamentId]/route.ts` — same on the detail endpoint
- `src/app/api/admin/tournament/route.ts` — accept `espn_event_id` and `season` on create + update
- `src/app/admin/page.tsx` — wire `<EspnEventPicker>` into the create-tournament form and edit modal
- `src/app/admin/results/[id]/page.tsx` — Pull Results button, status badges per row, summary banner, fix adjust-dialog filter, show fetched results inside adjust modal

---

## Chunk 1: Foundation — migrations and vendored egolfapi

This chunk lands the schema additions, the vendored egolfapi source, and a sync script. No behavior change yet — by the end of this chunk the codebase compiles, tests pass, and the new columns/cache table exist with all rows nullable.

### Task 1.1: Create migration 0004 (tournament event mapping)

**Files:**
- Create: `drizzle/migrations/0004_tournament_espn_mapping.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Add ESPN event id and season to tournaments
-- Both columns are nullable until backfill is complete (see migration 0006).

ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS espn_event_id TEXT UNIQUE;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS season INTEGER;

CREATE INDEX IF NOT EXISTS idx_tournaments_espn_event_id ON tournaments(espn_event_id);
```

- [ ] **Step 2: Apply migration to the development Neon branch**

Paste the SQL into the Neon console (or run via `psql $DATABASE_URL -f drizzle/migrations/0004_tournament_espn_mapping.sql`). Verify with:

```sql
\d tournaments
```

Expected: `espn_event_id text` and `season integer` appear, both nullable.

- [ ] **Step 3: Commit**

```bash
git add drizzle/migrations/0004_tournament_espn_mapping.sql
git commit -m "feat(db): add espn_event_id and season columns to tournaments"
```

### Task 1.2: Create migration 0005 (player_history_cache)

**Files:**
- Create: `drizzle/migrations/0005_player_history_cache.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Per-(espn_id, season) cache of normalized PlayerSeasonHistory.
-- TTL is enforced at read time (24h); no janitor needed.

CREATE TABLE IF NOT EXISTS player_history_cache (
  espn_id    TEXT NOT NULL,
  season     INTEGER NOT NULL,
  payload    JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (espn_id, season)
);

CREATE INDEX IF NOT EXISTS idx_player_history_cache_fetched
  ON player_history_cache(fetched_at);
```

- [ ] **Step 2: Apply migration to the development Neon branch**

Paste into Neon console. Verify with:

```sql
\d player_history_cache
```

- [ ] **Step 3: Commit**

```bash
git add drizzle/migrations/0005_player_history_cache.sql
git commit -m "feat(db): add player_history_cache table"
```

### Task 1.3: Add the vendor sync script

The egolfapi repo lives at `../egolfapi/egolfapi` (sibling directory). The script copies six TypeScript source files into `src/lib/egolfapi/`, rewrites `.js` import suffixes (Next.js doesn't need them), and writes the upstream git SHA to `_VERSION.txt`.

**Files:**
- Create: `scripts/sync-egolfapi.ts`

- [ ] **Step 1: Write the script**

```typescript
#!/usr/bin/env -S npx tsx
// Usage: npx tsx scripts/sync-egolfapi.ts [--from <path-to-egolfapi-repo>]
//
// Copies typescript/src/{client,endpoints,parsers,normalize,types,index}.ts
// from the upstream egolfapi repo into src/lib/egolfapi/, rewrites
// `.js` import suffixes (Next.js resolves bare paths), and records the
// upstream git SHA in _VERSION.txt.

import { execSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const FILES = ['client', 'endpoints', 'parsers', 'normalize', 'types', 'index'] as const;
const DEFAULT_SOURCE = resolve(__dirname, '..', '..', 'egolfapi', 'egolfapi');

function parseArgs(argv: string[]): { from: string } {
  const fromIdx = argv.indexOf('--from');
  if (fromIdx >= 0 && argv[fromIdx + 1]) {
    return { from: resolve(argv[fromIdx + 1]) };
  }
  return { from: DEFAULT_SOURCE };
}

function rewriteJsImports(source: string): string {
  // `from "./client.js"` -> `from "./client"`
  return source.replace(/from\s+(['"])(\.{1,2}\/[^'"]+)\.js\1/g, 'from $1$2$1');
}

function main(): void {
  const { from } = parseArgs(process.argv.slice(2));
  const srcDir = join(from, 'typescript', 'src');
  const destDir = resolve(__dirname, '..', 'src', 'lib', 'egolfapi');

  mkdirSync(destDir, { recursive: true });

  for (const name of FILES) {
    const srcPath = join(srcDir, `${name}.ts`);
    const destPath = join(destDir, `${name}.ts`);
    const original = readFileSync(srcPath, 'utf8');
    const rewritten = rewriteJsImports(original);
    writeFileSync(destPath, rewritten, 'utf8');
    // eslint-disable-next-line no-console
    console.log(`copied ${name}.ts`);
  }

  let sha = 'unknown';
  try {
    sha = execSync('git rev-parse HEAD', { cwd: from }).toString().trim();
  } catch {
    // upstream may not be a git repo in some environments
  }
  writeFileSync(
    join(destDir, '_VERSION.txt'),
    `source: ${from}\nsha: ${sha}\nsynced: ${new Date().toISOString()}\n`,
  );
  // eslint-disable-next-line no-console
  console.log(`wrote _VERSION.txt (sha=${sha})`);
}

main();
```

- [ ] **Step 2: Run the script to vendor egolfapi**

```bash
npx tsx scripts/sync-egolfapi.ts
```

Expected output: six "copied X.ts" lines plus a "wrote _VERSION.txt" line. Files appear under `src/lib/egolfapi/`.

- [ ] **Step 3: Verify vendored egolfapi compiles**

```bash
npx tsc --noEmit
```

Expected: zero TypeScript errors. (If errors appear, the most likely culprit is an `.js` suffix the rewriter missed — fix the regex and re-run the script.)

- [ ] **Step 4: Add .gitattributes entry to mark vendored files (optional but useful)**

Append to `.gitattributes` (create the file if it doesn't exist):

```
src/lib/egolfapi/** linguist-vendored
```

- [ ] **Step 5: Commit**

```bash
git add scripts/sync-egolfapi.ts src/lib/egolfapi .gitattributes
git commit -m "feat(scoring): vendor egolfapi typescript client"
```

### Task 1.4: Extend Tournament TypeScript type

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Read the current Tournament interface**

```bash
grep -n "interface Tournament" src/types/index.ts
```

- [ ] **Step 2: Add the new optional fields**

Add `espn_event_id?: string | null` and `season?: number | null` to the `Tournament` interface. They are optional/nullable for now because of the gradual backfill — Chunk 8 makes them required after migration 0006.

- [ ] **Step 3: Verify compile**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(types): add espn_event_id and season to Tournament"
```

### Task 1.5: Update tournament endpoints to surface the new columns

**Files:**
- Modify: `src/app/api/tournaments/route.ts`
- Modify: `src/app/api/tournaments/[tournamentId]/route.ts`

- [ ] **Step 1: Update the list endpoint SELECT**

In `src/app/api/tournaments/route.ts`, add `espn_event_id, season` to the `SELECT` column list. No other changes needed.

- [ ] **Step 2: Update the detail endpoint SELECT**

In `src/app/api/tournaments/[tournamentId]/route.ts:17-21`, change the `SELECT tournament_id, name, deadline, status` to `SELECT tournament_id, name, deadline, status, espn_event_id, season`.

- [ ] **Step 3: Verify compile**

```bash
npx tsc --noEmit && npm test -- --passWithNoTests
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/tournaments
git commit -m "feat(api): expose espn_event_id and season on tournament endpoints"
```

### Task 1.6: Accept the new columns on create/update

**Files:**
- Modify: `src/app/api/admin/tournament/route.ts`

- [ ] **Step 1: Add the fields to the POST body destructure and INSERT/UPDATE**

For the `create` action, accept optional `espn_event_id` and `season` from the body and include them in the INSERT:

```typescript
const { action, tournament_id, name, deadline, status, espn_event_id, season } = await request.json();

// ... in the create branch:
await sql`
  INSERT INTO tournaments (tournament_id, name, deadline, status, espn_event_id, season)
  VALUES (${tournament_id}, ${name}, ${deadline}, ${status ?? 'open'}, ${espn_event_id ?? null}, ${season ?? null})
`;
```

For the `update` action, mirror the existing `name ?? current.name` pattern for both new fields:

```typescript
const current = rows[0];
await sql`
  UPDATE tournaments
  SET
    name           = ${name           ?? current.name},
    deadline       = ${deadline       ?? current.deadline},
    status         = ${status         ?? current.status},
    espn_event_id  = ${espn_event_id  ?? current.espn_event_id},
    season         = ${season         ?? current.season}
  WHERE tournament_id = ${tournament_id}
`;
```

The current SELECT at line 29 already needs to include the new columns:

```typescript
const rows = await sql`SELECT tournament_id, name, deadline, status, espn_event_id, season FROM tournaments WHERE tournament_id = ${tournament_id}`;
```

- [ ] **Step 2: Verify compile**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/tournament/route.ts
git commit -m "feat(api): accept espn_event_id and season on tournament create/update"
```

---

## Chunk 2: Scoring core — pure functions and types

This chunk delivers the testable core of the scoring logic as pure functions: classifying each lineup row, finding the matching event in a player's history, and merging fetched histories into a proposal array. No I/O. TDD discipline applies cleanly.

### Task 2.1: Define scoring types

**Files:**
- Create: `src/lib/scoring/types.ts`

- [ ] **Step 1: Write the types**

```typescript
import type { PlayerSeasonHistory } from '../egolfapi';

// Status of a single lineup row after the fetch-scores call.
// Drives the per-row badge in the preview UI and the summary banner.
export type LineupResultStatus =
  | 'played'           // fetched ESPN result; fedex_points populated (>= 0)
  | 'missed_cut'       // event found, position MC
  | 'withdrew'         // event found, position WD
  | 'did_not_play'     // history fetched, but no entry for this event
  | 'manual_entry'     // roster has no espn_id — must be entered by hand
  | 'fetch_failed';    // network/parse error fetching this player's history

// One row in the proposal returned by /api/admin/fetch-scores.
// Mirrors the shape consumed by /admin/results/[id] page state.
export interface ProposedResult {
  team_id: number;
  team_name: string;
  slot: number;
  golfer_name: string;
  espn_id: string | null;
  current_fedex_points: number | null; // existing value in lineups (may be null)
  fetched_fedex_points: number;        // 0 for any non-'played' status
  position_display: string | null;     // "T15", "MC", "WD", "" if no event match
  status: LineupResultStatus;
  message: string | null;              // optional human-readable note
}

export interface FetchScoresResponse {
  tournament_id: string;
  espn_event_id: string;
  season: number;
  proposed: ProposedResult[];
  // Summary counts for the banner UI; redundant with `proposed` but cheap.
  summary: {
    total: number;
    played: number;
    missed_cut: number;
    withdrew: number;
    did_not_play: number;
    manual_entry: number;
    fetch_failed: number;
  };
}

// Map of espn_id -> PlayerSeasonHistory (or null when fetch failed).
// Passed into mergeProposedResults from the orchestrator.
export type HistoryByEspnId = Map<string, PlayerSeasonHistory | null>;
```

- [ ] **Step 2: Verify compile**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/scoring/types.ts
git commit -m "feat(scoring): add scoring types"
```

### Task 2.2: TDD `findEventResult`

**Files:**
- Create: `src/lib/__tests__/scoring/find-event-result.test.ts`
- Create: `src/lib/scoring/find-event-result.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { findEventResult } from '@/lib/scoring/find-event-result';
import type { PlayerSeasonHistory } from '@/lib/egolfapi';

const player = {
  espnId: '9478',
  displayName: 'Scottie Scheffler',
  shortName: 'S. Scheffler',
  normalizedName: 'scottie scheffler',
};

const history: PlayerSeasonHistory = {
  player,
  season: 2026,
  results: [
    { player, eventId: '401001', eventName: 'Sony Open', positionDisplay: 'T12', fedexPoints: 88 },
    { player, eventId: '401002', eventName: 'Genesis', positionDisplay: '1', fedexPoints: 700 },
  ],
};

describe('findEventResult', () => {
  it('returns the result matching the event id', () => {
    const result = findEventResult(history, '401002');
    expect(result?.fedexPoints).toBe(700);
    expect(result?.positionDisplay).toBe('1');
  });

  it('returns null when the event id is not in the history', () => {
    expect(findEventResult(history, '999999')).toBeNull();
  });

  it('returns null when history is null', () => {
    expect(findEventResult(null, '401002')).toBeNull();
  });

  it('compares event ids as strings (number coercion is a footgun)', () => {
    // ESPN event ids look numeric but are returned as strings.
    // We must not coerce; "0401001" and "401001" must NOT match.
    const result = findEventResult(history, '0401001');
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- find-event-result
```

Expected: FAIL with "Cannot find module '@/lib/scoring/find-event-result'".

- [ ] **Step 3: Write minimal implementation**

```typescript
import type { PlayerEventResult, PlayerSeasonHistory } from '@/lib/egolfapi';

export function findEventResult(
  history: PlayerSeasonHistory | null,
  espnEventId: string,
): PlayerEventResult | null {
  if (!history) return null;
  for (const result of history.results) {
    if (result.eventId === espnEventId) return result;
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- find-event-result
```

Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scoring/find-event-result.ts src/lib/__tests__/scoring/find-event-result.test.ts
git commit -m "feat(scoring): findEventResult locates an event in player history"
```

### Task 2.3: TDD `classifyLineupResult`

**Files:**
- Create: `src/lib/__tests__/scoring/classify-lineup-result.test.ts`
- Create: `src/lib/scoring/classify-lineup-result.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { classifyLineupResult } from '@/lib/scoring/classify-lineup-result';
import type { PlayerSeasonHistory } from '@/lib/egolfapi';

const player = {
  espnId: '9478',
  displayName: 'Scottie Scheffler',
  shortName: 'S. Scheffler',
  normalizedName: 'scottie scheffler',
};

const baseHistory: PlayerSeasonHistory = { player, season: 2026, results: [] };

describe('classifyLineupResult', () => {
  it('returns manual_entry when espn_id is missing', () => {
    expect(classifyLineupResult(null, '401001', null)).toBe('manual_entry');
  });

  it('returns fetch_failed when history is null but espn_id was present', () => {
    expect(classifyLineupResult(null, '401001', '9478')).toBe('fetch_failed');
  });

  it('returns did_not_play when history has no entry for this event', () => {
    expect(classifyLineupResult(baseHistory, '401001', '9478')).toBe('did_not_play');
  });

  it('returns missed_cut for positionDisplay "MC"', () => {
    const history = { ...baseHistory, results: [
      { player, eventId: '401001', eventName: 'X', positionDisplay: 'MC', fedexPoints: 0 },
    ]};
    expect(classifyLineupResult(history, '401001', '9478')).toBe('missed_cut');
  });

  it('returns withdrew for positionDisplay "WD"', () => {
    const history = { ...baseHistory, results: [
      { player, eventId: '401001', eventName: 'X', positionDisplay: 'WD', fedexPoints: 0 },
    ]};
    expect(classifyLineupResult(history, '401001', '9478')).toBe('withdrew');
  });

  it('returns played for any numeric position (with or without "T")', () => {
    for (const pos of ['1', 'T2', '15', 'T62']) {
      const history = { ...baseHistory, results: [
        { player, eventId: '401001', eventName: 'X', positionDisplay: pos, fedexPoints: 100 },
      ]};
      expect(classifyLineupResult(history, '401001', '9478')).toBe('played');
    }
  });

  it('treats DQ as withdrew (closest semantic)', () => {
    const history = { ...baseHistory, results: [
      { player, eventId: '401001', eventName: 'X', positionDisplay: 'DQ', fedexPoints: 0 },
    ]};
    expect(classifyLineupResult(history, '401001', '9478')).toBe('withdrew');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- classify-lineup-result
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write minimal implementation**

```typescript
import type { PlayerSeasonHistory } from '@/lib/egolfapi';
import { findEventResult } from './find-event-result';
import type { LineupResultStatus } from './types';

export function classifyLineupResult(
  history: PlayerSeasonHistory | null,
  espnEventId: string,
  espnId: string | null,
): LineupResultStatus {
  if (!espnId) return 'manual_entry';
  if (!history) return 'fetch_failed';
  const result = findEventResult(history, espnEventId);
  if (!result) return 'did_not_play';
  const pos = result.positionDisplay;
  if (pos === 'MC') return 'missed_cut';
  if (pos === 'WD' || pos === 'DQ') return 'withdrew';
  return 'played';
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- classify-lineup-result
```

Expected: 7 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scoring/classify-lineup-result.ts src/lib/__tests__/scoring/classify-lineup-result.test.ts
git commit -m "feat(scoring): classifyLineupResult assigns a status to each lineup row"
```

### Task 2.4: TDD `mergeProposedResults`

This function takes the existing lineup rows (with current fedex_points and golfer info) and the per-player histories, and produces the proposal array consumed by the UI. Pure data transformation.

**Files:**
- Create: `src/lib/__tests__/scoring/merge-proposed-results.test.ts`
- Create: `src/lib/scoring/merge-proposed-results.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { mergeProposedResults } from '@/lib/scoring/merge-proposed-results';
import type { HistoryByEspnId } from '@/lib/scoring/types';
import type { PlayerSeasonHistory } from '@/lib/egolfapi';

const playerA = { espnId: '9478', displayName: 'Scottie Scheffler', shortName: 'S. Scheffler', normalizedName: 'scottie scheffler' };
const playerB = { espnId: '5467', displayName: 'Rory McIlroy', shortName: 'R. McIlroy', normalizedName: 'rory mcilroy' };

const historyA: PlayerSeasonHistory = {
  player: playerA, season: 2026,
  results: [{ player: playerA, eventId: '401002', eventName: 'Genesis', positionDisplay: 'T5', fedexPoints: 220 }],
};
const historyB: PlayerSeasonHistory = {
  player: playerB, season: 2026,
  results: [], // didn't play
};

const lineups = [
  { team_id: 1, team_name: 'Aces', slot: 1, golfer_name: 'Scottie Scheffler', espn_id: '9478', fedex_points: null },
  { team_id: 1, team_name: 'Aces', slot: 4, golfer_name: 'Rory McIlroy',     espn_id: '5467', fedex_points: 0 },
  { team_id: 2, team_name: 'Birdies', slot: 2, golfer_name: 'Unknown',       espn_id: null,    fedex_points: null },
];

describe('mergeProposedResults', () => {
  it('builds a ProposedResult for each lineup row', () => {
    const histories: HistoryByEspnId = new Map([
      ['9478', historyA],
      ['5467', historyB],
    ]);
    const result = mergeProposedResults(lineups, histories, '401002');

    expect(result.proposed).toHaveLength(3);
    expect(result.summary.total).toBe(3);
  });

  it('populates fetched_fedex_points and position_display for played rows', () => {
    const histories: HistoryByEspnId = new Map([['9478', historyA], ['5467', historyB]]);
    const result = mergeProposedResults(lineups, histories, '401002');

    const scheffler = result.proposed.find((r) => r.espn_id === '9478')!;
    expect(scheffler.status).toBe('played');
    expect(scheffler.fetched_fedex_points).toBe(220);
    expect(scheffler.position_display).toBe('T5');
  });

  it('zeroes fetched_fedex_points for did_not_play rows', () => {
    const histories: HistoryByEspnId = new Map([['9478', historyA], ['5467', historyB]]);
    const result = mergeProposedResults(lineups, histories, '401002');

    const rory = result.proposed.find((r) => r.espn_id === '5467')!;
    expect(rory.status).toBe('did_not_play');
    expect(rory.fetched_fedex_points).toBe(0);
    expect(rory.position_display).toBeNull();
  });

  it('classifies rows with no espn_id as manual_entry', () => {
    const histories: HistoryByEspnId = new Map();
    const result = mergeProposedResults(lineups, histories, '401002');

    const unknown = result.proposed.find((r) => r.team_id === 2)!;
    expect(unknown.status).toBe('manual_entry');
  });

  it('classifies rows whose espn_id has a null entry in the map as fetch_failed', () => {
    const histories: HistoryByEspnId = new Map([['9478', null]]);
    const result = mergeProposedResults(lineups.slice(0, 1), histories, '401002');

    expect(result.proposed[0].status).toBe('fetch_failed');
  });

  it('counts each status correctly in summary', () => {
    const histories: HistoryByEspnId = new Map([['9478', historyA], ['5467', historyB]]);
    const result = mergeProposedResults(lineups, histories, '401002');

    expect(result.summary.played).toBe(1);
    expect(result.summary.did_not_play).toBe(1);
    expect(result.summary.manual_entry).toBe(1);
    expect(result.summary.missed_cut).toBe(0);
    expect(result.summary.withdrew).toBe(0);
    expect(result.summary.fetch_failed).toBe(0);
  });

  it('preserves current_fedex_points from the input lineup', () => {
    const histories: HistoryByEspnId = new Map([['9478', historyA], ['5467', historyB]]);
    const result = mergeProposedResults(lineups, histories, '401002');

    expect(result.proposed.find((r) => r.espn_id === '9478')!.current_fedex_points).toBeNull();
    expect(result.proposed.find((r) => r.espn_id === '5467')!.current_fedex_points).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- merge-proposed-results
```

- [ ] **Step 3: Write minimal implementation**

```typescript
import { classifyLineupResult } from './classify-lineup-result';
import { findEventResult } from './find-event-result';
import type { HistoryByEspnId, LineupResultStatus, ProposedResult } from './types';

export interface LineupRow {
  team_id: number;
  team_name: string;
  slot: number;
  golfer_name: string;
  espn_id: string | null;
  fedex_points: number | null;
}

export interface MergeResult {
  proposed: ProposedResult[];
  summary: {
    total: number;
    played: number;
    missed_cut: number;
    withdrew: number;
    did_not_play: number;
    manual_entry: number;
    fetch_failed: number;
  };
}

const ZERO_SUMMARY = (): MergeResult['summary'] => ({
  total: 0,
  played: 0,
  missed_cut: 0,
  withdrew: 0,
  did_not_play: 0,
  manual_entry: 0,
  fetch_failed: 0,
});

export function mergeProposedResults(
  lineups: LineupRow[],
  historiesByEspnId: HistoryByEspnId,
  espnEventId: string,
): MergeResult {
  const proposed: ProposedResult[] = [];
  const summary = ZERO_SUMMARY();

  for (const row of lineups) {
    const history = row.espn_id ? historiesByEspnId.get(row.espn_id) ?? null : null;
    const status: LineupResultStatus = classifyLineupResult(history, espnEventId, row.espn_id);
    const event = findEventResult(history, espnEventId);

    proposed.push({
      team_id: row.team_id,
      team_name: row.team_name,
      slot: row.slot,
      golfer_name: row.golfer_name,
      espn_id: row.espn_id,
      current_fedex_points: row.fedex_points,
      fetched_fedex_points: status === 'played' ? event?.fedexPoints ?? 0 : 0,
      position_display: event?.positionDisplay ?? null,
      status,
      message: null,
    });

    summary.total += 1;
    summary[status] += 1;
  }

  return { proposed, summary };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- merge-proposed-results
```

Expected: 7 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scoring/merge-proposed-results.ts src/lib/__tests__/scoring/merge-proposed-results.test.ts
git commit -m "feat(scoring): mergeProposedResults builds the fetch-scores proposal"
```

### Task 2.5: Add scoring barrel export

**Files:**
- Create: `src/lib/scoring/index.ts`

- [ ] **Step 1: Write the barrel**

```typescript
export * from './types';
export { findEventResult } from './find-event-result';
export { classifyLineupResult } from './classify-lineup-result';
export { mergeProposedResults } from './merge-proposed-results';
export type { LineupRow, MergeResult } from './merge-proposed-results';
```

- [ ] **Step 2: Verify compile**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/scoring/index.ts
git commit -m "feat(scoring): add scoring barrel export"
```

---

## Chunk 3: Cache orchestrator

The orchestrator reads the `player_history_cache` table for a given (espnIds, season), fetches misses and stale rows via `egolfapi`, upserts them back, and returns a `Map<espnId, PlayerSeasonHistory | null>` (null = fetch failed). It is the only piece in the scoring library that performs I/O.

### Task 3.1: TDD the cache freshness check

The cache logic decides which (espnId, season) rows are fresh, stale, or missing. Test that as a pure helper before wiring DB calls.

**Files:**
- Create: `src/lib/__tests__/scoring/cache-freshness.test.ts`
- Create: `src/lib/scoring/cache-freshness.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { partitionByCacheFreshness, CACHE_TTL_MS } from '@/lib/scoring/cache-freshness';

describe('partitionByCacheFreshness', () => {
  const now = new Date('2026-05-05T12:00:00Z');

  it('returns all ids as misses when cache is empty', () => {
    const { fresh, stale, missing } = partitionByCacheFreshness(['a', 'b'], new Map(), now);
    expect(missing).toEqual(['a', 'b']);
    expect(fresh.size).toBe(0);
    expect(stale).toEqual([]);
  });

  it('returns ids with cached rows < 24h old as fresh', () => {
    const cache = new Map([
      ['a', { fetched_at: new Date(now.getTime() - 1000 * 60 * 60), payload: { tag: 'A' } }],
    ]);
    const { fresh, stale, missing } = partitionByCacheFreshness(['a'], cache, now);
    expect(fresh.get('a')).toEqual({ tag: 'A' });
    expect(missing).toEqual([]);
    expect(stale).toEqual([]);
  });

  it('returns ids older than TTL as stale', () => {
    const cache = new Map([
      ['a', { fetched_at: new Date(now.getTime() - CACHE_TTL_MS - 1), payload: { tag: 'A' } }],
    ]);
    const { stale, fresh, missing } = partitionByCacheFreshness(['a'], cache, now);
    expect(stale).toEqual(['a']);
    expect(fresh.size).toBe(0);
    expect(missing).toEqual([]);
  });

  it('partitions a mix correctly', () => {
    const cache = new Map([
      ['fresh-id',  { fetched_at: new Date(now.getTime() - 1000),                   payload: { tag: 'F' } }],
      ['stale-id',  { fetched_at: new Date(now.getTime() - CACHE_TTL_MS - 1000),    payload: { tag: 'S' } }],
    ]);
    const { fresh, stale, missing } = partitionByCacheFreshness(
      ['fresh-id', 'stale-id', 'missing-id'],
      cache,
      now,
    );
    expect([...fresh.keys()]).toEqual(['fresh-id']);
    expect(stale).toEqual(['stale-id']);
    expect(missing).toEqual(['missing-id']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- cache-freshness
```

- [ ] **Step 3: Write minimal implementation**

```typescript
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface CacheRow<T> {
  fetched_at: Date;
  payload: T;
}

export interface PartitionResult<T> {
  fresh: Map<string, T>;
  stale: string[];
  missing: string[];
}

export function partitionByCacheFreshness<T>(
  ids: string[],
  cache: Map<string, CacheRow<T>>,
  now: Date,
): PartitionResult<T> {
  const fresh = new Map<string, T>();
  const stale: string[] = [];
  const missing: string[] = [];
  const cutoff = now.getTime() - CACHE_TTL_MS;

  for (const id of ids) {
    const row = cache.get(id);
    if (!row) {
      missing.push(id);
    } else if (row.fetched_at.getTime() < cutoff) {
      stale.push(id);
    } else {
      fresh.set(id, row.payload);
    }
  }

  return { fresh, stale, missing };
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm test -- cache-freshness
```

Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scoring/cache-freshness.ts src/lib/__tests__/scoring/cache-freshness.test.ts
git commit -m "feat(scoring): partitionByCacheFreshness splits ids into fresh/stale/missing"
```

### Task 3.2: Implement `fetchAndCacheHistories` (orchestrator)

This is the I/O-bearing function. It uses dependency injection — the caller passes a `db` interface (read/upsert the cache) and an `ESPNClient` instance — so the function is unit-testable with fakes.

**Files:**
- Create: `src/lib/__tests__/scoring/fetch-and-cache-histories.test.ts`
- Create: `src/lib/scoring/fetch-and-cache-histories.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { fetchAndCacheHistories } from '@/lib/scoring/fetch-and-cache-histories';
import type { PlayerSeasonHistory } from '@/lib/egolfapi';

function makeHistory(espnId: string, season: number): PlayerSeasonHistory {
  const player = { espnId, displayName: `Player ${espnId}`, shortName: null, normalizedName: `player ${espnId}` };
  return { player, season, results: [] };
}

describe('fetchAndCacheHistories', () => {
  const now = new Date('2026-05-05T12:00:00Z');

  it('returns fresh cache entries without calling the client', async () => {
    const cacheRead = jest.fn().mockResolvedValue([
      { espn_id: 'a', season: 2026, fetched_at: new Date(now.getTime() - 1000), payload: makeHistory('a', 2026) },
    ]);
    const cacheUpsert = jest.fn();
    const client = { getPlayerHistory: jest.fn() };

    const result = await fetchAndCacheHistories(['a'], 2026, { cacheRead, cacheUpsert }, client as any, now);

    expect(client.getPlayerHistory).not.toHaveBeenCalled();
    expect(cacheUpsert).not.toHaveBeenCalled();
    expect(result.get('a')).toEqual(makeHistory('a', 2026));
  });

  it('fetches missing entries via the client and upserts them', async () => {
    const cacheRead = jest.fn().mockResolvedValue([]);
    const cacheUpsert = jest.fn().mockResolvedValue(undefined);
    const fetched = makeHistory('b', 2026);
    const client = { getPlayerHistory: jest.fn().mockResolvedValue(fetched) };

    const result = await fetchAndCacheHistories(['b'], 2026, { cacheRead, cacheUpsert }, client as any, now);

    expect(client.getPlayerHistory).toHaveBeenCalledWith('b', 2026);
    expect(cacheUpsert).toHaveBeenCalledWith('b', 2026, fetched);
    expect(result.get('b')).toEqual(fetched);
  });

  it('refetches stale entries', async () => {
    const stale = makeHistory('c', 2026);
    const fresh = { ...stale, results: [{ player: stale.player, eventId: '401001', eventName: 'X', positionDisplay: '1', fedexPoints: 700 }] };
    const cacheRead = jest.fn().mockResolvedValue([
      { espn_id: 'c', season: 2026, fetched_at: new Date(now.getTime() - 1000 * 60 * 60 * 25), payload: stale },
    ]);
    const cacheUpsert = jest.fn().mockResolvedValue(undefined);
    const client = { getPlayerHistory: jest.fn().mockResolvedValue(fresh) };

    const result = await fetchAndCacheHistories(['c'], 2026, { cacheRead, cacheUpsert }, client as any, now);

    expect(client.getPlayerHistory).toHaveBeenCalledWith('c', 2026);
    expect(result.get('c')).toEqual(fresh);
  });

  it('records null when fetching fails for a single player', async () => {
    const cacheRead = jest.fn().mockResolvedValue([]);
    const cacheUpsert = jest.fn();
    const client = { getPlayerHistory: jest.fn().mockRejectedValue(new Error('502')) };

    const result = await fetchAndCacheHistories(['d'], 2026, { cacheRead, cacheUpsert }, client as any, now);

    expect(result.get('d')).toBeNull();
    expect(cacheUpsert).not.toHaveBeenCalled();
  });

  it('falls back to the stale payload when refetch fails', async () => {
    const stale = makeHistory('e', 2026);
    const cacheRead = jest.fn().mockResolvedValue([
      { espn_id: 'e', season: 2026, fetched_at: new Date(now.getTime() - 1000 * 60 * 60 * 25), payload: stale },
    ]);
    const cacheUpsert = jest.fn();
    const client = { getPlayerHistory: jest.fn().mockRejectedValue(new Error('timeout')) };

    const result = await fetchAndCacheHistories(['e'], 2026, { cacheRead, cacheUpsert }, client as any, now);

    expect(result.get('e')).toEqual(stale);
    expect(cacheUpsert).not.toHaveBeenCalled();
  });

  it('handles a mix of cache hit, miss, and stale in one call', async () => {
    const histA = makeHistory('a', 2026);
    const histB = makeHistory('b', 2026);
    const histC = makeHistory('c', 2026);
    const cacheRead = jest.fn().mockResolvedValue([
      { espn_id: 'a', season: 2026, fetched_at: new Date(now.getTime() - 1000), payload: histA },
      { espn_id: 'c', season: 2026, fetched_at: new Date(now.getTime() - 1000 * 60 * 60 * 25), payload: histC },
    ]);
    const cacheUpsert = jest.fn().mockResolvedValue(undefined);
    const client = {
      getPlayerHistory: jest.fn().mockImplementation(async (id: string) => {
        if (id === 'b') return histB;
        if (id === 'c') return { ...histC, results: [{ /* updated */ } as any] };
        throw new Error('unexpected');
      }),
    };

    const result = await fetchAndCacheHistories(['a', 'b', 'c'], 2026, { cacheRead, cacheUpsert }, client as any, now);

    expect(result.get('a')).toEqual(histA);
    expect(result.get('b')).toEqual(histB);
    expect(result.get('c')?.results).toHaveLength(1);
    expect(client.getPlayerHistory).toHaveBeenCalledTimes(2); // b (miss) + c (stale)
    expect(cacheUpsert).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- fetch-and-cache-histories
```

- [ ] **Step 3: Write minimal implementation**

```typescript
import type { ESPNClient, PlayerSeasonHistory } from '@/lib/egolfapi';
import { partitionByCacheFreshness, type CacheRow } from './cache-freshness';
import type { HistoryByEspnId } from './types';

export interface CacheRowRecord {
  espn_id: string;
  season: number;
  fetched_at: Date;
  payload: PlayerSeasonHistory;
}

export interface CacheIO {
  cacheRead(espnIds: string[], season: number): Promise<CacheRowRecord[]>;
  cacheUpsert(espnId: string, season: number, payload: PlayerSeasonHistory): Promise<void>;
}

export async function fetchAndCacheHistories(
  espnIds: string[],
  season: number,
  io: CacheIO,
  client: Pick<ESPNClient, 'getPlayerHistory'>,
  now: Date = new Date(),
): Promise<HistoryByEspnId> {
  const result: HistoryByEspnId = new Map();
  if (espnIds.length === 0) return result;

  const rows = await io.cacheRead(espnIds, season);
  const cache = new Map<string, CacheRow<PlayerSeasonHistory>>();
  for (const row of rows) {
    cache.set(row.espn_id, { fetched_at: row.fetched_at, payload: row.payload });
  }

  const { fresh, stale, missing } = partitionByCacheFreshness(espnIds, cache, now);

  for (const [id, payload] of fresh) result.set(id, payload);

  // Refetch stale entries; on failure, fall back to the stale payload.
  for (const id of stale) {
    try {
      const fetched = await client.getPlayerHistory(id, season);
      result.set(id, fetched);
      await io.cacheUpsert(id, season, fetched);
    } catch {
      // fall back to stale; do not bubble — partial success is fine.
      const stalePayload = cache.get(id)!.payload;
      result.set(id, stalePayload);
    }
  }

  // Fetch missing entries; on failure, record null.
  for (const id of missing) {
    try {
      const fetched = await client.getPlayerHistory(id, season);
      result.set(id, fetched);
      await io.cacheUpsert(id, season, fetched);
    } catch {
      result.set(id, null);
    }
  }

  return result;
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm test -- fetch-and-cache-histories
```

Expected: 6 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scoring/fetch-and-cache-histories.ts src/lib/__tests__/scoring/fetch-and-cache-histories.test.ts
git commit -m "feat(scoring): fetchAndCacheHistories orchestrates cache + egolfapi"
```

### Task 3.3: Update barrel export

**Files:**
- Modify: `src/lib/scoring/index.ts`

- [ ] **Step 1: Re-export the new module**

```typescript
export * from './types';
export { findEventResult } from './find-event-result';
export { classifyLineupResult } from './classify-lineup-result';
export { mergeProposedResults } from './merge-proposed-results';
export type { LineupRow, MergeResult } from './merge-proposed-results';
export { fetchAndCacheHistories, type CacheIO, type CacheRowRecord } from './fetch-and-cache-histories';
export { CACHE_TTL_MS } from './cache-freshness';
```

- [ ] **Step 2: Verify compile**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/scoring/index.ts
git commit -m "feat(scoring): re-export orchestrator from barrel"
```

---

## Chunk 4: API routes

Three new routes plus an edit to the tournament-detail endpoint already done in Chunk 1. The fetch-scores route is the marquee piece; the other two are smaller.

### Task 4.1: `/api/admin/espn-schedule` route

Returns `getSchedule(season)` events to the picker. Single ESPN call, no cache needed (Next.js fetch cache will handle dedupe within a request).

**Files:**
- Create: `src/app/api/admin/espn-schedule/route.ts`

- [ ] **Step 1: Write the route**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { ESPNClient } from '@/lib/egolfapi';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  noStore();
  try {
    const seasonParam = request.nextUrl.searchParams.get('season');
    const season = seasonParam ? parseInt(seasonParam, 10) : NaN;
    if (!Number.isInteger(season) || season < 2000 || season > 2100) {
      return NextResponse.json({ error: 'Valid season query param required' }, { status: 400 });
    }

    const client = new ESPNClient({ delayMs: 500 });
    const schedule = await client.getSchedule(season);
    return NextResponse.json(schedule);
  } catch (error) {
    console.error('espn-schedule error:', error);
    return NextResponse.json({ error: 'Failed to fetch schedule from ESPN' }, { status: 502 });
  }
}
```

- [ ] **Step 2: Smoke test in dev**

```bash
npm run dev
# In another terminal:
curl 'http://localhost:3000/api/admin/espn-schedule?season=2026' | head -c 500
```

Expected: a JSON object with `season: 2026` and an `events` array.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/espn-schedule/route.ts
git commit -m "feat(api): add /api/admin/espn-schedule"
```

### Task 4.2: `/api/admin/tournament-espn-mapping` route

Updates only `espn_event_id` and `season` on a single tournament row. Used by the backfill page.

**Files:**
- Create: `src/app/api/admin/tournament-espn-mapping/route.ts`

- [ ] **Step 1: Write the route**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const { tournament_id, espn_event_id, season } = await request.json();

    if (!tournament_id || !espn_event_id || !Number.isInteger(season)) {
      return NextResponse.json(
        { error: 'tournament_id, espn_event_id, and integer season required' },
        { status: 400 },
      );
    }

    const rows = await sql`SELECT 1 FROM tournaments WHERE tournament_id = ${tournament_id}`;
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    await sql`
      UPDATE tournaments
      SET espn_event_id = ${espn_event_id}, season = ${season}
      WHERE tournament_id = ${tournament_id}
    `;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (typeof error?.message === 'string' && error.message.includes('duplicate key')) {
      return NextResponse.json(
        { error: 'That ESPN event id is already mapped to another tournament' },
        { status: 409 },
      );
    }
    console.error('tournament-espn-mapping error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Smoke test**

Pick an existing tournament and a real-looking event id:

```bash
curl -X POST http://localhost:3000/api/admin/tournament-espn-mapping \
  -H 'Content-Type: application/json' \
  -d '{"tournament_id":"<existing-id>","espn_event_id":"401703488","season":2026}'
```

Expected: `{"success":true}`. Verify the update in Neon: `SELECT espn_event_id, season FROM tournaments WHERE tournament_id = '<existing-id>'`.

Then revert the test edit so the row goes back to NULL — we don't want a real backfill yet.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/tournament-espn-mapping/route.ts
git commit -m "feat(api): add /api/admin/tournament-espn-mapping"
```

### Task 4.3: `/api/admin/fetch-scores` route

The main route. Loads tournament + lineups, calls `fetchAndCacheHistories`, calls `mergeProposedResults`, returns `FetchScoresResponse`.

**Files:**
- Create: `src/app/api/admin/fetch-scores/route.ts`

- [ ] **Step 1: Write the route**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { sql } from '@/lib/db';
import { ESPNClient } from '@/lib/egolfapi';
import {
  fetchAndCacheHistories,
  mergeProposedResults,
  type CacheIO,
  type CacheRowRecord,
  type LineupRow,
  type FetchScoresResponse,
} from '@/lib/scoring';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  noStore();
  try {
    const { tournament_id } = await request.json();
    if (!tournament_id) {
      return NextResponse.json({ error: 'tournament_id required' }, { status: 400 });
    }

    const tournamentRows = await sql`
      SELECT tournament_id, name, espn_event_id, season
      FROM tournaments
      WHERE tournament_id = ${tournament_id}
    `;
    if (tournamentRows.length === 0) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }
    const tournament = tournamentRows[0];
    if (!tournament.espn_event_id || !tournament.season) {
      return NextResponse.json(
        { error: 'Tournament has no ESPN event id mapped. Map it on /admin/backfill-events first.' },
        { status: 400 },
      );
    }

    const espnEventId = String(tournament.espn_event_id);
    const season = Number(tournament.season);

    // Load lineup rows joined with roster + golfer for names and espn_ids.
    const lineupRows = await sql`
      SELECT
        l.team_id, t.team_name, l.slot, g.name AS golfer_name, g.espn_id, l.fedex_points
      FROM lineups l
      JOIN teams   t ON t.team_id = l.team_id
      JOIN rosters r ON r.team_id = l.team_id AND r.slot = l.slot
      JOIN golfers g ON g.golfer_id = r.golfer_id
      WHERE l.tournament_id = ${tournament_id}
      ORDER BY t.team_name, l.slot
    `;
    const lineups: LineupRow[] = lineupRows.map((r) => ({
      team_id: Number(r.team_id),
      team_name: String(r.team_name),
      slot: Number(r.slot),
      golfer_name: String(r.golfer_name),
      espn_id: r.espn_id == null ? null : String(r.espn_id),
      fedex_points: r.fedex_points == null ? null : Number(r.fedex_points),
    }));

    const uniqueEspnIds = Array.from(
      new Set(lineups.map((l) => l.espn_id).filter((x): x is string => x !== null)),
    );

    const io: CacheIO = {
      async cacheRead(ids, s) {
        if (ids.length === 0) return [];
        const rows = await sql`
          SELECT espn_id, season, fetched_at, payload
          FROM player_history_cache
          WHERE season = ${s} AND espn_id = ANY(${ids}::text[])
        `;
        return rows.map((r) => ({
          espn_id: String(r.espn_id),
          season: Number(r.season),
          fetched_at: new Date(r.fetched_at as string),
          payload: r.payload as CacheRowRecord['payload'],
        }));
      },
      async cacheUpsert(espnId, s, payload) {
        await sql`
          INSERT INTO player_history_cache (espn_id, season, payload, fetched_at)
          VALUES (${espnId}, ${s}, ${JSON.stringify(payload)}::jsonb, NOW())
          ON CONFLICT (espn_id, season)
          DO UPDATE SET payload = EXCLUDED.payload, fetched_at = NOW()
        `;
      },
    };

    const client = new ESPNClient({ delayMs: 500 });
    const histories = await fetchAndCacheHistories(uniqueEspnIds, season, io, client);
    const merged = mergeProposedResults(lineups, histories, espnEventId);

    // If every fetch failed, surface as a 502 — likely an ESPN-wide outage.
    const fetchAttempts = uniqueEspnIds.length;
    const fetchFailures = merged.summary.fetch_failed;
    if (fetchAttempts > 0 && fetchFailures === fetchAttempts) {
      return NextResponse.json(
        { error: 'All ESPN history requests failed. Try again or enter results manually.' },
        { status: 502 },
      );
    }

    const response: FetchScoresResponse = {
      tournament_id: String(tournament.tournament_id),
      espn_event_id: espnEventId,
      season,
      proposed: merged.proposed,
      summary: merged.summary,
    };
    return NextResponse.json(response);
  } catch (error) {
    console.error('fetch-scores error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Smoke test against the dev DB**

You need at least one tournament with `espn_event_id` and `season` set, and matching lineups. Set them by hand for one tournament:

```sql
UPDATE tournaments SET espn_event_id = '401703488', season = 2026 WHERE tournament_id = '<some-id>';
```

Then:

```bash
curl -X POST http://localhost:3000/api/admin/fetch-scores \
  -H 'Content-Type: application/json' \
  -d '{"tournament_id":"<some-id>"}'
```

Expected: a JSON response with `proposed: [...]` and `summary: {...}`. Inspect the per-row statuses against your knowledge of the event.

The first call may take ~25s if the cache is empty. A second call within 24h should be near-instant.

- [ ] **Step 3: Revert the manual mapping**

```sql
UPDATE tournaments SET espn_event_id = NULL, season = NULL WHERE tournament_id = '<some-id>';
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/admin/fetch-scores/route.ts
git commit -m "feat(api): add /api/admin/fetch-scores"
```

---

## Chunk 5: Picker component and wiring into tournament create/edit

A reusable `<EspnEventPicker>` that fetches a season's schedule and lets the admin pick. Used in two places: the create-tournament card on `/admin` and the backfill page.

### Task 5.1: Build `<EspnEventPicker>`

The component takes a default season (defaults to current year), a `onChange({ espnEventId, season, eventName })` callback, and an optional `currentTournamentName` for similarity-based pre-sorting.

**Files:**
- Create: `src/components/EspnEventPicker.tsx`

- [ ] **Step 1: Write the component**

```typescript
'use client';

import { useEffect, useState } from 'react';

interface ScheduleEvent {
  eventId: string;
  name: string;
  startDate: string;
  endDate: string;
}

interface ScheduleResponse {
  season: number;
  events: ScheduleEvent[];
}

export interface EspnEventPickerProps {
  defaultSeason?: number;
  currentTournamentName?: string;
  onChange: (selection: { espnEventId: string; season: number; eventName: string } | null) => void;
}

function similarityScore(name: string, target: string): number {
  if (!target) return 0;
  const a = name.toLowerCase();
  const b = target.toLowerCase();
  if (a === b) return 1000;
  if (a.includes(b) || b.includes(a)) return 500;
  // Cheap token-overlap score; good enough for one-off picks.
  const aTokens = new Set(a.split(/\s+/));
  const bTokens = new Set(b.split(/\s+/));
  let overlap = 0;
  for (const t of bTokens) if (aTokens.has(t)) overlap += 1;
  return overlap;
}

export function EspnEventPicker({ defaultSeason, currentTournamentName, onChange }: EspnEventPickerProps) {
  const currentYear = new Date().getFullYear();
  const [season, setSeason] = useState<number>(defaultSeason ?? currentYear);
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    fetch(`/api/admin/espn-schedule?season=${season}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'Failed to load schedule');
        return r.json();
      })
      .then((data: ScheduleResponse) => {
        if (cancelled) return;
        const sorted = currentTournamentName
          ? [...data.events].sort((a, b) => similarityScore(b.name, currentTournamentName) - similarityScore(a.name, currentTournamentName))
          : data.events;
        setEvents(sorted);
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [season, currentTournamentName]);

  const handleSelect = (eventId: string) => {
    setSelectedId(eventId);
    if (!eventId) {
      onChange(null);
      return;
    }
    const event = events.find((e) => e.eventId === eventId);
    if (event) onChange({ espnEventId: event.eventId, season, eventName: event.name });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-charcoal-light">Season:</label>
        <select
          value={season}
          onChange={(e) => setSeason(parseInt(e.target.value, 10))}
          className="input py-1 px-2 text-sm w-24"
        >
          {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>
      {loading ? (
        <p className="text-sm text-charcoal-light">Loading schedule…</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : (
        <select
          value={selectedId}
          onChange={(e) => handleSelect(e.target.value)}
          className="input w-full"
        >
          <option value="">Pick an event…</option>
          {events.map((e) => (
            <option key={e.eventId} value={e.eventId}>
              {e.name} ({e.startDate.slice(0, 10)})
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify compile**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/EspnEventPicker.tsx
git commit -m "feat(ui): add EspnEventPicker component"
```

### Task 5.2: Wire picker into the create-tournament form

The existing form has three inputs (id, name, deadline). The picker fills in the id by selecting an ESPN event; the admin still types the name and deadline. When an event is picked, `tournament_id` defaults to the ESPN event id and `season` is captured. The admin can override the id if they want a different label, but the default makes new tournaments satisfy the "tournament_id = espn_event_id" rule.

**Files:**
- Modify: `src/app/admin/page.tsx`

- [ ] **Step 1: Extend the new-tournament state shape**

In the `useState` for `newTournament`, add `espn_event_id: ''` and `season: 0`:

```typescript
const [newTournament, setNewTournament] = useState({
  tournament_id: '',
  name: '',
  deadline: '',
  espn_event_id: '',
  season: 0,
});
```

- [ ] **Step 2: Render the picker above the existing inputs**

Import the picker at the top of the file and add it inside the create card, before the existing 3-column grid:

```typescript
import { EspnEventPicker } from '@/components/EspnEventPicker';

// ... inside the create card:
<div className="mb-4">
  <label className="block text-sm font-medium text-charcoal-light mb-2 uppercase tracking-wide">
    ESPN Event
  </label>
  <EspnEventPicker
    currentTournamentName={newTournament.name}
    onChange={(sel) => {
      if (!sel) {
        setNewTournament((prev) => ({ ...prev, espn_event_id: '', season: 0 }));
        return;
      }
      setNewTournament((prev) => ({
        ...prev,
        espn_event_id: sel.espnEventId,
        season: sel.season,
        // Default tournament_id to the espn event id; admin can still override.
        tournament_id: prev.tournament_id || sel.espnEventId,
        // Default name from the ESPN event if the field is empty.
        name: prev.name || sel.eventName,
      }));
    }}
  />
</div>
```

- [ ] **Step 3: Send the new fields on create**

Update `createTournament`:

```typescript
const createTournament = async () => {
  setSaving(true);
  await fetch('/api/admin/tournament', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'create',
      tournament_id: newTournament.tournament_id,
      name: newTournament.name,
      deadline: newTournament.deadline,
      espn_event_id: newTournament.espn_event_id || null,
      season: newTournament.season || null,
    }),
  });
  setNewTournament({ tournament_id: '', name: '', deadline: '', espn_event_id: '', season: 0 });
  const res = await fetch('/api/tournaments');
  setTournaments(await res.json());
  setSaving(false);
};
```

- [ ] **Step 4: Disable the Create button until a picker selection exists**

Tighten the disabled clause on the Create button:

```typescript
disabled={
  saving ||
  !newTournament.tournament_id ||
  !newTournament.name ||
  !newTournament.deadline ||
  !newTournament.espn_event_id
}
```

- [ ] **Step 5: Manual smoke test**

Run `npm run dev`, open `/admin`, pick an ESPN event from a future season, fill in deadline, click Create. Verify the new row in Neon has `espn_event_id` and `season` populated.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/page.tsx
git commit -m "feat(admin): wire EspnEventPicker into create-tournament form"
```

---

## Chunk 6: Backfill page

A one-purpose admin page at `/admin/backfill-events` that lists every tournament where `espn_event_id IS NULL` and lets the admin map each one with the picker.

### Task 6.1: Build the backfill page

**Files:**
- Create: `src/app/admin/backfill-events/page.tsx`

- [ ] **Step 1: Write the page**

```typescript
'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { EspnEventPicker } from '@/components/EspnEventPicker';
import { Tournament } from '@/types';

interface Pending extends Tournament {}

export default function BackfillEventsPage() {
  const { isCommissioner, isLoading } = useAuth();
  const router = useRouter();
  const [pending, setPending] = useState<Pending[]>([]);
  const [savingId, setSavingId] = useState<string>('');
  const [error, setError] = useState<{ [id: string]: string }>({});
  const [selection, setSelection] = useState<{ [id: string]: { espnEventId: string; season: number } | null }>({});

  useEffect(() => {
    if (!isLoading && !isCommissioner) router.push('/');
  }, [isLoading, isCommissioner, router]);

  const reload = useCallback(async () => {
    const res = await fetch('/api/tournaments');
    const data: Tournament[] = await res.json();
    setPending(data.filter((t) => !t.espn_event_id));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const save = async (tournament_id: string) => {
    const sel = selection[tournament_id];
    if (!sel) return;
    setSavingId(tournament_id);
    setError((prev) => ({ ...prev, [tournament_id]: '' }));
    try {
      const res = await fetch('/api/admin/tournament-espn-mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tournament_id, espn_event_id: sel.espnEventId, season: sel.season }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError((prev) => ({ ...prev, [tournament_id]: body.error ?? 'Save failed' }));
      } else {
        await reload();
      }
    } catch {
      setError((prev) => ({ ...prev, [tournament_id]: 'Network error' }));
    } finally {
      setSavingId('');
    }
  };

  if (isLoading || !isCommissioner) {
    return <div className="p-8 text-charcoal-light">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-cream">
      <header className="header">
        <div className="header-content">
          <Link href="/admin" className="header-title hover:opacity-80">Fantasy Golf League</Link>
          <span className="badge badge-gold">Commissioner</span>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-6 py-8">
        <Link href="/admin" className="inline-flex items-center text-sm text-masters-green hover:text-masters-fairway mb-4">
          ← Back to Admin
        </Link>
        <h2 className="font-display text-2xl font-bold text-charcoal mb-2">Backfill ESPN Event IDs</h2>
        <p className="text-sm text-charcoal-light mb-6">
          {pending.length === 0
            ? 'All tournaments have an ESPN event mapped.'
            : `${pending.length} tournament${pending.length === 1 ? '' : 's'} missing an ESPN event id.`}
        </p>

        <div className="space-y-4">
          {pending.map((t) => {
            const sel = selection[t.tournament_id];
            return (
              <div key={t.tournament_id} className="card">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-medium text-charcoal">{t.name}</h3>
                    <p className="text-xs text-charcoal-light">
                      ID: {t.tournament_id} · Deadline: {new Date(t.deadline).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <EspnEventPicker
                  defaultSeason={new Date(t.deadline).getFullYear()}
                  currentTournamentName={t.name}
                  onChange={(s) => setSelection((prev) => ({ ...prev, [t.tournament_id]: s }))}
                />
                {error[t.tournament_id] && (
                  <p className="text-sm text-red-600 mt-2">{error[t.tournament_id]}</p>
                )}
                <div className="flex justify-end mt-3">
                  <button
                    onClick={() => save(t.tournament_id)}
                    disabled={!sel || savingId === t.tournament_id}
                    className="btn btn-primary text-sm py-2 px-4"
                  >
                    {savingId === t.tournament_id ? 'Saving…' : 'Save mapping'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Add a link from the admin home**

In `src/app/admin/page.tsx`, near the top of the main panel, add a small link to the backfill page (visible whenever any tournament is missing the mapping):

```typescript
{tournaments.some((t) => !t.espn_event_id) && (
  <div className="mb-6 p-4 rounded-lg bg-amber-50 border border-amber-200 text-sm">
    Some tournaments are missing an ESPN event mapping.{' '}
    <Link href="/admin/backfill-events" className="font-medium text-amber-900 underline">
      Backfill them →
    </Link>
  </div>
)}
```

- [ ] **Step 3: Manual smoke test**

Open `/admin/backfill-events`. Pick a season and event for one tournament, save. Verify in Neon that the row updated. Reload the page — the mapped tournament should disappear from the list.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/backfill-events src/app/admin/page.tsx
git commit -m "feat(admin): add backfill-events page"
```

---

## Chunk 7: Results page integration

The biggest UI change. Adds the Pull Results button, status badges per row, and the summary banner. Bundles in the two adjust-dialog fixes.

### Task 7.1: Hold proposed results in component state

**Files:**
- Modify: `src/app/admin/results/[id]/page.tsx`

- [ ] **Step 1: Add proposed-results state and types**

At the top of the file, import the scoring types:

```typescript
import type { FetchScoresResponse, LineupResultStatus, ProposedResult } from '@/lib/scoring';
```

Inside `ResultsPage`, add new state for the proposal and the fetch action:

```typescript
const [proposalByKey, setProposalByKey] = useState<Map<string, ProposedResult>>(new Map());
const [summary, setSummary] = useState<FetchScoresResponse['summary'] | null>(null);
const [fetching, setFetching] = useState(false);
const [fetchError, setFetchError] = useState('');
const [tournamentEspnEventId, setTournamentEspnEventId] = useState<string | null>(null);
```

In `fetchData`, capture `data.tournament.espn_event_id` into the new state alongside `tournamentName`.

- [ ] **Step 2: Verify compile**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/results/[id]/page.tsx
git commit -m "feat(results): scaffold proposal state"
```

### Task 7.2: Add the Pull Results from ESPN handler

**Files:**
- Modify: `src/app/admin/results/[id]/page.tsx`

- [ ] **Step 1: Add the handler**

```typescript
const handlePullResults = async () => {
  setFetching(true);
  setFetchError('');
  try {
    const res = await fetch('/api/admin/fetch-scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tournament_id: id }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setFetchError(body.error ?? 'Fetch failed');
      return;
    }
    const data: FetchScoresResponse = await res.json();

    // Build a key -> proposal map and overlay points into the existing inputs.
    const map = new Map<string, ProposedResult>();
    const updated = [...results];
    for (const p of data.proposed) {
      const key = `${p.team_id}:${p.slot}`;
      map.set(key, p);
      const idx = updated.findIndex((r) => r.team_id === p.team_id && r.slot === p.slot);
      if (idx !== -1 && p.status === 'played') {
        updated[idx] = { ...updated[idx], fedex_points: p.fetched_fedex_points };
      }
    }
    setProposalByKey(map);
    setResults(updated);
    setSummary(data.summary);
  } catch (e) {
    setFetchError('Network error');
  } finally {
    setFetching(false);
  }
};
```

- [ ] **Step 2: Render the button and summary banner**

Place this block above the existing CSV download/upload block:

```typescript
{tournamentEspnEventId && results.length > 0 && (
  <div className="mb-6">
    <div className="flex flex-wrap items-center gap-3">
      <button
        onClick={handlePullResults}
        disabled={fetching}
        className="btn btn-primary text-sm py-2 px-4"
        title="Fetch FedEx points from ESPN for every lineup row"
      >
        {fetching ? 'Pulling…' : 'Pull Results from ESPN'}
      </button>
      {fetchError && <span className="text-sm text-red-600">{fetchError}</span>}
    </div>
    {summary && (
      <div className="mt-3 p-3 rounded-lg bg-cream/50 border border-cream-dark text-sm text-charcoal">
        Fetched {summary.played + summary.missed_cut + summary.withdrew} of {summary.total} results
        {summary.did_not_play > 0 ? ` — ${summary.did_not_play} did not play` : ''}
        {summary.missed_cut > 0 ? ` — ${summary.missed_cut} missed cut` : ''}
        {summary.withdrew > 0 ? ` — ${summary.withdrew} withdrew` : ''}
        {summary.manual_entry > 0 ? ` — ${summary.manual_entry} need manual entry` : ''}
        {summary.fetch_failed > 0 ? ` — ${summary.fetch_failed} fetch failed` : ''}
      </div>
    )}
  </div>
)}
{!tournamentEspnEventId && results.length > 0 && (
  <div className="mb-6 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
    This tournament has no ESPN event id mapped.{' '}
    <Link href="/admin/backfill-events" className="font-medium underline">Map it →</Link>{' '}
    to enable one-click scoring.
  </div>
)}
```

- [ ] **Step 3: Manual smoke test**

In dev: open the results page for a tournament that has an `espn_event_id`. Click Pull Results, wait ~25s. Verify points appear in the inputs and the summary banner reflects what the proposal contained.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/results/[id]/page.tsx
git commit -m "feat(results): add Pull Results from ESPN button"
```

### Task 7.3: Render status badges per lineup row

**Files:**
- Modify: `src/app/admin/results/[id]/page.tsx`

- [ ] **Step 1: Add a small badge helper**

Above the component or as a sibling component:

```typescript
function StatusBadge({ status, positionDisplay }: { status: LineupResultStatus; positionDisplay: string | null }) {
  const config: Record<LineupResultStatus, { label: string; className: string }> = {
    played:        { label: positionDisplay ?? 'Played', className: 'bg-green-100 text-green-800' },
    missed_cut:    { label: 'MC',                          className: 'bg-amber-100 text-amber-800' },
    withdrew:      { label: 'WD',                          className: 'bg-amber-100 text-amber-800' },
    did_not_play:  { label: 'DNP',                         className: 'bg-amber-100 text-amber-900' },
    manual_entry:  { label: 'Manual entry',                className: 'bg-red-100 text-red-800' },
    fetch_failed:  { label: 'Fetch failed',                className: 'bg-red-100 text-red-800' },
  };
  const c = config[status];
  return <span className={`inline-block text-xs px-2 py-0.5 rounded ${c.className}`}>{c.label}</span>;
}
```

- [ ] **Step 2: Render the badge in each lineup row**

In the inner render of `teamResults.map((r) =>`, add the badge next to the slot label:

```typescript
{(() => {
  const proposal = proposalByKey.get(`${r.team_id}:${r.slot}`);
  return proposal ? <StatusBadge status={proposal.status} positionDisplay={proposal.position_display} /> : null;
})()}
```

- [ ] **Step 3: Manual smoke test**

Pull results for a tournament. Expect a green badge with position next to played rows; amber DNP for skipped golfers; etc.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/results/[id]/page.tsx
git commit -m "feat(results): show per-row status badges after pull"
```

### Task 7.4: Fix adjust-dialog filter and surface fetched results

**Files:**
- Modify: `src/app/admin/results/[id]/page.tsx`

- [ ] **Step 1: Fix the filter (the latent bug)**

In `openAdjustmentModal`, build a set of slots already in the current lineup, and replace the filter inside the modal render. First, store the in-use slots when opening:

```typescript
const openAdjustmentModal = async (entry: LineupResult) => {
  const slotsInLineup = new Set(
    results.filter((r) => r.team_id === entry.team_id).map((r) => r.slot),
  );
  setAdjustment({
    isOpen: true,
    teamId: entry.team_id,
    teamName: entry.team_name,
    oldSlot: entry.slot,
    oldGolferName: entry.golfer_name,
    roster: [],
    newSlot: null,
    newPoints: 0,
    note: '',
    loading: true,
    error: '',
    slotsInLineup,           // new
    teamProposal: new Map(   // new — only this team's proposals
      [...proposalByKey.values()]
        .filter((p) => p.team_id === entry.team_id)
        .map((p) => [p.slot, p]),
    ),
  });
  // ... existing fetch of roster
};
```

Update the `AdjustmentState` interface:

```typescript
interface AdjustmentState {
  // ...existing fields
  slotsInLineup: Set<number>;
  teamProposal: Map<number, ProposedResult>;
}
```

Initialize `slotsInLineup: new Set()` and `teamProposal: new Map()` in the empty state used by `closeAdjustmentModal` and the initial `useState`.

Then change the modal filter from:

```typescript
.filter((slot) => slot.slot !== adjustment.oldSlot)
```

to:

```typescript
.filter((slot) => slot.slot !== adjustment.oldSlot && !adjustment.slotsInLineup.has(slot.slot))
```

- [ ] **Step 2: Show fetched result on each candidate**

Inside the candidate `<button>` rendering, alongside `times_used`, render a small info line if a proposal exists for that candidate slot:

```typescript
{(() => {
  const candidateProposal = adjustment.teamProposal.get(slot.slot);
  if (!candidateProposal) return null;
  return (
    <div className="mt-1 flex items-center gap-2 text-xs">
      <StatusBadge status={candidateProposal.status} positionDisplay={candidateProposal.position_display} />
      {candidateProposal.status === 'played' && (
        <span className="text-charcoal-light">{candidateProposal.fetched_fedex_points} pts</span>
      )}
    </div>
  );
})()}
```

- [ ] **Step 3: Pre-populate the points input when picking a played candidate**

In the `onClick` for a candidate button, if a proposal exists with `status === 'played'`, set `newPoints` to that value:

```typescript
onClick={() => {
  if (isMaxed) return;
  const candidateProposal = adjustment.teamProposal.get(slot.slot);
  setAdjustment((prev) => ({
    ...prev,
    newSlot: slot.slot,
    newPoints: candidateProposal?.status === 'played' ? candidateProposal.fetched_fedex_points : prev.newPoints,
  }));
}}
```

- [ ] **Step 4: Manual smoke test**

Open the adjust dialog for a played row. Verify:
1. The other 3 slots already in the lineup are NOT shown.
2. Each candidate shows a status badge if a proposal exists.
3. Picking a played candidate auto-fills the points input.
4. Picking a DNP candidate leaves the points input alone.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/results/[id]/page.tsx
git commit -m "fix(results): adjust dialog filters in-use slots and shows fetched results"
```

---

## Chunk 8: Finalization and verification

### Task 8.1: Walk the backfill page on production data

This step is manual and has no code change, but is part of the rollout sequence.

- [ ] **Step 1: Deploy to a Vercel preview branch**

```bash
git push origin <feature-branch>
```

Open the preview URL on `/admin/backfill-events` (with commissioner login). Map every existing tournament to its ESPN event. Verify in Neon that every row has `espn_event_id` and `season` populated.

- [ ] **Step 2: For one fully-scored tournament from a prior season, verify the fetched proposal matches the saved values**

Open `/admin/results/[id]` for a tournament with known correct `fedex_points`. Click Pull Results. The fetched values should match the existing values (within a tolerance of, say, 0 — they should be exact).

If there's drift, classify it: did ESPN change a value retroactively? Did the original CSV scraper produce a different number? Document the gap and decide whether to overwrite or keep manual values.

### Task 8.2: Run migration 0006 (NOT NULL)

**Files:**
- Create: `drizzle/migrations/0006_finalize_tournament_columns.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Run AFTER all tournaments have espn_event_id and season filled in.
-- Verifies that no rows are still null before applying the constraint.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM tournaments WHERE espn_event_id IS NULL) THEN
    RAISE EXCEPTION 'Some tournaments still have espn_event_id IS NULL — backfill first.';
  END IF;
  IF EXISTS (SELECT 1 FROM tournaments WHERE season IS NULL) THEN
    RAISE EXCEPTION 'Some tournaments still have season IS NULL — backfill first.';
  END IF;
END $$;

ALTER TABLE tournaments ALTER COLUMN espn_event_id SET NOT NULL;
ALTER TABLE tournaments ALTER COLUMN season SET NOT NULL;
```

- [ ] **Step 2: Run on production after backfill is complete**

Paste into the Neon production console. Expected: success. If you get the RAISE EXCEPTION, finish the backfill first.

- [ ] **Step 3: Commit**

```bash
git add drizzle/migrations/0006_finalize_tournament_columns.sql
git commit -m "feat(db): finalize tournament espn_event_id and season as NOT NULL"
```

### Task 8.3: End-to-end manual verification on Vercel preview

- [ ] **Step 1: Score the next live tournament end-to-end on the preview URL**

Once a real tournament finishes, on the preview branch:
1. Open `/admin/results/[id]` for that tournament.
2. Click Pull Results from ESPN. Expect ~25s wait (cache empty).
3. Review the proposal: badges look right, summary is sensible.
4. Click Save Results.
5. Verify standings update on `/`.
6. Re-open the same page; click Pull Results again. Expect near-instant return (cache hit).

- [ ] **Step 2: Score the *next* tournament after that — verify cache reuse**

When the following week's tournament closes:
1. Pull results. Many rostered golfers should already be in the cache → faster than the first run.
2. Verify any newly-rostered (waiver) golfers populate correctly.

- [ ] **Step 3: Merge to main**

Once both runs verify cleanly, merge the feature branch into `main` and let Vercel deploy production.

```bash
git checkout main
git merge --no-ff <feature-branch>
git push origin main
```

---

## Out of scope (per spec)

- Live (in-progress) leaderboard display
- Cron-based automated scoring
- Public API for non-admins
- Backfilling historical FedEx points across prior seasons
- Publishing egolfapi to npm

## Open verification points (resolve during implementation)

- Confirm `egolfapi`'s upstream repo path matches the default `../egolfapi/egolfapi` used by the sync script — adjust the default in `scripts/sync-egolfapi.ts` if not.
- Confirm `parsePlayerHistory` handles the `numeric` JSON we'll get from `payload` round-tripped through Postgres `JSONB`. If there's any string/number drift on revival, normalize it inside `cacheRead`.
- The 500ms rate-limit assumes ESPN tolerates 2 req/sec from a single client. If the first production run sees 403/429 responses, raise `delayMs` in the scoring route to 750ms or 1000ms (reduces headroom; still fits within 60s for 50 calls at 1s = 50s).
