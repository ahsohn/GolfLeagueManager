'use client';

import Link from 'next/link';
import type { TopSlotEntry } from '@/app/api/analytics/top-slots/route';

interface Props {
  slots: TopSlotEntry[];
  maxPoints: number;
}

export default function TopSlotsTable({ slots, maxPoints }: Props) {
  if (slots.length === 0) {
    return (
      <p className="text-charcoal-light italic text-center py-8">
        No tournament results yet — analytics will appear after the first tournament closes.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="standings-table w-full">
        <thead>
          <tr>
            <th className="w-12 text-left">#</th>
            <th className="text-left">Team / Slot</th>
            <th className="text-left">Golfer(s)</th>
            <th className="hidden sm:table-cell text-right w-20">Starts</th>
            <th className="text-right">Points</th>
          </tr>
        </thead>
        <tbody>
          {slots.map((s, i) => {
            const rankClass =
              i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : '';
            const widthPct = maxPoints > 0 ? (s.total_points / maxPoints) * 100 : 0;
            return (
              <tr key={`${s.team_id}-${s.slot}`} className={rankClass}>
                <td className="font-semibold text-charcoal-light">{i + 1}</td>
                <td>
                  <Link
                    href={`/team/${s.team_id}`}
                    className="font-medium hover:text-masters-green transition-colors"
                  >
                    {s.team_name}
                  </Link>
                  <div className="text-xs text-charcoal-light">Slot {s.slot}</div>
                </td>
                <td>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {s.golfers.map((g, gi) => (
                      <span
                        key={`${g.name}-${gi}`}
                        className={g.current ? 'font-semibold text-charcoal' : 'text-charcoal-light'}
                      >
                        {g.name}
                        {g.current && (
                          <span className="ml-1 text-[10px] uppercase tracking-wider bg-gold/20 text-bronze px-1.5 py-0.5 rounded-full">
                            current
                          </span>
                        )}
                        {gi < s.golfers.length - 1 && <span className="text-charcoal-light">,</span>}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="hidden sm:table-cell text-right">{s.times_started}</td>
                <td className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="flex-1 max-w-[160px] h-2 bg-cream-dark rounded-full overflow-hidden">
                      <div
                        data-testid="points-bar"
                        className="h-full bg-masters-green"
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                    <span className="font-semibold tabular-nums w-16 text-right">
                      {s.total_points.toLocaleString()}
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
