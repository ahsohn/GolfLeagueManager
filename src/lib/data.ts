import {
  Team,
  Golfer,
  RosterEntry,
  Tournament,
  LineupEntry,
  Standing,
  WaiverLogEntry,
  SlotHistoryEntry,
  Config,
} from '@/types';

export function parseTeams(rows: string[][]): Team[] {
  if (rows.length <= 1) return [];
  return rows.slice(1).map((row) => ({
    team_id: parseInt(row[0], 10),
    team_name: row[1],
    owner_email: row[2],
  }));
}

export function parseGolfers(rows: string[][]): Golfer[] {
  if (rows.length <= 1) return [];
  return rows.slice(1).map((row) => ({
    golfer_id: parseInt(row[0], 10),
    name: row[1],
  }));
}

export function parseRosters(rows: string[][]): RosterEntry[] {
  if (rows.length <= 1) return [];
  return rows.slice(1).map((row) => ({
    team_id: parseInt(row[0], 10),
    slot: parseInt(row[1], 10),
    golfer_id: parseInt(row[2], 10),
    times_used: parseInt(row[3], 10),
  }));
}

export function parseSlotHistory(rows: string[][]): SlotHistoryEntry[] {
  if (rows.length <= 1) return [];
  return rows.slice(1).map((row) => ({
    team_id: parseInt(row[0], 10),
    golfer_id: parseInt(row[1], 10),
    original_slot: parseInt(row[2], 10),
  }));
}

export function parseTournaments(rows: string[][]): Tournament[] {
  if (rows.length <= 1) return [];
  return rows.slice(1).map((row) => ({
    tournament_id: row[0],
    name: row[1],
    deadline: row[2],
    status: row[3] as 'open' | 'locked',
  }));
}

export function parseLineups(rows: string[][]): LineupEntry[] {
  if (rows.length <= 1) return [];
  return rows.slice(1).map((row) => ({
    tournament_id: row[0],
    team_id: parseInt(row[1], 10),
    slot: parseInt(row[2], 10),
    fedex_points: row[3] ? parseInt(row[3], 10) : null,
  }));
}

export function parseStandings(rows: string[][]): Standing[] {
  if (rows.length <= 1) return [];
  return rows.slice(1).map((row) => ({
    team_id: parseInt(row[0], 10),
    total_points: parseInt(row[1], 10) || 0,
  }));
}

export function parseWaiverLog(rows: string[][]): WaiverLogEntry[] {
  if (rows.length <= 1) return [];
  return rows.slice(1).map((row) => ({
    timestamp: row[0],
    team_id: parseInt(row[1], 10),
    dropped_golfer: row[2],
    added_golfer: row[3],
    slot: parseInt(row[4], 10),
  }));
}

export function parseConfig(rows: string[][]): Config[] {
  if (rows.length <= 1) return [];
  return rows.slice(1).map((row) => ({
    key: row[0],
    value: row[1],
  }));
}

export function getConfigValue(configs: Config[], key: string): string | undefined {
  return configs.find((c) => c.key === key)?.value;
}
