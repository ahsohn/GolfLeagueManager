# Fantasy Golf League Manager - Design Document

## Overview

A web application for managing a 13-team fantasy golf league. Team owners draft 10 PGA Tour golfers, select 4 each tournament to earn FedEx Cup points, and compete for the best season total. Each rostered player must be used 2-8 times throughout the season.

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
| team_id | golfer_id | draft_position | times_used |
|---------|-----------|----------------|------------|
| 1 | 101 | 1 | 3 |

### Sheet 4: Tournaments
| tournament_id | name | deadline | status |
|---------------|------|----------|--------|
| T001 | Genesis Invitational | 2025-02-12 23:59 | locked |

### Sheet 5: Lineups
| tournament_id | team_id | golfer_id | fedex_points |
|---------------|---------|-----------|--------------|
| T001 | 1 | 101 | 550 |

(4 rows per team per tournament)

### Sheet 6: Standings
| team_id | total_points |
|---------|--------------|
| 1 | 4250 |

### Sheet 7: WaiverLog
| timestamp | team_id | dropped_golfer | added_golfer |
|-----------|---------|----------------|--------------|
| 2025-02-15 14:32 | 1 | Rory McIlroy | Collin Morikawa |

### Sheet 8: Config
| key | value |
|-----|-------|
| commissioner_emails | admin1@example.com,admin2@example.com |

## Authentication

- **Login:** Enter email, matched against Teams sheet owner_email
- **Session:** Email stored in browser localStorage for auto-login on return
- **No password:** Honor system for trusted friend group
- **Admin check:** Commissioner emails stored in Config sheet

## Lineup Rules

- Each team has 10 rostered golfers
- Select 4 per tournament
- Each player must be used 2-8 times per season
- Fixed deadline (specific day/time each week)

**Default Lineup Logic:**
1. First tournament: Top 4 by draft position
2. Subsequent tournaments: Previous week's 4 picks
3. If player ineligible (8 uses): Substitute next eligible by draft position
4. Auto-applied if owner misses deadline

## Waiver System

- First-come, first-served instant swaps
- Drop one rostered player, pick up any unrostered golfer
- Available between tournaments (before next deadline)
- Dropped player immediately available to others
- Picked-up player starts with 0 times used
- All moves logged in WaiverLog sheet

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
- Can't use a player more than 8 times
- Can't submit after deadline
- Can't pick up golfer already rostered

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
- [ ] Attempt to exceed 8 uses (blocked)
- [ ] Submit after deadline (blocked)
- [ ] Waiver swap
- [ ] Commissioner enters results
- [ ] Standings update correctly

**Environment Separation:**
- `GOOGLE_SHEET_ID` env var switches between test and production sheets

## Deployment

1. Create Google Sheet with 8 tabs
2. Create Google Cloud service account, share sheet with it
3. Deploy Next.js to Vercel with credentials as env vars
4. Configure Vercel cron for daily deadline checks
5. Populate initial data (teams, drafted rosters, golfers)
