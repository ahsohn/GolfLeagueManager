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

  it('parses per-competitor cupPoints from the leaderboard statistics', async () => {
    const withPoints = {
      events: [
        {
          id: '401811953',
          name: 'Travelers Championship',
          status: { type: { state: 'post' } },
          tournament: {},
          competitions: [
            {
              venue: {},
              competitors: [
                {
                  athlete: { id: '10592', displayName: 'Collin Morikawa' },
                  status: { type: { name: 'STATUS_FINISH' }, position: { displayName: '1' } },
                  score: { value: 264, displayValue: '-20' },
                  linescores: [],
                  statistics: [{ name: 'cupPoints', value: 350, displayValue: '350' }],
                },
                {
                  athlete: { id: '99999', displayName: 'Cut Player' },
                  status: { type: { name: 'STATUS_CUT' }, position: { displayName: '-' } },
                  score: {},
                  linescores: [],
                  statistics: [{ name: 'cupPoints', value: 0, displayValue: '0' }],
                },
                {
                  athlete: { id: '88888', displayName: 'No Stats Player' },
                  status: {},
                  score: {},
                  linescores: [],
                },
              ],
            },
          ],
        },
      ],
    };
    const fetchImpl = mockFetch(withPoints);
    const client = new ESPNClient({ delayMs: 0, fetchImpl: fetchImpl as unknown as typeof fetch });

    const board = await client.getEventField('401811953', 2026);
    const byId = new Map(board!.entries.map((e) => [e.player.espnId, e]));

    expect(byId.get('10592')!.cupPoints).toBe(350);
    expect(byId.get('99999')!.cupPoints).toBe(0); // legitimate 0 (missed cut)
    expect(byId.get('88888')!.cupPoints).toBeNull(); // stat absent
  });
});
