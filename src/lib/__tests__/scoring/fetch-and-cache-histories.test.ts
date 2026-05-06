import { fetchAndCacheHistories } from '@/lib/scoring/fetch-and-cache-histories';
import type { PlayerSeasonHistory } from '@/lib/egolfapi';

function makeHistory(espnId: string, season: number): PlayerSeasonHistory {
  const player = { espnId, displayName: `Player ${espnId}`, shortName: null, normalizedName: `player ${espnId}` };
  return { player, season, results: [] };
}

describe('fetchAndCacheHistories', () => {
  const now = new Date('2026-05-05T12:00:00Z');

  it('returns fresh cache entries without calling the client', async () => {
    const cacheRead = jest.fn().mockResolvedValue([
      { espn_id: 'a', season: 2026, fetched_at: new Date(now.getTime() - 1000), payload: makeHistory('a', 2026) },
    ]);
    const cacheUpsert = jest.fn();
    const client = { getPlayerHistory: jest.fn() };

    const result = await fetchAndCacheHistories(['a'], 2026, { cacheRead, cacheUpsert }, client as any, now);

    expect(client.getPlayerHistory).not.toHaveBeenCalled();
    expect(cacheUpsert).not.toHaveBeenCalled();
    expect(result.get('a')).toEqual(makeHistory('a', 2026));
  });

  it('fetches missing entries via the client and upserts them', async () => {
    const cacheRead = jest.fn().mockResolvedValue([]);
    const cacheUpsert = jest.fn().mockResolvedValue(undefined);
    const fetched = makeHistory('b', 2026);
    const client = { getPlayerHistory: jest.fn().mockResolvedValue(fetched) };

    const result = await fetchAndCacheHistories(['b'], 2026, { cacheRead, cacheUpsert }, client as any, now);

    expect(client.getPlayerHistory).toHaveBeenCalledWith('b', 2026);
    expect(cacheUpsert).toHaveBeenCalledWith('b', 2026, fetched);
    expect(result.get('b')).toEqual(fetched);
  });

  it('refetches stale entries', async () => {
    const stale = makeHistory('c', 2026);
    const fresh = { ...stale, results: [{ player: stale.player, eventId: '401001', eventName: 'X', positionDisplay: '1', fedexPoints: 700 }] };
    const cacheRead = jest.fn().mockResolvedValue([
      { espn_id: 'c', season: 2026, fetched_at: new Date(now.getTime() - 1000 * 60 * 60 * 25), payload: stale },
    ]);
    const cacheUpsert = jest.fn().mockResolvedValue(undefined);
    const client = { getPlayerHistory: jest.fn().mockResolvedValue(fresh) };

    const result = await fetchAndCacheHistories(['c'], 2026, { cacheRead, cacheUpsert }, client as any, now);

    expect(client.getPlayerHistory).toHaveBeenCalledWith('c', 2026);
    expect(result.get('c')).toEqual(fresh);
  });

  it('records null when fetching fails for a single player', async () => {
    const cacheRead = jest.fn().mockResolvedValue([]);
    const cacheUpsert = jest.fn();
    const client = { getPlayerHistory: jest.fn().mockRejectedValue(new Error('502')) };

    const result = await fetchAndCacheHistories(['d'], 2026, { cacheRead, cacheUpsert }, client as any, now);

    expect(result.get('d')).toBeNull();
    expect(cacheUpsert).not.toHaveBeenCalled();
  });

  it('falls back to the stale payload when refetch fails', async () => {
    const stale = makeHistory('e', 2026);
    const cacheRead = jest.fn().mockResolvedValue([
      { espn_id: 'e', season: 2026, fetched_at: new Date(now.getTime() - 1000 * 60 * 60 * 25), payload: stale },
    ]);
    const cacheUpsert = jest.fn();
    const client = { getPlayerHistory: jest.fn().mockRejectedValue(new Error('timeout')) };

    const result = await fetchAndCacheHistories(['e'], 2026, { cacheRead, cacheUpsert }, client as any, now);

    expect(result.get('e')).toEqual(stale);
    expect(cacheUpsert).not.toHaveBeenCalled();
  });

  it('returns an empty map without calling io when given empty ids', async () => {
    const cacheRead = jest.fn();
    const cacheUpsert = jest.fn();
    const client = { getPlayerHistory: jest.fn() };

    const result = await fetchAndCacheHistories([], 2026, { cacheRead, cacheUpsert }, client as any, now);

    expect(result.size).toBe(0);
    expect(cacheRead).not.toHaveBeenCalled();
    expect(client.getPlayerHistory).not.toHaveBeenCalled();
    expect(cacheUpsert).not.toHaveBeenCalled();
  });

  it('handles a mix of cache hit, miss, and stale in one call', async () => {
    const histA = makeHistory('a', 2026);
    const histB = makeHistory('b', 2026);
    const histC = makeHistory('c', 2026);
    const cacheRead = jest.fn().mockResolvedValue([
      { espn_id: 'a', season: 2026, fetched_at: new Date(now.getTime() - 1000), payload: histA },
      { espn_id: 'c', season: 2026, fetched_at: new Date(now.getTime() - 1000 * 60 * 60 * 25), payload: histC },
    ]);
    const cacheUpsert = jest.fn().mockResolvedValue(undefined);
    const client = {
      getPlayerHistory: jest.fn().mockImplementation(async (id: string) => {
        if (id === 'b') return histB;
        if (id === 'c') return { ...histC, results: [{ /* updated */ } as any] };
        throw new Error('unexpected');
      }),
    };

    const result = await fetchAndCacheHistories(['a', 'b', 'c'], 2026, { cacheRead, cacheUpsert }, client as any, now);

    expect(result.get('a')).toEqual(histA);
    expect(result.get('b')).toEqual(histB);
    expect(result.get('c')?.results).toHaveLength(1);
    expect(client.getPlayerHistory).toHaveBeenCalledTimes(2); // b (miss) + c (stale)
    expect(cacheUpsert).toHaveBeenCalledTimes(2);
  });
});
