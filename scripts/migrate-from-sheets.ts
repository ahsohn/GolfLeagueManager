/**
 * One-time migration script: Google Sheets → Neon PostgreSQL
 *
 * Prerequisites:
 *   - Set all Google Sheets env vars AND DATABASE_URL in .env.local
 *   - Run the SQL migration first: drizzle/migrations/0001_initial.sql
 *
 * Usage:
 *   npx tsx scripts/migrate-from-sheets.ts
 */

import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
import { neon } from '@neondatabase/serverless';

// Use the sheets/data libs from src/ via relative imports
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getSheetData, SHEET_NAMES } = require(path.join(__dirname, '../src/lib/sheets'));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { parseTeams, parseGolfers, parseRosters, parseTournaments, parseLineups, parseStandings, parseWaiverLog, parseSlotHistory, parseConfig } = require(path.join(__dirname, '../src/lib/data'));

const sql = neon(process.env.DATABASE_URL!);

async function migrate() {
  console.log('Starting migration from Google Sheets → Neon PostgreSQL...\n');

  // ── Teams ─────────────────────────────────────────────────────────────
  console.log('Migrating teams...');
  const teams = parseTeams(await getSheetData(SHEET_NAMES.TEAMS));
  for (const t of teams) {
    await sql`INSERT INTO teams (team_id, team_name, owner_email) VALUES (${t.team_id}, ${t.team_name}, ${t.owner_email}) ON CONFLICT (team_id) DO NOTHING`;
  }
  console.log(`  ✓ ${teams.length} teams`);

  // ── Golfers ───────────────────────────────────────────────────────────
  console.log('Migrating golfers...');
  const golfers = parseGolfers(await getSheetData(SHEET_NAMES.GOLFERS));
  for (const g of golfers) {
    await sql`INSERT INTO golfers (golfer_id, name) VALUES (${g.golfer_id}, ${g.name}) ON CONFLICT (golfer_id) DO NOTHING`;
  }
  console.log(`  ✓ ${golfers.length} golfers`);

  // ── Tournaments ───────────────────────────────────────────────────────
  console.log('Migrating tournaments...');
  const tournaments = parseTournaments(await getSheetData(SHEET_NAMES.TOURNAMENTS));
  for (const t of tournaments) {
    await sql`INSERT INTO tournaments (tournament_id, name, deadline, status) VALUES (${t.tournament_id}, ${t.name}, ${t.deadline}, ${t.status}) ON CONFLICT (tournament_id) DO NOTHING`;
  }
  console.log(`  ✓ ${tournaments.length} tournaments`);

  // ── Rosters ───────────────────────────────────────────────────────────
  console.log('Migrating rosters...');
  const rosters = parseRosters(await getSheetData(SHEET_NAMES.ROSTERS));
  for (const r of rosters) {
    await sql`INSERT INTO rosters (team_id, slot, golfer_id, times_used) VALUES (${r.team_id}, ${r.slot}, ${r.golfer_id}, ${r.times_used}) ON CONFLICT (team_id, slot) DO NOTHING`;
  }
  console.log(`  ✓ ${rosters.length} roster entries`);

  // ── Lineups ───────────────────────────────────────────────────────────
  console.log('Migrating lineups...');
  const lineups = parseLineups(await getSheetData(SHEET_NAMES.LINEUPS));
  for (const l of lineups) {
    await sql`INSERT INTO lineups (tournament_id, team_id, slot, fedex_points) VALUES (${l.tournament_id}, ${l.team_id}, ${l.slot}, ${l.fedex_points}) ON CONFLICT (tournament_id, team_id, slot) DO NOTHING`;
  }
  console.log(`  ✓ ${lineups.length} lineup entries`);

  // ── Standings ─────────────────────────────────────────────────────────
  console.log('Migrating standings...');
  const standings = parseStandings(await getSheetData(SHEET_NAMES.STANDINGS));
  for (const s of standings) {
    await sql`INSERT INTO standings (team_id, total_points) VALUES (${s.team_id}, ${s.total_points}) ON CONFLICT (team_id) DO NOTHING`;
  }
  console.log(`  ✓ ${standings.length} standing entries`);

  // ── Waiver Log ────────────────────────────────────────────────────────
  console.log('Migrating waiver log...');
  const waiverLog = parseWaiverLog(await getSheetData(SHEET_NAMES.WAIVER_LOG));
  for (const w of waiverLog) {
    await sql`INSERT INTO waiver_log (timestamp, team_id, dropped_golfer, added_golfer, slot) VALUES (${w.timestamp}, ${w.team_id}, ${w.dropped_golfer}, ${w.added_golfer}, ${w.slot})`;
  }
  console.log(`  ✓ ${waiverLog.length} waiver log entries`);

  // ── Slot History ──────────────────────────────────────────────────────
  console.log('Migrating slot history...');
  const slotHistory = parseSlotHistory(await getSheetData(SHEET_NAMES.SLOT_HISTORY));
  for (const s of slotHistory) {
    await sql`INSERT INTO slot_history (team_id, golfer_id, original_slot) VALUES (${s.team_id}, ${s.golfer_id}, ${s.original_slot}) ON CONFLICT (team_id, original_slot) DO NOTHING`;
  }
  console.log(`  ✓ ${slotHistory.length} slot history entries`);

  // ── Config ────────────────────────────────────────────────────────────
  console.log('Migrating config...');
  const configs = parseConfig(await getSheetData(SHEET_NAMES.CONFIG));
  for (const c of configs) {
    await sql`INSERT INTO config (key, value) VALUES (${c.key}, ${c.value}) ON CONFLICT (key) DO NOTHING`;
  }
  console.log(`  ✓ ${configs.length} config entries`);

  console.log('\nMigration complete!');
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
