# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Fantasy Golf League Manager - A web app for a 13-team fantasy golf league where owners draft PGA golfers and compete for FedEx Cup points.

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **Data:** Google Sheets API v4
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
Frontend → Vercel API Routes → Google Sheets

### Key Directories
- `src/app/` - Next.js pages and API routes
- `src/lib/` - Shared utilities (sheets.ts, data.ts, lineup-validator.ts)
- `src/types/` - TypeScript interfaces
- `src/contexts/` - React contexts (AuthContext)

### Core Logic
- `src/lib/lineup-validator.ts` - Lineup rules (4 picks, 8 max uses per slot)
- `src/lib/data.ts` - Parse sheet data into typed objects
- `src/lib/sheets.ts` - Google Sheets API connection

### Slot-Based Tracking
The league uses **slot-based** tracking, not golfer-based:
- Each team has 10 slots (1-10) from the draft
- Lineups select 4 slots per tournament
- Each slot can be used max 8 times per season
- Waivers swap the golfer in a slot (times_used resets to 0)

### Environment Variables
```
GOOGLE_SHEET_ID=<spreadsheet-id>
GOOGLE_SERVICE_ACCOUNT_EMAIL=<service-account-email>
GOOGLE_PRIVATE_KEY=<private-key>
```

## Testing

Use separate test and production Google Sheets. Switch via `GOOGLE_SHEET_ID` env var.

See `docs/test-sheet-template.md` for test data structure.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/login | Email-based login |
| GET | /api/standings | League standings |
| GET | /api/tournaments | Tournament list |
| GET | /api/tournaments/[id] | Tournament detail with lineups |
| GET | /api/roster/[teamId] | Team roster |
| GET | /api/lineup | Get lineup state |
| POST | /api/lineup | Submit lineup (slots) |
| GET | /api/waivers/available | Available golfers |
| POST | /api/waivers | Execute waiver swap |
| POST | /api/admin/tournament | Create/update tournament |
| POST | /api/admin/results | Enter tournament results |
