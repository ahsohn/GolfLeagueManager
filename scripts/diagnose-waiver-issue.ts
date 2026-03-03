/**
 * Diagnostic script to investigate waiver issues
 * Run with: npx tsx scripts/diagnose-waiver-issue.ts
 */

import { neon } from '@neondatabase/serverless';

async function diagnose() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const sql = neon(databaseUrl);

  console.log('=== WAIVER ISSUE DIAGNOSIS ===\n');

  // 1. Check for Aldrich Potgieter and Brian Campbell in golfers table
  console.log('1. Looking up golfers in the golfers table...');
  const golfers = await sql`
    SELECT golfer_id, name FROM golfers
    WHERE name ILIKE '%Potgieter%' OR name ILIKE '%Campbell%'
    ORDER BY name
  `;
  console.log('Found golfers:');
  golfers.forEach(g => console.log(`  - ID ${g.golfer_id}: ${g.name}`));

  // 2. Check if these golfers appear in rosters
  console.log('\n2. Checking rosters table for these golfers...');
  const golferIds = golfers.map(g => g.golfer_id);
  if (golferIds.length > 0) {
    const rosterEntries = await sql`
      SELECT r.team_id, t.team_name, r.slot, r.golfer_id, g.name as golfer_name, r.times_used
      FROM rosters r
      JOIN teams t ON r.team_id = t.team_id
      JOIN golfers g ON r.golfer_id = g.golfer_id
      WHERE r.golfer_id = ANY(${golferIds})
    `;
    if (rosterEntries.length > 0) {
      console.log('These golfers ARE currently on rosters:');
      rosterEntries.forEach(r =>
        console.log(`  - ${r.golfer_name} (ID ${r.golfer_id}) on Team ${r.team_id} (${r.team_name}), Slot ${r.slot}, times_used: ${r.times_used}`)
      );
    } else {
      console.log('These golfers are NOT on any roster (should be available)');
    }
  }

  // 3. Check waiver_log for recent transactions involving these golfers
  console.log('\n3. Checking waiver_log for transactions involving these golfers...');
  const waiverLogs = await sql`
    SELECT id, timestamp, team_id, dropped_golfer, added_golfer, slot
    FROM waiver_log
    WHERE dropped_golfer ILIKE '%Potgieter%'
       OR dropped_golfer ILIKE '%Campbell%'
       OR added_golfer ILIKE '%Potgieter%'
       OR added_golfer ILIKE '%Campbell%'
    ORDER BY timestamp DESC
  `;
  if (waiverLogs.length > 0) {
    console.log('Waiver transactions found:');
    waiverLogs.forEach(w =>
      console.log(`  - [${w.timestamp}] Team ${w.team_id}: Dropped "${w.dropped_golfer}", Added "${w.added_golfer}" (Slot ${w.slot})`)
    );
  } else {
    console.log('No waiver transactions found involving these golfers');
  }

  // 4. Show Team 11's current roster
  console.log('\n4. Team 11\'s current roster...');
  const team11Roster = await sql`
    SELECT r.slot, r.golfer_id, g.name as golfer_name, r.times_used
    FROM rosters r
    JOIN golfers g ON r.golfer_id = g.golfer_id
    WHERE r.team_id = 11
    ORDER BY r.slot
  `;
  console.log('Team 11 roster:');
  team11Roster.forEach(r =>
    console.log(`  Slot ${r.slot}: ${r.golfer_name} (ID ${r.golfer_id}), times_used: ${r.times_used}`)
  );

  // 5. Show recent waiver activity (last 10)
  console.log('\n5. Recent waiver activity (last 10)...');
  const recentWaivers = await sql`
    SELECT wl.id, wl.timestamp, wl.team_id, t.team_name, wl.dropped_golfer, wl.added_golfer, wl.slot
    FROM waiver_log wl
    LEFT JOIN teams t ON wl.team_id = t.team_id
    ORDER BY wl.timestamp DESC
    LIMIT 10
  `;
  console.log('Recent waivers:');
  recentWaivers.forEach(w =>
    console.log(`  [${w.timestamp}] ${w.team_name} (Team ${w.team_id}): Dropped "${w.dropped_golfer}", Added "${w.added_golfer}" (Slot ${w.slot})`)
  );

  // 6. Check for duplicate golfer entries in rosters (shouldn't happen)
  console.log('\n6. Checking for duplicate golfer entries in rosters...');
  const duplicates = await sql`
    SELECT golfer_id, COUNT(*) as count
    FROM rosters
    GROUP BY golfer_id
    HAVING COUNT(*) > 1
  `;
  if (duplicates.length > 0) {
    console.log('WARNING: Found golfers on multiple rosters (BUG!):');
    for (const d of duplicates) {
      const details = await sql`
        SELECT r.team_id, t.team_name, r.slot, g.name
        FROM rosters r
        JOIN teams t ON r.team_id = t.team_id
        JOIN golfers g ON r.golfer_id = g.golfer_id
        WHERE r.golfer_id = ${d.golfer_id}
      `;
      console.log(`  Golfer ID ${d.golfer_id} appears ${d.count} times:`);
      details.forEach(det => console.log(`    - Team ${det.team_id} (${det.team_name}), Slot ${det.slot}, Name: ${det.name}`));
    }
  } else {
    console.log('No duplicate entries found (good)');
  }

  console.log('\n=== DIAGNOSIS COMPLETE ===');
}

diagnose().catch(console.error);
