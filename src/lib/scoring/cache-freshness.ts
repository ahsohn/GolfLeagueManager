export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface CacheRow<T> {
  fetched_at: Date;
  payload: T;
}

export interface PartitionResult<T> {
  fresh: Map<string, T>;
  stale: string[];
  missing: string[];
}

export function partitionByCacheFreshness<T>(
  ids: string[],
  cache: Map<string, CacheRow<T>>,
  now: Date,
): PartitionResult<T> {
  const fresh = new Map<string, T>();
  const stale: string[] = [];
  const missing: string[] = [];
  const cutoff = now.getTime() - CACHE_TTL_MS;

  for (const id of ids) {
    const row = cache.get(id);
    if (!row) {
      missing.push(id);
    } else if (row.fetched_at.getTime() < cutoff) {
      stale.push(id);
    } else {
      fresh.set(id, row.payload);
    }
  }

  return { fresh, stale, missing };
}
