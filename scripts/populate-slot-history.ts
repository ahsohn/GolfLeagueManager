/**
 * Populate slot_history table with original draft assignments
 * Reconstructs original draft from current rosters + waiver_log
 */
import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  console.log('Populating slot_history table...\n');

  // Get waiver log ordered by timestamp (oldest first)
  const waiverLog = await sql`SELECT * FROM waiver_log ORDER BY timestamp ASC`;

  // Get current rosters
  const rosters = await sql`
    SELECT r.team_id, r.slot, r.golfer_id, g.name as golfer_name
    FROM rosters r
    JOIN golfers g ON r.golfer_id = g.golfer_id
    ORDER BY r.team_id, r.slot
  `;

  // Get all golfers for name->id lookup
  const golfers = await sql`SELECT golfer_id, name FROM golfers`;
  const golferNameToId = new Map<string, number>();
  for (const g of golfers) {
    golferNameToId.set(g.name as string, g.golfer_id as number);
  }

  // Build original draft: team_id -> slot -> original_golfer_id
  const originalDraft = new Map<number, Map<number, number>>();

  // Start with current rosters
  for (const r of rosters) {
    const teamId = r.team_id as number;
    const slot = r.slot as number;
    const golferId = r.golfer_id as number;

    if (!originalDraft.has(teamId)) {
      originalDraft.set(teamId, new Map());
    }
    originalDraft.get(teamId)!.set(slot, golferId);
  }

  // Find first dropped golfer for each team+slot (that's the original)
  const firstDropped = new Map<string, string>();
  for (const w of waiverLog) {
    const key = `${w.team_id}-${w.slot}`;
    if (!firstDropped.has(key)) {
      firstDropped.set(key, w.dropped_golfer as string);
    }
  }

  // Update originalDraft with first dropped golfers
  for (const [key, golferName] of firstDropped) {
    const [teamIdStr, slotStr] = key.split('-');
    const teamId = parseInt(teamIdStr);
    const slot = parseInt(slotStr);
    const golferId = golferNameToId.get(golferName);

    if (golferId) {
      originalDraft.get(teamId)!.set(slot, golferId);
    } else {
      console.warn(`Could not find golfer_id for "${golferName}"`);
    }
  }

  // Clear existing slot_history and insert new records
  await sql`DELETE FROM slot_history`;
  console.log('Cleared existing slot_history records');

  let insertCount = 0;
  for (const [teamId, slots] of originalDraft) {
    for (const [slot, golferId] of slots) {
      await sql`
        INSERT INTO slot_history (team_id, golfer_id, original_slot)
        VALUES (${teamId}, ${golferId}, ${slot})
      `;
      insertCount++;
    }
  }

  console.log(`Inserted ${insertCount} records into slot_history`);

  // Verify
  const count = await sql`SELECT COUNT(*) as cnt FROM slot_history`;
  console.log(`\nVerification: slot_history now has ${count[0].cnt} records`);
}

main().catch(console.error);
