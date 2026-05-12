import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import StandingsGraph from '../StandingsGraph';

// Recharts' ResponsiveContainer relies on layout dimensions that jsdom doesn't
// compute. Mock it with a fixed-size wrapper so the chart SVG actually renders
// in tests (lets us assert against axis labels like "Rank"/"Points").
jest.mock('recharts', () => {
  const actual = jest.requireActual('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div style={{ width: 800, height: 400 }}>
        <actual.ResponsiveContainer width={800} height={400}>
          {children}
        </actual.ResponsiveContainer>
      </div>
    ),
  };
});

const sampleResponse = {
  tournaments: ['Open', 'Masters'],
  teams: [
    { team_id: 1, team_name: 'Alpha', color: '#A', rankings: [1, 2], cumulative_points: [100, 125] },
    { team_id: 2, team_name: 'Beta',  color: '#B', rankings: [2, 1], cumulative_points: [50, 150] },
    { team_id: 3, team_name: 'Gamma', color: '#C', rankings: [3, 3], cumulative_points: [10, 20]  },
  ],
};

beforeEach(() => {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve(sampleResponse),
    } as Response),
  ) as jest.Mock;
});

afterEach(() => {
  jest.resetAllMocks();
});

const findLegendButton = async (teamName: string) =>
  screen.findByRole('button', { name: new RegExp(teamName) });

describe('StandingsGraph', () => {
  it('renders a legend button for each team after fetch', async () => {
    render(<StandingsGraph />);
    expect(await findLegendButton('Alpha')).toBeInTheDocument();
    expect(await findLegendButton('Beta')).toBeInTheDocument();
    expect(await findLegendButton('Gamma')).toBeInTheDocument();
  });

  it('renders the empty state when the API returns no tournaments', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ tournaments: [], teams: [] }),
    });
    render(<StandingsGraph />);
    expect(
      await screen.findByText(/Graph available after first tournament completes/i),
    ).toBeInTheDocument();
  });

  describe('multi-select highlighting', () => {
    it('starts with no team dimmed (all selected)', async () => {
      render(<StandingsGraph />);
      const alpha = await findLegendButton('Alpha');
      const beta  = await findLegendButton('Beta');
      expect(alpha.className).not.toMatch(/opacity-40/);
      expect(beta.className).not.toMatch(/opacity-40/);
    });

    it('dims other teams when one is selected', async () => {
      render(<StandingsGraph />);
      const alpha = await findLegendButton('Alpha');
      const beta  = await findLegendButton('Beta');
      fireEvent.click(alpha);
      expect(alpha.className).not.toMatch(/opacity-40/);
      expect(beta.className).toMatch(/opacity-40/);
    });

    it('keeps multiple teams highlighted when two are clicked', async () => {
      render(<StandingsGraph />);
      const alpha = await findLegendButton('Alpha');
      const beta  = await findLegendButton('Beta');
      const gamma = await findLegendButton('Gamma');
      fireEvent.click(alpha);
      fireEvent.click(beta);
      expect(alpha.className).not.toMatch(/opacity-40/);
      expect(beta.className).not.toMatch(/opacity-40/);
      expect(gamma.className).toMatch(/opacity-40/);
    });

    it('deselects a team when its legend button is clicked again', async () => {
      render(<StandingsGraph />);
      const alpha = await findLegendButton('Alpha');
      const beta  = await findLegendButton('Beta');
      fireEvent.click(alpha);
      fireEvent.click(alpha);
      expect(alpha.className).not.toMatch(/opacity-40/);
      expect(beta.className).not.toMatch(/opacity-40/);
    });
  });

  describe('metric prop', () => {
    it('defaults to rank metric (Y-axis label says "Rank")', async () => {
      const { container } = render(<StandingsGraph />);
      await findLegendButton('Alpha');
      await waitFor(() => {
        expect(container.querySelector('svg')).toBeInTheDocument();
      });
      expect(container.textContent).toContain('Rank');
    });

    it('uses Points label when metric="points"', async () => {
      const { container } = render(<StandingsGraph metric="points" />);
      await findLegendButton('Alpha');
      await waitFor(() => {
        expect(container.querySelector('svg')).toBeInTheDocument();
      });
      expect(container.textContent).toContain('Points');
    });
  });
});
