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
  return new Date(deadline) < new Date();
}
