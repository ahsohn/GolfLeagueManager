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

async function debugRosters() {
  console.log('=== Checking rosters for teams 5 and 7 ===\n');

  const rosters = await sql`
    SELECT r.team_id, r.slot, r.golfer_id, g.name AS golfer_name
    FROM rosters r
    JOIN golfers g ON g.golfer_id = r.golfer_id
    WHERE r.team_id IN (5, 7)
    ORDER BY r.team_id, r.slot
  `;

  console.log('Rosters for teams 5 and 7:');
  console.log(JSON.stringify(rosters, null, 2));
  console.log(`\nTotal roster entries: ${rosters.length}`);

  // Check the teams table
  console.log('\n=== Checking teams 5 and 7 ===\n');

  const teams = await sql`
    SELECT team_id, team_name
    FROM teams
    WHERE team_id IN (5, 7)
  `;

  console.log('Teams 5 and 7:');
  console.log(JSON.stringify(teams, null, 2));

  // Show DATABASE_URL prefix to identify which database
  const dbUrl = process.env.DATABASE_URL || '';
  const urlParts = dbUrl.match(/postgresql:\/\/([^:]+):.*@([^/]+)/);
  if (urlParts) {
    console.log(`\n=== Connected to database ===`);
    console.log(`User: ${urlParts[1]}`);
    console.log(`Host: ${urlParts[2]}`);
  }
}

debugRosters().catch(console.error);
