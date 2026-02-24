# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Fantasy Golf League Manager - A web app for a 13-team fantasy golf league where owners draft PGA golfers and compete for FedEx Cup points.

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **Data:** Neon PostgreSQL (via `@neondatabase/serverless`)
- **Hosting:** Vercel

## Development Commands

```bash
npm run dev      # Start development server
npm run build    # Production build
npm test         # Run Jest tests
npm test:watch   # Run tests in watch mode
```

## Architecture

### Data Flow
Frontend → Vercel API Routes → Neon PostgreSQL

### Key Directories
- `src/app/` - Next.js pages and API routes
- `src/lib/` - Shared utilities (db.ts, lineup-validator.ts)
- `src/types/` - TypeScript interfaces
- `src/contexts/` - React contexts (AuthContext)

### Core Logic
- `src/lib/lineup-validator.ts` - Lineup rules (4 picks, 8 max uses per slot)
- `src/lib/db.ts` - Neon PostgreSQL client (`sql` tagged template)

### Database Schema
9 tables defined in `drizzle/migrations/0001_initial.sql`:
- `teams`, `golfers`, `rosters`, `tournaments`, `lineups`, `standings`, `waiver_log`, `slot_history`, `config`

Run the migration once against your Neon database (paste into Neon console or use psql).

### Slot-Based Tracking
The league uses **slot-based** tracking, not golfer-based:
- Each team has 10 slots (1-10) from the draft
- Lineups select 4 slots per tournament
- Each slot can be used max 8 times per season
- Waivers swap the golfer in a slot (times_used resets to 0)

### Environment Variables
```
DATABASE_URL=<neon-pooled-connection-string>
```

Add via Vercel Dashboard → Storage → Neon (Marketplace). The `DATABASE_URL` is injected automatically for Preview and Production environments.

For local development, copy the Preview `DATABASE_URL` into `.env.local`.

## Migrating from Google Sheets

A one-time migration script is available:

```bash
# Requires BOTH Google Sheets vars AND DATABASE_URL set in .env.local
npx tsx scripts/migrate-from-sheets.ts
```

## Testing

Use a separate Neon database branch for testing. Switch via `DATABASE_URL` env var.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/login | Email-based login |
| GET | /api/standings | League standings |
| GET | /api/tournaments | Tournament list |
| GET | /api/tournaments/[id] | Tournament detail with lineups |
| GET | /api/roster/[teamId] | Team roster |
| GET | /api/lineup | Get lineup state |
| POST | /api/lineup | Submit/update lineup (slots) |
| GET | /api/waivers/available | Available golfers |
| POST | /api/waivers | Execute waiver swap |
| POST | /api/admin/tournament | Create/update tournament |
| POST | /api/admin/results | Enter tournament results |

## Known Issues & Solutions

### Vercel/Next.js API Route Caching

**Problem:** Tournament data entered directly in the Neon database may not appear on the production site. The API returns stale/null values even though the database has correct data.

**Root Cause:** Next.js on Vercel aggressively caches API route responses. Even with `export const dynamic = 'force-dynamic'`, responses can be cached. This has occurred multiple times when entering tournament scores directly in the database.

**Solution:** API routes that read frequently-updated data must include ALL of these:

```typescript
import { unstable_noStore as noStore } from 'next/cache';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  noStore(); // Call at start of handler
  // ... rest of handler
}
```

**Affected Routes:**
- `src/app/api/tournaments/[tournamentId]/route.ts` - Tournament detail with lineups/scores

**Workaround:** If caching issues persist, entering scores through the Admin Results page (`/admin/results/[id]`) uses the `/api/admin/results` endpoint which writes and reads in the same request, avoiding the cache issue.
