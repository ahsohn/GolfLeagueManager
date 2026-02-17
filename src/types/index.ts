export interface Team {
  team_id: number;
  team_name: string;
  owner_email: string;
}

export interface Golfer {
  golfer_id: number;
  name: string;
}

export interface RosterEntry {
  team_id: number;
  slot: number;  // 1-10, fixed from draft order
  golfer_id: number;  // can change via waivers
  times_used: number;  // tracks slot usage, not golfer
}

export interface Tournament {
  tournament_id: string;
  name: string;
  deadline: string; // ISO datetime
  status: 'open' | 'locked' | 'closed';
}

export interface LineupEntry {
  tournament_id: string;
  team_id: number;
  slot: number;  // references slot, not golfer directly
  fedex_points: number | null;
}

export interface Standing {
  team_id: number;
  total_points: number;
}

export interface WaiverLogEntry {
  timestamp: string;
  team_id: number;
  dropped_golfer: string;
  added_golfer: string;
  slot: number;
}

export interface SlotHistoryEntry {
  team_id: number;
  golfer_id: number;
  original_slot: number;
}

export interface Config {
  key: string;
  value: string;
}

// API response types
export interface LoginResponse {
  success: boolean;
  team?: Team;
  isCommissioner?: boolean;
  error?: string;
}

export interface RosterWithGolfers extends RosterEntry {
  golfer_name: string;
}
