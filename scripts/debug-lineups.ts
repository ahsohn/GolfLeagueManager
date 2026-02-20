import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import { join } from 'path';

// Load .env.local manually
const envPath = join(process.cwd(), '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
for (const line of envContent.split('\n')) {
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length > 0) {
    process.env[key.trim()] = valueParts.join('=').trim();
  }
}

const sql = neon(process.env.DATABASE_URL!);

async function debugLineups() {
  console.log('=== Checking lineups for teams 5 and 7 ===\n');

  // Check all lineups for teams 5 and 7
  const lineups = await sql`
    SELECT tournament_id, team_id, slot, fedex_points
    FROM lineups
    WHERE team_id IN (5, 7)
    ORDER BY tournament_id, team_id, slot
  `;

  console.log('Lineups for teams 5 and 7:');
  console.log(JSON.stringify(lineups, null, 2));
  console.log(`\nTotal rows: ${lineups.length}`);

  // Check specifically for T002
  console.log('\n=== Checking T002 specifically ===\n');

  const t002Lineups = await sql`
    SELECT tournament_id, team_id, slot, fedex_points
    FROM lineups
    WHERE tournament_id = 'T002'
    ORDER BY team_id, slot
  `;

  console.log('All lineups for T002:');
  console.log(JSON.stringify(t002Lineups, null, 2));
  console.log(`\nTotal rows for T002: ${t002Lineups.length}`);

  // Check for different tournament_id formats
  console.log('\n=== Checking all distinct tournament_ids ===\n');

  const tournamentIds = await sql`
    SELECT DISTINCT tournament_id
    FROM lineups
    ORDER BY tournament_id
  `;

  console.log('Distinct tournament_ids in lineups table:');
  for (const t of tournamentIds) {
    // Show hex representation to catch any hidden characters
    const tid = t.tournament_id as string;
    const hex = Buffer.from(tid).toString('hex');
    console.log(`  "${tid}" (hex: ${hex}, length: ${tid.length})`);
  }

  // Check team_id types
  console.log('\n=== Checking team_id data types ===\n');

  const teamTypes = await sql`
    SELECT DISTINCT team_id, pg_typeof(team_id) as type
    FROM lineups
    WHERE team_id IN (5, 7)
    LIMIT 5
  `;

  console.log('Team ID types:');
  console.log(JSON.stringify(teamTypes, null, 2));
}

debugLineups().catch(console.error);
