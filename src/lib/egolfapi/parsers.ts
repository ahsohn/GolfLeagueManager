// Raw ESPN JSON → domain model. See /docs/quirks.md.
// Mirrors python/src/egolfapi/parsers.py — must produce identical output.

import { normalizeName } from "./normalize";
import type {
  CutMeta,
  FedExStandings,
  Leaderboard,
  LeaderboardEntry,
  Player,
  PlayerEventResult,
  PlayerSeasonHistory,
  PlayerStatus,
  RoundScore,
  Schedule,
  Tournament,
  TournamentStatus,
} from "./types";

const STATE_TO_TOURNAMENT_STATUS: Record<string, TournamentStatus> = {
  pre: "scheduled",
  in: "inProgress",
  post: "complete",
};

function playerFromAthlete(athlete: any): Player {
  const a = athlete ?? {};
  const display = a.displayName ?? "";
  return {
    espnId: String(a.id ?? ""),
    displayName: display,
    shortName: a.shortName ?? null,
    normalizedName: normalizeName(display),
  };
}

function detectStatus(competitor: any): PlayerStatus {
  const name = competitor?.status?.type?.name ?? "";
  if (typeof name !== "string") return "active";
  if (name.includes("CUT")) return "cut";
  if (name.includes("WD") || name.includes("WITHDRAW")) return "wd";
  if (name.includes("DQ") || name.includes("DISQUALIF")) return "dq";
  if (name.includes("SCHEDULED")) return "scheduled";
  return "active";
}

function parseScoreToPar(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Math.trunc(value);
  const s = String(value).trim();
  if (s === "" || s === "-") return null;
  if (s.toUpperCase() === "E") return 0;
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? null : n;
}

function parseCupPoints(competitor: any): number | null {
  // ESPN exposes per-event FedEx points on the leaderboard competitor under
  // `statistics` (stat name `cupPoints`). Absent while the event is live or
  // before ESPN publishes points — return null so callers can distinguish
  // "not published" from a legitimate 0 (e.g. a missed cut).
  const stats = competitor?.statistics ?? [];
  for (const stat of stats) {
    if (stat?.name === "cupPoints") {
      const v = Number(stat.value ?? stat.displayValue);
      return Number.isNaN(v) ? null : Math.trunc(v);
    }
  }
  return null;
}

function parseRound(round: any): RoundScore {
  const hasStarted = "value" in round || "displayValue" in round;
  const strokesRaw = round.value;
  const strokes = typeof strokesRaw === "number" ? Math.trunc(strokesRaw) : null;
  return {
    period: Number(round.period ?? 0),
    hasStarted,
    strokes,
    scoreToPar: parseScoreToPar(round.displayValue),
    scoreToParDisplay: round.displayValue ?? null,
    front9: round.outScore ?? null,
    back9: round.inScore ?? null,
    teeTime: round.teeTime ?? null,
  };
}

function tournamentFromEvent(event: any, competition: any): Tournament {
  const t = event.tournament ?? {};
  const state = event?.status?.type?.state;
  const cutRound = t.cutRound;
  let cut: CutMeta | null = null;
  if (cutRound !== undefined && cutRound !== null) {
    cut = {
      round: Number(cutRound),
      score: t.cutScore ?? null,
      count: t.cutCount ?? null,
    };
  }
  const venue = competition?.venue ?? {};
  return {
    id: String(event.id ?? ""),
    name: event.name ?? t.displayName ?? "",
    isMajor: Boolean(t.major ?? false),
    status: STATE_TO_TOURNAMENT_STATUS[state] ?? "scheduled",
    startDate: event.date ?? null,
    endDate: event.endDate ?? null,
    numberOfRounds: Number(t.numberOfRounds ?? 4),
    course: venue.fullName ?? null,
    cut,
    notes: [],
  };
}

export function parseLeaderboard(payload: any): Leaderboard | null {
  const events = payload?.events ?? [];
  if (events.length === 0) return null;
  const event = events[0];
  const competitions = event.competitions ?? [];
  const competition = competitions[0] ?? {};
  const competitors = competition.competitors ?? [];

  const tournament = tournamentFromEvent(event, competition);

  const entries: LeaderboardEntry[] = competitors.map((c: any): LeaderboardEntry => {
    const status = detectStatus(c);
    const score = c.score ?? {};
    const scoreDisplay = typeof score === "object" ? score.displayValue ?? null : null;
    const scoreValue = typeof score === "object" ? score.value : undefined;
    const cStatus = c.status ?? {};
    const positionObj = cStatus.position ?? {};
    const positionDisplay =
      positionObj.displayName ?? positionObj.displayValue ?? "";

    const rounds: RoundScore[] = (c.linescores ?? []).map(parseRound);
    // Match python parser: purely structural — no round has back9 (inScore).
    const notStarted = !rounds.some((r) => r.back9 !== null);

    return {
      player: playerFromAthlete(c.athlete),
      position: null, // filled by assignPositions
      positionDisplay,
      tied: false,
      scoreToPar: parseScoreToPar(scoreDisplay),
      scoreToParDisplay: scoreDisplay,
      totalStrokes: typeof scoreValue === "number" ? Math.trunc(scoreValue) : null,
      cupPoints: parseCupPoints(c),
      status,
      notStarted,
      thru: cStatus.thru ?? null,
      thruDisplay: cStatus.displayThru ?? null,
      teeTime: cStatus.teeTime ?? null,
      rounds,
    };
  });

  assignPositions(entries);
  return { tournament, entries };
}

function assignPositions(entries: LeaderboardEntry[]): void {
  const eligible = entries.filter(
    (e) => e.status === "active" && !e.notStarted && e.scoreToPar !== null,
  );
  eligible.sort((a, b) => (a.scoreToPar! - b.scoreToPar!));

  let rank = 1;
  let prevScore: number | null = null;
  let prevPosition: number | null = null;
  for (const e of eligible) {
    if (prevScore !== null && e.scoreToPar === prevScore) {
      e.position = prevPosition;
    } else {
      e.position = rank;
      prevPosition = rank;
    }
    prevScore = e.scoreToPar;
    rank += 1;
  }

  const counts = new Map<number, number>();
  for (const e of entries) {
    if (e.position !== null) {
      counts.set(e.position, (counts.get(e.position) ?? 0) + 1);
    }
  }
  for (const e of entries) {
    e.tied = e.position !== null && (counts.get(e.position!) ?? 0) > 1;
  }
}

export function parseSchedule(payload: any, season: number): Schedule {
  const leagues = payload?.leagues ?? [];
  const calendar = leagues[0]?.calendar ?? [];
  const events = calendar.map((entry: any) => ({
    eventId: String(entry.id ?? ""),
    name: entry.label ?? "",
    startDate: (entry.startDate ?? "").slice(0, 10),
    endDate: (entry.endDate ?? "").slice(0, 10),
  }));
  return { season, events };
}

export function parseFedexStandings(payload: any, season: number): FedExStandings {
  const categories = payload?.stats?.categories ?? [];
  let leaders: any[] = [];
  for (const cat of categories) {
    if (cat?.name === "cupPoints") {
      leaders = cat.leaders ?? [];
      break;
    }
  }
  const standings = leaders.map((leader, i) => {
    const rawValue = leader.value ?? 0;
    const points = Math.trunc(Number(rawValue) || 0);
    return {
      rank: i + 1,
      player: playerFromAthlete(leader.athlete),
      points,
    };
  });
  return { season, standings };
}

export function parsePlayerHistory(
  payload: any,
  player: Player,
  season: number,
): PlayerSeasonHistory {
  const leaguesStats = payload?.leaguesStats ?? [];
  const eventsStats = leaguesStats[0]?.eventsStats ?? [];
  const results: PlayerEventResult[] = [];
  for (const ev of eventsStats) {
    const eventId = String(ev.id ?? "");
    const eventName = ev.name ?? "";
    if (!eventId) continue;
    const comps = ev.competitions ?? [];
    if (comps.length === 0) continue;
    const competitors = comps[0].competitors ?? [];
    if (competitors.length === 0) continue;
    const competitor = competitors[0];
    const positionData = competitor.status?.position ?? {};
    const positionDisplay =
      positionData.displayValue ?? positionData.displayName ?? "";
    // LOCAL DIVERGENCE FROM UPSTREAM egolfapi MIRROR:
    // Start fedex as null. Only set a numeric value if the `cupPoints` stat
    // is actually present. Lets downstream cache logic refetch when ESPN
    // hasn't published FedEx points yet (window right after a tournament ends).
    let fedex: number | null = null;
    for (const stat of competitor.stats ?? []) {
      if (stat?.name === "cupPoints") {
        const v = Number(stat.value ?? 0);
        fedex = Number.isNaN(v) ? 0 : Math.trunc(v);
        break;
      }
    }
    results.push({ player, eventId, eventName, positionDisplay, fedexPoints: fedex });
  }
  return { player, season, results };
}
