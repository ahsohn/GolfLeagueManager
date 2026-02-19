import { RosterEntry, LineupEntry } from '@/types';

const MAX_USES = 8;
const LINEUP_SIZE = 4;

export function canUseSlot(rosterEntry: RosterEntry): boolean {
  return rosterEntry.times_used < MAX_USES;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  warning?: string;
}

export function validateLineupSelection(
  slots: number[],
  roster: RosterEntry[]
): ValidationResult {
  // Check at least 1 slot selected
  if (slots.length === 0) {
    return { valid: false, error: 'Must select at least 1 golfer' };
  }

  // Check not more than 4 slots
  if (slots.length > LINEUP_SIZE) {
    return { valid: false, error: `Cannot select more than ${LINEUP_SIZE} golfers` };
  }

  // Check for duplicates
  const uniqueSlots = new Set(slots);
  if (uniqueSlots.size !== slots.length) {
    return { valid: false, error: 'Cannot select the same slot twice' };
  }

  // Check each slot
  for (const slot of slots) {
    const rosterEntry = roster.find((r) => r.slot === slot);

    if (!rosterEntry) {
      return { valid: false, error: `Slot ${slot} is not on roster` };
    }

    if (!canUseSlot(rosterEntry)) {
      return {
        valid: false,
        error: `Slot ${slot} has already been used ${MAX_USES} times`,
      };
    }
  }

  // Add warning if fewer than 4 selected
  if (slots.length < LINEUP_SIZE) {
    return {
      valid: true,
      warning: `You have only selected ${slots.length} golfer${slots.length === 1 ? '' : 's'}. You can select up to ${LINEUP_SIZE}.`
    };
  }

  return { valid: true };
}

export function getDefaultLineup(
  roster: RosterEntry[],
  previousLineup: LineupEntry[]
): number[] {
  const eligibleRoster = roster
    .filter(canUseSlot)
    .sort((a, b) => a.slot - b.slot);

  // If no previous lineup, return top 4 slots by slot number
  if (previousLineup.length === 0) {
    return eligibleRoster.slice(0, LINEUP_SIZE).map((r) => r.slot);
  }

  // Start with previous lineup slots that are still eligible
  const previousSlots = previousLineup.map((l) => l.slot);
  const stillEligible = previousSlots.filter((slot) =>
    eligibleRoster.some((r) => r.slot === slot)
  );

  // Fill remaining with next eligible slots
  const selected = new Set(stillEligible);
  for (const entry of eligibleRoster) {
    if (selected.size >= LINEUP_SIZE) break;
    if (!selected.has(entry.slot)) {
      selected.add(entry.slot);
    }
  }

  // Sort by slot number for consistent ordering
  return Array.from(selected).sort((a, b) => a - b);
}

export function isDeadlinePassed(deadline: string): boolean {
  // Deadlines are stored without timezone but are meant to be Eastern Time.
  // The deadline string is like "2026-02-18T23:59:00" meaning 11:59 PM Eastern.
  //
  // Strategy: Get the current time in Eastern, format it as a naive string,
  // then compare strings/dates directly.

  const now = new Date();

  // Format current time as Eastern timezone naive datetime string
  const easternFormatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  // This gives us "YYYY-MM-DD HH:MM:SS" in Eastern time
  const nowEasternStr = easternFormatter.format(now).replace(' ', 'T');

  // Compare the deadline (Eastern) with current Eastern time
  // Both are naive datetime strings, so direct comparison works
  const deadlineNormalized = deadline.replace(' ', 'T').substring(0, 19);

  return deadlineNormalized < nowEasternStr;
}
