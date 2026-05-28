// HTTP client — same behavior as python/src/egolfapi/client.py.

import {
  DEFAULT_USER_AGENT,
  LEADERBOARD_URL,
  PLAYER_STATS_URL,
  SCOREBOARD_URL,
  STATISTICS_URL,
} from "./endpoints";
import {
  parseFedexStandings,
  parseLeaderboard,
  parsePlayerHistory,
  parseSchedule,
} from "./parsers";
import { normalizeName } from "./normalize";
import type {
  FedExStandings,
  Leaderboard,
  Player,
  PlayerSeasonHistory,
  Schedule,
  Tournament,
} from "./types";

export interface ClientOptions {
  delayMs?: number;
  retries?: number;
  backoff?: number;
  timeoutMs?: number;
  userAgent?: string;
  fetchImpl?: typeof fetch;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export class ESPNClient {
  private delayMs: number;
  private retries: number;
  private backoff: number;
  private timeoutMs: number;
  private userAgent: string;
  private fetchImpl: typeof fetch;
  private lastRequestTime = 0;

  constructor(opts: ClientOptions = {}) {
    this.delayMs = opts.delayMs ?? 1500;
    this.retries = opts.retries ?? 3;
    this.backoff = opts.backoff ?? 2;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.userAgent = opts.userAgent ?? DEFAULT_USER_AGENT;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private async rateLimit(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestTime;
    if (elapsed < this.delayMs) {
      await sleep(this.delayMs - elapsed);
    }
    this.lastRequestTime = Date.now();
  }

  async request(url: string, params?: Record<string, string | number>): Promise<any> {
    await this.rateLimit();
    const fullUrl = params
      ? `${url}?${new URLSearchParams(
          Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
        ).toString()}`
      : url;

    let lastError: unknown;
    for (let attempt = 0; attempt < this.retries; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
          const resp = await this.fetchImpl(fullUrl, {
            headers: { "User-Agent": this.userAgent, Accept: "application/json" },
            signal: controller.signal,
          });
          if (!resp.ok) {
            throw new Error(`HTTP ${resp.status} for ${fullUrl}`);
          }
          return await resp.json();
        } finally {
          clearTimeout(timer);
        }
      } catch (e) {
        lastError = e;
        if (attempt < this.retries - 1) {
          await sleep(Math.pow(this.backoff, attempt) * 1000);
        }
      }
    }
    throw lastError;
  }

  // --- High-level domain methods -----------------------------------------

  async getLeaderboard(): Promise<Leaderboard | null> {
    return parseLeaderboard(await this.request(LEADERBOARD_URL));
  }

  // Single direct leaderboard call for one event's field. Unlike
  // getHistoricalLeaderboard, this never falls back to player-aggregation
  // (which fires dozens of requests) — it is meant for interactive use.
  async getEventField(
    eventId: string,
    season: number,
  ): Promise<Leaderboard | null> {
    const payload = await this.request(LEADERBOARD_URL, { event: eventId, season });
    return parseLeaderboard(payload);
  }

  async getSchedule(season: number): Promise<Schedule> {
    return parseSchedule(await this.request(SCOREBOARD_URL), season);
  }

  async getFedexStandings(season: number): Promise<FedExStandings> {
    return parseFedexStandings(await this.request(STATISTICS_URL), season);
  }

  async getPlayerHistory(
    athleteId: string,
    season: number,
    displayName = "",
    shortName: string | null = null,
  ): Promise<PlayerSeasonHistory> {
    const url = PLAYER_STATS_URL.replace("{athleteId}", athleteId);
    const payload = await this.request(url, { season });
    const player: Player = {
      espnId: String(athleteId),
      displayName,
      shortName,
      normalizedName: normalizeName(displayName),
    };
    return parsePlayerHistory(payload, player, season);
  }

  async getHistoricalLeaderboard(
    eventId: string,
    season?: number,
  ): Promise<Leaderboard | null> {
    const params: Record<string, string | number> = { event: eventId };
    if (season !== undefined) params.season = season;
    try {
      const payload = await this.request(LEADERBOARD_URL, params);
      const board = parseLeaderboard(payload);
      if (board && board.tournament.id === String(eventId)) {
        board.tournament.notes.push("source: direct /leaderboard?event=");
        return board;
      }
    } catch {
      // fall through to aggregation
    }
    return this.historicalLeaderboardFromAggregation(eventId, season);
  }

  private async historicalLeaderboardFromAggregation(
    eventId: string,
    season: number | undefined,
  ): Promise<Leaderboard | null> {
    const seasonResolved = season ?? new Date().getFullYear();
    const standings = await this.getFedexStandings(seasonResolved);
    const matched: Array<{ player: Player; positionDisplay: string }> = [];
    let eventName = "";

    for (const s of standings.standings) {
      try {
        const history = await this.getPlayerHistory(
          s.player.espnId,
          seasonResolved,
          s.player.displayName,
          s.player.shortName,
        );
        for (const r of history.results) {
          if (r.eventId === String(eventId)) {
            matched.push({ player: s.player, positionDisplay: r.positionDisplay });
            if (!eventName) eventName = r.eventName;
            break;
          }
        }
      } catch {
        // continue — some players may not have a history fetchable
      }
    }

    if (matched.length === 0) return null;

    const entries = matched.map(({ player, positionDisplay }) => ({
      player,
      position: null as number | null,
      positionDisplay,
      tied: false,
      scoreToPar: null,
      scoreToParDisplay: null,
      totalStrokes: null,
      status:
        positionDisplay === "MC"
          ? ("cut" as const)
          : positionDisplay === "WD"
            ? ("wd" as const)
            : ("active" as const),
      notStarted: false,
      thru: null,
      thruDisplay: null,
      teeTime: null,
      rounds: [],
    }));

    const posKey = (s: string) => {
      const stripped = s.startsWith("T") ? s.slice(1) : s;
      const n = parseInt(stripped, 10);
      return Number.isNaN(n) ? 9999 : n;
    };
    entries.sort((a, b) => posKey(a.positionDisplay) - posKey(b.positionDisplay));
    for (const e of entries) {
      const stripped = e.positionDisplay.startsWith("T")
        ? e.positionDisplay.slice(1)
        : e.positionDisplay;
      const n = parseInt(stripped, 10);
      e.position = Number.isNaN(n) ? null : n;
      if (e.positionDisplay.startsWith("T")) e.tied = true;
    }

    const tournament: Tournament = {
      id: String(eventId),
      name: eventName,
      isMajor: false,
      status: "complete",
      startDate: null,
      endDate: null,
      numberOfRounds: 4,
      course: null,
      cut: null,
      notes: [
        "source: player-aggregation fallback",
        `roster: FedEx top ${standings.standings.length} — may miss non-members`,
        "rounds: not available via player-history endpoint",
      ],
    };
    return { tournament, entries };
  }
}
