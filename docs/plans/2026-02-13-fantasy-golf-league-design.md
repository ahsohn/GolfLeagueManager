# Fantasy Golf League Manager - Design Document

## Overview

A web application for managing a 13-team fantasy golf league. Team owners draft 10 PGA Tour golfers, select 4 each tournament to earn FedEx Cup points, and compete for the best season total.

**Key Rule: Slot-Based Usage Tracking**
- Each team has 10 slots (based on draft order)
- Usage limits (2-8 times) apply to slots, not golfers
- When a golfer is swapped via waivers, the new golfer inherits the slot
- If you re-acquire a golfer you previously had this season, they must return to their original slot

## Architecture

**Stack:**
- **Frontend + API:** Next.js 14 (App Router) on Vercel
- **Styling:** Tailwind CSS
- **Data:** Google Sheets via Sheets API v4
- **Auth:** Email-only login (no password), stored in localStorage
- **Scheduled Jobs:** Vercel Cron for auto-locking tournaments

**Why Google Sheets:**
- Zero hosting cost
- Commissioners can view/edit data directly
- Built-in backup and version history
- API rate limits are fine for 13 teams

**Security:**
- Google Sheets API key stored in Vercel environment variables
- Frontend calls Vercel API routes (serverless functions)
- API key never exposed to browser

## Data Model (Google Sheets)

### Sheet 1: Teams
| team_id | team_name | owner_email |
|---------|-----------|-------------|
| 1 | Tiger's Army | john@example.com |

### Sheet 2: Golfers
| golfer_id | name |
|-----------|------|
| 101 | Scottie Scheffler |

### Sheet 3: Rosters
| team_id | slot | golfer_id | times_used |
|---------|------|-----------|------------|
| 1 | 1 | 101 | 3 |

- `slot` is fixed (1-10 per team, from draft order)
- `golfer_id` can change via waivers
- `times_used` tracks the slot usage, not the golfer

### Sheet 4: Tournaments
| tournament_id | name | deadline | status |
|---------------|------|----------|--------|
| T001 | Genesis Invitational | 2025-02-12 23:59 | locked |

### Sheet 5: Lineups
| tournament_id | team_id | slot | fedex_points |
|---------------|---------|------|--------------|
| T001 | 1 | 1 | 550 |

(4 rows per team per tournament — references slots, not golfers directly)

### Sheet 6: Standings
| team_id | total_points |
|---------|--------------|
| 1 | 4250 |

### Sheet 7: WaiverLog
| timestamp | team_id | dropped_golfer | added_golfer | slot |
|-----------|---------|----------------|--------------|------|
| 2025-02-15 14:32 | 1 | Rory McIlroy | Collin Morikawa | 3 |

### Sheet 8: SlotHistory
| team_id | golfer_id | original_slot |
|---------|-----------|---------------|
| 1 | 105 | 3 |

Tracks which slot a golfer was in when dropped (current season only). Used to enforce re-acquisition rule: if you pick up a golfer you previously had, they must return to their original slot.

### Sheet 9: Config
| key | value |
|-----|-------|
| commissioner_emails | admin1@example.com,admin2@example.com |

## Authentication

- **Login:** Enter email, matched against Teams sheet owner_email
- **Session:** Email stored in browser localStorage for auto-login on return
- **No password:** Honor system for trusted friend group
- **Admin check:** Commissioner emails stored in Config sheet

## Lineup Rules

- Each team has 10 slots (draft positions 1-10)
- Select 4 slots per tournament (UI shows golfer names in those slots)
- Each slot must be used 2-8 times per season
- Fixed deadline (specific day/time each week)

**Default Lineup Logic:**
1. First tournament: Slots 1-4 (top 4 draft picks)
2. Subsequent tournaments: Previous week's 4 slots
3. If slot ineligible (8 uses): Substitute next eligible slot
4. Auto-applied if owner misses deadline

## Waiver System

- First-come, first-served instant swaps
- Drop one rostered player, pick up any unrostered golfer
- Available between tournaments (before next deadline)
- Dropped player immediately available to others
- New golfer inherits the slot of the dropped golfer (keeps slot's times_used)
- All moves logged in WaiverLog sheet

**Re-acquisition Rule:**
- When a golfer is dropped, record their slot in SlotHistory
- If picking up a golfer previously on your team (this season), they MUST return to their original slot
- This means you must drop whoever is currently in that slot
- SlotHistory resets each season

## Pages

| Route | Purpose |
|-------|---------|
| `/login` | Email login screen |
| `/` | Standings + current tournament link |
| `/tournament/[id]` | All lineups for a tournament, results after scoring |
| `/lineup` | Set your 4 picks (pre-filled with defaults) |
| `/waivers` | Drop/add players |
| `/admin` | Tournament management, enter results |
| `/admin/results/[id]` | Enter FedEx points for tournament |

## API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/auth/login` | POST | Validate email, return team info |
| `/api/standings` | GET | All teams with total points |
| `/api/tournaments` | GET | List all tournaments |
| `/api/tournaments/[id]` | GET | Tournament details + all lineups |
| `/api/lineup` | GET | Current user's lineup for a tournament |
| `/api/lineup` | POST | Submit/update lineup |
| `/api/roster/[teamId]` | GET | Team's roster with usage counts |
| `/api/waivers/available` | GET | List free agent golfers |
| `/api/waivers` | POST | Execute drop/add swap |
| `/api/admin/tournament` | POST | Create/edit/lock tournament |
| `/api/admin/results` | POST | Enter FedEx points |

**Server-side Validation:**
- Can't use a slot more than 8 times
- Can't submit after deadline
- Can't pick up golfer already rostered
- Re-acquired golfers must return to original slot

## Admin/Commissioner Workflow

**Commissioners:** 2-3 people identified by email in Config sheet

**Tournament Flow:**
1. Create tournament with name and deadline
2. Auto-lock at deadline (Vercel cron) fills missing lineups
3. After tournament ends, enter FedEx points for each golfer in lineups
4. System calculates team totals and updates standings

**Commissioner Tools:**
- Manual lock/unlock tournaments
- Edit any roster or lineup
- Direct Google Sheet access for fixes

## Testing Strategy

**Local Development:**
- `npm run dev` against test Google Sheet
- Separate test sheet with fake data

**Automated Tests (Jest):**
- Unit tests for lineup validation logic
- API integration tests with mock data

**Manual Testing Checklist:**
- [ ] Login as team owner
- [ ] Set lineup, verify save
- [ ] Attempt to exceed 8 slot uses (blocked)
- [ ] Submit after deadline (blocked)
- [ ] Waiver swap (new golfer inherits slot)
- [ ] Re-acquire previous golfer (must use original slot)
- [ ] Commissioner enters results
- [ ] Standings update correctly

**Environment Separation:**
- `GOOGLE_SHEET_ID` env var switches between test and production sheets

## Deployment

1. Create Google Sheet with 9 tabs (Teams, Golfers, Rosters, Tournaments, Lineups, Standings, WaiverLog, SlotHistory, Config)
2. Create Google Cloud service account, share sheet with it
3. Deploy Next.js to Vercel with credentials as env vars
4. Configure Vercel cron for daily deadline checks
5. Populate initial data (teams, drafted rosters with slots, golfers)
