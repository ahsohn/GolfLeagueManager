import { ESPNClient } from '@/lib/egolfapi';

// Minimal ESPN /leaderboard payload: one event with two competitors.
const payload = {
  events: [
    {
      id: '401580344',
      name: 'The Masters',
      status: { type: { state: 'pre' } },
      tournament: {},
      competitions: [
        {
          venue: {},
          competitors: [
            { athlete: { id: '9478', displayName: 'Scottie Scheffler' }, status: {}, score: {}, linescores: [] },
            { athlete: { id: '8793', displayName: 'Rory McIlroy' }, status: {}, score: {}, linescores: [] },
          ],
        },
      ],
    },
  ],
};

function mockFetch(json: unknown) {
  return jest.fn().mockResolvedValue({ ok: true, json: async () => json });
}

describe('ESPNClient.getEventField', () => {
  it('parses the field into a board with one entry per competitor', async () => {
    const fetchImpl = mockFetch(payload);
    const client = new ESPNClient({ delayMs: 0, fetchImpl: fetchImpl as unknown as typeof fetch });

    const board = await client.getEventField('401580344', 2026);

    expect(board?.tournament.id).toBe('401580344');
    expect(board?.entries.map((e) => e.player.espnId)).toEqual(['9478', '8793']);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('returns null when ESPN returns no events', async () => {
    const fetchImpl = mockFetch({ events: [] });
    const client = new ESPNClient({ delayMs: 0, fetchImpl: fetchImpl as unknown as typeof fetch });

    const board = await client.getEventField('401580344', 2026);

    expect(board).toBeNull();
  });
});
