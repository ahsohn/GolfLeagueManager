import { partitionByCacheFreshness, CACHE_TTL_MS } from '@/lib/scoring/cache-freshness';

describe('partitionByCacheFreshness', () => {
  const now = new Date('2026-05-05T12:00:00Z');

  it('returns all ids as misses when cache is empty', () => {
    const { fresh, stale, missing } = partitionByCacheFreshness(['a', 'b'], new Map(), now);
    expect(missing).toEqual(['a', 'b']);
    expect(fresh.size).toBe(0);
    expect(stale).toEqual([]);
  });

  it('returns ids with cached rows < 24h old as fresh', () => {
    const cache = new Map([
      ['a', { fetched_at: new Date(now.getTime() - 1000 * 60 * 60), payload: { tag: 'A' } }],
    ]);
    const { fresh, stale, missing } = partitionByCacheFreshness(['a'], cache, now);
    expect(fresh.get('a')).toEqual({ tag: 'A' });
    expect(missing).toEqual([]);
    expect(stale).toEqual([]);
  });

  it('returns ids older than TTL as stale', () => {
    const cache = new Map([
      ['a', { fetched_at: new Date(now.getTime() - CACHE_TTL_MS - 1), payload: { tag: 'A' } }],
    ]);
    const { stale, fresh, missing } = partitionByCacheFreshness(['a'], cache, now);
    expect(stale).toEqual(['a']);
    expect(fresh.size).toBe(0);
    expect(missing).toEqual([]);
  });

  it('partitions a mix correctly', () => {
    const cache = new Map([
      ['fresh-id',  { fetched_at: new Date(now.getTime() - 1000),                   payload: { tag: 'F' } }],
      ['stale-id',  { fetched_at: new Date(now.getTime() - CACHE_TTL_MS - 1000),    payload: { tag: 'S' } }],
    ]);
    const { fresh, stale, missing } = partitionByCacheFreshness(
      ['fresh-id', 'stale-id', 'missing-id'],
      cache,
      now,
    );
    expect([...fresh.keys()]).toEqual(['fresh-id']);
    expect(stale).toEqual(['stale-id']);
    expect(missing).toEqual(['missing-id']);
  });
});
