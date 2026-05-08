// src/components/__tests__/TopSlotsTable.test.tsx
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import TopSlotsTable from '../TopSlotsTable';
import type { TopSlotEntry } from '@/app/api/analytics/top-slots/route';

const sampleSlots: TopSlotEntry[] = [
  {
    team_id: 1,
    team_name: 'Birdie Hunters',
    slot: 7,
    total_points: 4250,
    times_started: 6,
    golfers: [
      { name: 'Tony Finau', current: false },
      { name: 'Scottie Scheffler', current: true },
    ],
  },
  {
    team_id: 2,
    team_name: 'Par Stars',
    slot: 3,
    total_points: 2125, // exactly half of max — used to assert bar width
    times_started: 4,
    golfers: [{ name: 'Rory McIlroy', current: true }],
  },
];

describe('TopSlotsTable', () => {
  it('renders one row per slot with team name, slot, points, and starts', () => {
    render(<TopSlotsTable slots={sampleSlots} maxPoints={4250} />);

    expect(screen.getByText('Birdie Hunters')).toBeInTheDocument();
    expect(screen.getByText('Slot 7')).toBeInTheDocument();
    expect(screen.getByText('4,250')).toBeInTheDocument();
    expect(screen.getByText('Par Stars')).toBeInTheDocument();
    expect(screen.getByText('Slot 3')).toBeInTheDocument();
    expect(screen.getByText('2,125')).toBeInTheDocument();
  });

  it('lists every golfer for a slot and tags only the current one', () => {
    render(<TopSlotsTable slots={sampleSlots} maxPoints={4250} />);

    expect(screen.getByText('Tony Finau')).toBeInTheDocument();
    expect(screen.getByText('Scottie Scheffler')).toBeInTheDocument();

    // Exactly two `current` pills (one per row, matching the golfer flagged current: true)
    const pills = screen.getAllByText(/^current$/i);
    expect(pills).toHaveLength(2);
  });

  it('scales the bar width proportional to total_points / maxPoints', () => {
    const { container } = render(
      <TopSlotsTable slots={sampleSlots} maxPoints={4250} />,
    );

    const bars = container.querySelectorAll<HTMLElement>('[data-testid="points-bar"]');
    expect(bars).toHaveLength(2);
    expect(bars[0].style.width).toBe('100%');
    expect(bars[1].style.width).toBe('50%');
  });

  it('renders the empty state when no slots are provided', () => {
    render(<TopSlotsTable slots={[]} maxPoints={0} />);
    expect(
      screen.getByText(/No tournament results yet/i),
    ).toBeInTheDocument();
  });
});
