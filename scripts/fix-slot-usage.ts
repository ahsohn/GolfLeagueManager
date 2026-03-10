import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL!);

async function fixSlotUsage() {
  console.log('Checking current slot usage discrepancies...\n');

  // First, show discrepancies
  const discrepancies = await sql`
    SELECT
      r.team_id,
      t.team_name,
      r.slot,
      g.name as golfer_name,
      r.times_used as current_times_used,
      COALESCE(l.actual_uses, 0)::int as calculated_times_used
    FROM rosters r
    JOIN teams t ON r.team_id = t.team_id
    JOIN golfers g ON r.golfer_id = g.golfer_id
    LEFT JOIN (
      SELECT team_id, slot, COUNT(*)::int as actual_uses
      FROM lineups
      WHERE fedex_points IS NOT NULL
      GROUP BY team_id, slot
    ) l ON r.team_id = l.team_id AND r.slot = l.slot
    WHERE r.times_used != COALESCE(l.actual_uses, 0)
    ORDER BY r.team_id, r.slot
  `;

  if (discrepancies.length === 0) {
    console.log('No discrepancies found. All slot counts are correct!');
    return;
  }

  console.log(`Found ${discrepancies.length} discrepancies:\n`);
  for (const d of discrepancies) {
    console.log(`  Team ${d.team_id} (${d.team_name}), Slot ${d.slot}: ${d.golfer_name}`);
    console.log(`    Current: ${d.current_times_used}/8, Should be: ${d.calculated_times_used}/8\n`);
  }

  // Fix them
  console.log('Fixing slot usage counts...\n');

  await sql`
    UPDATE rosters r
    SET times_used = COALESCE(
      (SELECT COUNT(*)
       FROM lineups l
       WHERE l.team_id = r.team_id
         AND l.slot = r.slot
         AND l.fedex_points IS NOT NULL),
      0
    )
  `;

  // Verify the fix
  const afterFix = await sql`
    SELECT
      r.team_id,
      t.team_name,
      r.slot,
      g.name as golfer_name,
      r.times_used
    FROM rosters r
    JOIN teams t ON r.team_id = t.team_id
    JOIN golfers g ON r.golfer_id = g.golfer_id
    WHERE (r.team_id, r.slot) IN (
      SELECT team_id, slot FROM unnest(${discrepancies.map(d => d.team_id)}::int[], ${discrepancies.map(d => d.slot)}::int[]) AS t(team_id, slot)
    )
    ORDER BY r.team_id, r.slot
  `;

  console.log('Fixed! Updated values:\n');
  for (const r of afterFix) {
    console.log(`  Team ${r.team_id} (${r.team_name}), Slot ${r.slot}: ${r.golfer_name} - now ${r.times_used}/8`);
  }

  console.log('\nDone!');
}

fixSlotUsage().catch(console.error);
