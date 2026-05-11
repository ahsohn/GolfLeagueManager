// Domain types — see /docs/domain-model.md.
// Field names mirror the Python dataclasses (after camelCase conversion)
// so the cross-language equivalence test sees identical JSON.

export type PlayerStatus = "active" | "cut" | "wd" | "dq" | "scheduled";
export type TournamentStatus = "scheduled" | "inProgress" | "complete";

export interface Player {
  espnId: string;
  displayName: string;
  shortName: string | null;
  normalizedName: string;
}

export interface CutMeta {
  round: number;
  score: number | null;
  count: number | null;
}

export interface Tournament {
  id: string;
  name: string;
  isMajor: boolean;
  status: TournamentStatus;
  startDate: string | null;
  endDate: string | null;
  numberOfRounds: number;
  course: string | null;
  cut: CutMeta | null;
  notes: string[];
}

export interface RoundScore {
  period: number;
  hasStarted: boolean;
  strokes: number | null;
  scoreToPar: number | null;
  scoreToParDisplay: string | null;
  front9: number | null;
  back9: number | null;
  teeTime: string | null;
}

export interface LeaderboardEntry {
  player: Player;
  position: number | null;
  positionDisplay: string;
  tied: boolean;
  scoreToPar: number | null;
  scoreToParDisplay: string | null;
  totalStrokes: number | null;
  status: PlayerStatus;
  notStarted: boolean;
  thru: number | null;
  thruDisplay: string | null;
  teeTime: string | null;
  rounds: RoundScore[];
}

export interface Leaderboard {
  tournament: Tournament;
  entries: LeaderboardEntry[];
}

export interface ScheduleEvent {
  eventId: string;
  name: string;
  startDate: string;
  endDate: string;
}

export interface Schedule {
  season: number;
  events: ScheduleEvent[];
}

export interface FedExStanding {
  rank: number;
  player: Player;
  points: number;
}

export interface FedExStandings {
  season: number;
  standings: FedExStanding[];
}

export interface PlayerEventResult {
  player: Player;
  eventId: string;
  eventName: string;
  positionDisplay: string;
  // LOCAL DIVERGENCE FROM UPSTREAM egolfapi MIRROR:
  // `null` signals that ESPN's `cupPoints` stat was absent from the response
  // (typical in the first hour after a tournament ends, before ESPN
  // publishes FedEx points). Distinguishing null from 0 lets the cache
  // refetch incomplete data instead of pinning a stale zero for 24 hours.
  fedexPoints: number | null;
}

export interface PlayerSeasonHistory {
  player: Player;
  season: number;
  results: PlayerEventResult[];
}
