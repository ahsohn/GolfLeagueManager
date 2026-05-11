import { parsePlayerHistory } from '@/lib/egolfapi/parsers';

const player = {
  espnId: '10166',
  displayName: '',
  shortName: null,
  normalizedName: '',
};

// Minimal eventsStats shape mirroring ESPN's response, with one event entry
// per test case. `cupPoints` may or may not be present on `competitor.stats`.
function buildPayload(stats: Array<{ name: string; value: unknown }> | undefined) {
  return {
    leaguesStats: [
      {
        eventsStats: [
          {
            id: '401811945',
            name: 'Truist Championship',
            competitions: [
              {
                competitors: [
                  {
                    status: { position: { displayValue: 'T5' } },
                    stats: stats,
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

describe('parsePlayerHistory cupPoints handling', () => {
  it('returns number when cupPoints stat is present with a positive value', () => {
    const history = parsePlayerHistory(buildPayload([{ name: 'cupPoints', value: 267 }]), player, 2026);
    expect(history.results[0].fedexPoints).toBe(267);
  });

  it('returns 0 when cupPoints stat is present with value 0 (legitimate zero, e.g. MC/WD)', () => {
    const history = parsePlayerHistory(buildPayload([{ name: 'cupPoints', value: 0 }]), player, 2026);
    expect(history.results[0].fedexPoints).toBe(0);
  });

  it('returns null when cupPoints stat is absent from competitor.stats (ESPN not yet published)', () => {
    const history = parsePlayerHistory(buildPayload([{ name: 'otherStat', value: 1 }]), player, 2026);
    expect(history.results[0].fedexPoints).toBeNull();
  });

  it('returns null when competitor.stats array is missing entirely', () => {
    const history = parsePlayerHistory(buildPayload(undefined), player, 2026);
    expect(history.results[0].fedexPoints).toBeNull();
  });
});
