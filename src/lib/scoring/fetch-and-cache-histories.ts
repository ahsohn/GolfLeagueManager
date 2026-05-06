import type { ESPNClient, PlayerSeasonHistory } from '@/lib/egolfapi';
import { partitionByCacheFreshness, type CacheRow } from './cache-freshness';
import type { HistoryByEspnId } from './types';

export interface CacheRowRecord {
  espn_id: string;
  season: number;
  fetched_at: Date;
  payload: PlayerSeasonHistory;
}

export interface CacheIO {
  cacheRead(espnIds: string[], season: number): Promise<CacheRowRecord[]>;
  cacheUpsert(espnId: string, season: number, payload: PlayerSeasonHistory): Promise<void>;
}

export async function fetchAndCacheHistories(
  espnIds: string[],
  season: number,
  io: CacheIO,
  client: Pick<ESPNClient, 'getPlayerHistory'>,
  now: Date = new Date(),
): Promise<HistoryByEspnId> {
  const result: HistoryByEspnId = new Map();
  if (espnIds.length === 0) return result;

  const rows = await io.cacheRead(espnIds, season);
  const cache = new Map<string, CacheRow<PlayerSeasonHistory>>();
  for (const row of rows) {
    cache.set(row.espn_id, { fetched_at: row.fetched_at, payload: row.payload });
  }

  const { fresh, stale, missing } = partitionByCacheFreshness(espnIds, cache, now);

  fresh.forEach((payload, id) => result.set(id, payload));

  // Sequential awaits are intentional — ESPNClient enforces its own rate-limit
  // (delayMs) between requests. Promise.all would bypass that and risk 429/403
  // from ESPN. Do not refactor to parallel without changing the rate-limit policy.
  // Refetch stale entries; on failure, fall back to the stale payload.
  for (const id of stale) {
    try {
      const fetched = await client.getPlayerHistory(id, season);
      result.set(id, fetched);
      await io.cacheUpsert(id, season, fetched);
    } catch {
      // fall back to stale; do not bubble — partial success is fine.
      // cache.get(id) is guaranteed non-null here: id came from the stale list,
      // which only contains keys already present in the cache map.
      const stalePayload = cache.get(id)!.payload;
      result.set(id, stalePayload);
    }
  }

  // Fetch missing entries; on failure, record null.
  for (const id of missing) {
    try {
      const fetched = await client.getPlayerHistory(id, season);
      result.set(id, fetched);
      await io.cacheUpsert(id, season, fetched);
    } catch {
      result.set(id, null);
    }
  }

  return result;
}
